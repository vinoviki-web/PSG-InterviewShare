import { request, viewer, requireViewer, ApiError, db } from './client'
import { companyBySlug, userById, nowIso } from '@/mocks/db'
import { DEPARTMENT, TOPIC } from '@/mocks/lookups'
import { DOMAIN } from '@/lib/taxonomy'
import { readingMinutes } from '@/lib/utils'

const isMod = (v) => v?.roles?.some((r) => r === 'moderator' || r === 'admin')
const isAdmin = (v) => v?.roles?.includes('admin')

/** Can the viewer read this experience? Mirrors the planned RLS policy. */
export function canRead(e, v) {
  if (!v) return false
  if (e.status === 'published') return true
  if (e.author_id === v.id) return e.status !== 'removed' || isAdmin(v)
  return isMod(v) && e.status !== 'draft'
}

/**
 * Shapes a row the way the masked `experience_feed` view will:
 * anonymous authors are null unless the viewer is the author or an admin.
 */
export function serializeExperience(e, v = viewer(), { full = false } = {}) {
  const company = companyBySlug(e.company_slug)
  const authorUser = userById(e.author_id)
  const own = v?.id === e.author_id
  const showAuthor = !e.is_anonymous || own || (isAdmin(v) && full === 'admin')
  const questions = e.rounds.flatMap((r) => r.questions)
  const base = {
    id: e.id,
    company: company && { id: company.id, slug: company.slug, name: company.name, is_verified: company.is_verified },
    role_title: e.role_title,
    domain: DOMAIN[e.domain_id] ?? null,
    opportunity_type: e.opportunity_type,
    hiring_mode: e.hiring_mode,
    department: e.hide_department && !own ? null : DEPARTMENT[e.department_id] ?? null,
    graduation_year: e.graduation_year,
    interview_month: e.interview_month,
    difficulty: e.difficulty,
    outcome: e.outcome,
    is_anonymous: e.is_anonymous,
    hide_department: e.hide_department,
    status: e.status,
    hidden_reason: own || isMod(v) ? e.hidden_reason : undefined,
    published_at: e.published_at,
    updated_at: e.updated_at,
    edited: e.edited,
    helpful_count: e.helpful_count,
    view_count: e.view_count,
    comment_count: db.comments.filter((c) => c.experience_id === e.id && c.status === 'visible').length,
    topics: e.topics.map((t) => TOPIC[t]).filter(Boolean),
    pipeline: e.rounds.map((r) => ({ type: r.round_type, mode: r.mode, difficulty: r.difficulty })),
    question_count: questions.length,
    excerpt: (e.advice || e.preparation || '').replace(/[*`_#>]/g, '').slice(0, 220),
    reading_minutes: readingMinutes(e.application_process, e.preparation, e.advice, ...e.rounds.map((r) => r.description), ...questions.map((q) => q.body)),
    author: showAuthor && authorUser ? { id: authorUser.id, full_name: authorUser.full_name, handle: authorUser.handle } : null,
    is_owner: own,
    has_voted: !!v && db.votes.some((x) => x.user_id === v.id && x.experience_id === e.id),
    has_saved: !!v && db.bookmarks.some((x) => x.user_id === v.id && x.experience_id === e.id),
  }
  if (!full) return base
  return {
    ...base,
    eligibility: e.eligibility,
    application_process: e.application_process,
    preparation: e.preparation,
    resources: e.resources,
    advice: e.advice,
    rounds: e.rounds.map((r) => ({
      ...r,
      questions: r.questions.map((q) => ({ ...q, topics: q.topics.map((t) => TOPIC[t]).filter(Boolean), also_in: alsoIn(q.body, e.id) })),
    })),
  }
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
export function alsoIn(body, excludeId) {
  const n = norm(body)
  return db.experiences.filter((x) => x.id !== excludeId && x.status === 'published' && x.rounds.some((r) => r.questions.some((q) => norm(q.body) === n))).map((x) => x.id)
}

/* ---------------- Search ---------------- */
function matches(e, q) {
  if (!q) return 1
  const co = companyBySlug(e.company_slug)
  const terms = q.toLowerCase().split(/\s+/).filter((x) => x.length > 1)
  let score = 0
  for (const term of terms) {
    let hit = 0
    if (co.name.toLowerCase().includes(term) || co.aliases.some((a) => a.toLowerCase().includes(term))) hit = 3
    else if (e.role_title.toLowerCase().includes(term)) hit = 3
    else if (e.topics.some((t) => TOPIC[t]?.label.toLowerCase().includes(term))) hit = 2
    else if (e.rounds.some((r) => r.questions.some((qq) => qq.body.toLowerCase().includes(term)))) hit = 2
    else if (`${e.advice} ${e.preparation} ${e.rounds.map((r) => r.description).join(' ')}`.toLowerCase().includes(term)) hit = 1
    if (!hit) return 0
    score += hit
  }
  return score
}

const arr = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(','))

/**
 * params: { q, domain[], company[], type[], hiring[], outcome[], difficulty[], dept[], year[], round[], sort, cursor, limit, author }
 * returns { items, total, nextCursor }
 */
function mock_searchExperiences(params = {}) {
  return request(
    () => {
      const v = requireViewer()
      const f = {
        domain: arr(params.domain), company: arr(params.company), type: arr(params.type), hiring: arr(params.hiring), outcome: arr(params.outcome),
        difficulty: arr(params.difficulty).map(Number), dept: arr(params.dept), year: arr(params.year).map(Number), round: arr(params.round),
      }
      let rows = db.experiences
        .filter((e) => e.status === 'published')
        .filter((e) => !f.domain.length || f.domain.includes(e.domain_id))
        .filter((e) => !f.company.length || f.company.includes(e.company_slug))
        .filter((e) => !f.type.length || f.type.includes(e.opportunity_type))
        .filter((e) => !f.hiring.length || f.hiring.includes(e.hiring_mode))
        .filter((e) => !f.outcome.length || f.outcome.includes(e.outcome))
        .filter((e) => !f.difficulty.length || f.difficulty.includes(e.difficulty))
        .filter((e) => !f.dept.length || (!e.hide_department && f.dept.includes(e.department_id)))
        .filter((e) => !f.year.length || f.year.includes(e.graduation_year))
        .filter((e) => !f.round.length || f.round.every((rt) => e.rounds.some((r) => r.round_type === rt)))
        .filter((e) => !params.exclude || e.id !== params.exclude)
        .map((e) => ({ e, s: matches(e, params.q?.trim()) }))
        .filter((x) => x.s > 0)
      const sort = params.sort ?? 'latest'
      rows.sort((a, b) => {
        if (params.q && sort === 'relevance') return b.s - a.s
        if (sort === 'helpful') return b.e.helpful_count - a.e.helpful_count || b.e.published_at.localeCompare(a.e.published_at)
        if (sort === 'read') return b.e.view_count - a.e.view_count
        return b.e.published_at.localeCompare(a.e.published_at)
      })
      const limit = Number(params.limit ?? 20)
      const offset = Number(params.cursor ?? 0)
      const page = rows.slice(offset, offset + limit).map((x) => serializeExperience(x.e, v))
      return { items: page, total: rows.length, nextCursor: offset + limit < rows.length ? offset + limit : null }
    },
    { list: true },
  )
}

/** Facet counts for the filter rail (computed over published rows). */
function mock_getFacets() {
  return request(() => {
    requireViewer()
    const pub = db.experiences.filter((e) => e.status === 'published')
    const count = (key) => pub.reduce((m, e) => ((m[e[key]] = (m[e[key]] ?? 0) + 1), m), {})
    return {
      domain: count('domain_id'),
      type: count('opportunity_type'),
      hiring: count('hiring_mode'),
      outcome: count('outcome'),
      difficulty: count('difficulty'),
      year: count('graduation_year'),
      dept: count('department_id'),
    }
  })
}

function mock_getExperience(id) {
  return request(() => {
    const v = requireViewer()
    const e = db.experiences.find((x) => x.id === id)
    if (!e || !canRead(e, v)) throw new ApiError('This experience was removed or never existed.', { code: 'not_found' })
    return serializeExperience(e, v, { full: true })
  })
}

function mock_getRelated(id) {
  return request(
    () => {
      const v = requireViewer()
      const e = db.experiences.find((x) => x.id === id)
      if (!e) return []
      const pub = db.experiences.filter((x) => x.status === 'published' && x.id !== id)
      const same = pub.filter((x) => x.company_slug === e.company_slug)
      const similar = pub.filter((x) => x.company_slug !== e.company_slug && x.opportunity_type === e.opportunity_type && x.topics.some((t) => e.topics.includes(t)))
      return [...same, ...similar].slice(0, 4).map((x) => serializeExperience(x, v))
    },
    { list: [] },
  )
}

function mock_recordView(id) {
  return request(
    () => {
      const v = viewer()
      if (!v) return null
      const e = db.experiences.find((x) => x.id === id)
      if (!e) return null
      const existing = db.views.find((x) => x.user_id === v.id && x.experience_id === id)
      const dayAgo = Date.now() - 86400000
      if (!existing) {
        db.views.push({ user_id: v.id, experience_id: id, last_viewed_at: nowIso() })
        e.view_count++
      } else {
        if (new Date(existing.last_viewed_at).getTime() < dayAgo) e.view_count++
        existing.last_viewed_at = nowIso()
      }
      return true
    },
    { write: true },
  )
}

function mock_getRecentlyViewed(limit = 4) {
  return request(
    () => {
      const v = requireViewer()
      return db.views
        .filter((x) => x.user_id === v.id)
        .sort((a, b) => b.last_viewed_at.localeCompare(a.last_viewed_at))
        .map((x) => db.experiences.find((e) => e.id === x.experience_id))
        .filter((e) => e && e.status === 'published')
        .slice(0, limit)
        .map((e) => serializeExperience(e, v))
    },
    { list: [] },
  )
}

function mock_getSaved() {
  return request(
    () => {
      const v = requireViewer()
      return db.bookmarks
        .filter((b) => b.user_id === v.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((b) => {
          const e = db.experiences.find((x) => x.id === b.experience_id)
          if (!e || e.status !== 'published') return { id: b.experience_id, unavailable: true, saved_at: b.created_at }
          return { ...serializeExperience(e, v), saved_at: b.created_at }
        })
    },
    { list: [] },
  )
}

function mock_getMyExperiences() {
  return request(
    () => {
      const v = requireViewer()
      return db.experiences
        .filter((e) => e.author_id === v.id && e.status !== 'draft' && e.status !== 'removed')
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .map((e) => serializeExperience(e, v))
    },
    { list: [] },
  )
}

function mock_deleteExperience(id) {
  return request(
    () => {
      const v = requireViewer()
      const e = db.experiences.find((x) => x.id === id)
      if (!e || e.author_id !== v.id) throw new ApiError('You can only delete your own experiences', { code: 'forbidden' })
      e.status = 'removed'
      e.deleted_at = nowIso()
      return true
    },
    { write: true },
  )
}

function mock_toggleHelpful(id) {
  return request(
    () => {
      const v = requireViewer()
      const e = db.experiences.find((x) => x.id === id)
      if (!e) throw new ApiError('Not found', { code: 'not_found' })
      if (e.author_id === v.id) throw new ApiError('You can’t mark your own experience as helpful')
      const i = db.votes.findIndex((x) => x.user_id === v.id && x.experience_id === id)
      if (i >= 0) {
        db.votes.splice(i, 1)
        e.helpful_count = Math.max(0, e.helpful_count - 1)
      } else {
        db.votes.push({ user_id: v.id, experience_id: id, created_at: nowIso() })
        e.helpful_count++
      }
      return { has_voted: i < 0, helpful_count: e.helpful_count }
    },
    { write: true },
  )
}

function mock_toggleBookmark(id) {
  return request(
    () => {
      const v = requireViewer()
      const i = db.bookmarks.findIndex((x) => x.user_id === v.id && x.experience_id === id)
      if (i >= 0) db.bookmarks.splice(i, 1)
      else db.bookmarks.push({ user_id: v.id, experience_id: id, created_at: nowIso() })
      return { has_saved: i < 0 }
    },
    { write: true },
  )
}

/* ---- Data-source switch (Phase 4): real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_experiences from './sb/mine'
export const getMyExperiences = __USE_SB ? __sb_experiences.getMyExperiences : mock_getMyExperiences
export const getSaved = __USE_SB ? __sb_experiences.getSaved : mock_getSaved
import * as __sb_browse from './sb/experiences'
export const searchExperiences = __USE_SB ? __sb_browse.searchExperiences : mock_searchExperiences
export const getFacets = __USE_SB ? __sb_browse.getFacets : mock_getFacets
export const getExperience = __USE_SB ? __sb_browse.getExperience : mock_getExperience
export const getRelated = __USE_SB ? __sb_browse.getRelated : mock_getRelated
export const recordView = __USE_SB ? __sb_browse.recordView : mock_recordView
export const getRecentlyViewed = __USE_SB ? __sb_browse.getRecentlyViewed : mock_getRecentlyViewed
export const deleteExperience = __USE_SB ? __sb_browse.deleteExperience : mock_deleteExperience
export const toggleHelpful = __USE_SB ? __sb_browse.toggleHelpful : mock_toggleHelpful
export const toggleBookmark = __USE_SB ? __sb_browse.toggleBookmark : mock_toggleBookmark
