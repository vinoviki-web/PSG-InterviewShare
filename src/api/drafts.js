/**
 * Share-wizard API: drafts, duplicate check, publish and edit.
 * Mirrors the planned `save_draft(payload)` / `publish_experience(id)` RPCs:
 * one transaction per call, child rows (rounds, questions) replaced wholesale,
 * the same validation rules as the client zod schema enforced again here.
 */
import { request, requireViewer, ApiError, db } from './client'
import { newId, nowIso, companyBySlug, audit } from '@/mocks/db'
import { DEPARTMENT, TOPIC } from '@/mocks/lookups'
import { OPPORTUNITY_TYPES, HIRING_MODES, OUTCOMES, ROUND_TYPES, QUESTION_KINDS, RESOURCE_KINDS } from '@/lib/constants'
import { slugify } from '@/lib/utils'

/** Single source for every limit. The client schema imports these too. */
export const LIMITS = {
  role_title: [2, 100],
  application_process: 2000,
  eligibility_other: 300,
  rounds: 12,
  questions: 25,
  round_description: 5000,
  round_description_min: 30,
  question_body: [5, 2000],
  question_topics: 5,
  topics: 15,
  preparation: 5000,
  resources: 15,
  resource_title: [2, 120],
  advice: 3000,
  duplicate_reason: [5, 200],
  first_year: 2015,
}

export const TOTAL_STEPS = 5
const DRAFT_TTL_DAYS = 90

const vals = (list) => list.map((x) => x.value)
const OPP = vals(OPPORTUNITY_TYPES)
const HIRE = vals(HIRING_MODES)
const OUT = vals(OUTCOMES)
const RTYPE = vals(ROUND_TYPES)
const QKINDS = vals(QUESTION_KINDS)
const RKINDS = vals(RESOURCE_KINDS)

/* ---------------- Sanitizing (drafts accept incomplete content) ---------------- */
const str = (v, max = 10000) => (typeof v === 'string' ? v.slice(0, max) : '')
const oneOf = (v, list) => (list.includes(v) ? v : null)
const int = (v, lo, hi) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null
}
const safeId = (v, prefix) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : newId(prefix))
const isHttps = (u) => {
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}
const monthOk = (m) => typeof m === 'string' && /^\d{4}-\d{2}-01$/.test(m)

function sanitizeContent(p) {
  const el = p.eligibility
  const cgpa = el && el.cgpa !== '' && el.cgpa != null ? Number(el.cgpa) : null
  const eligibility = el
    ? {
        cgpa: Number.isFinite(cgpa) && cgpa >= 0 && cgpa <= 10 ? Math.round(cgpa * 100) / 100 : null,
        branches: Array.isArray(el.branches) ? el.branches.filter((b) => DEPARTMENT[b]).slice(0, 30) : [],
        backlogs: oneOf(el.backlogs, ['no', 'yes', 'unknown']) ?? 'unknown',
        other: str(el.other, LIMITS.eligibility_other).trim(),
      }
    : null
  const emptyEl = !eligibility || (eligibility.cgpa == null && !eligibility.branches.length && eligibility.backlogs === 'unknown' && !eligibility.other)
  return {
    company_slug: p.company_slug && companyBySlug(p.company_slug) ? p.company_slug : null,
    new_company_name: p.company_slug ? null : str(p.new_company_name, 80).trim() || null,
    role_title: str(p.role_title, 140),
    opportunity_type: oneOf(p.opportunity_type, OPP),
    hiring_mode: oneOf(p.hiring_mode, HIRE),
    interview_month: monthOk(p.interview_month) ? p.interview_month : null,
    department_id: DEPARTMENT[p.department_id] ? p.department_id : null,
    graduation_year: int(p.graduation_year, 2000, 2100),
    eligibility: emptyEl ? null : eligibility,
    application_process: str(p.application_process, LIMITS.application_process * 1.2),
    rounds: (Array.isArray(p.rounds) ? p.rounds : []).slice(0, LIMITS.rounds + 2).map((r, i) => {
      const id = safeId(r.id, 'r')
      return {
        id,
        position: i + 1,
        round_type: oneOf(r.round_type, RTYPE),
        mode: oneOf(r.mode, ['online', 'offline']) ?? 'online',
        duration_minutes: int(r.duration_minutes, 1, 600),
        difficulty: int(r.difficulty, 1, 5),
        description: str(r.description, LIMITS.round_description * 1.2),
        questions: (Array.isArray(r.questions) ? r.questions : []).slice(0, LIMITS.questions + 5).map((q, j) => ({
          id: safeId(q.id, 'q'),
          round_id: id,
          position: j + 1,
          body: str(q.body, LIMITS.question_body[1] * 1.2),
          kind: oneOf(q.kind, QKINDS) ?? 'technical',
          topics: (Array.isArray(q.topics) ? q.topics : []).filter((t) => TOPIC[t]).slice(0, LIMITS.question_topics),
        })),
      }
    }),
    topics: (Array.isArray(p.topics) ? [...new Set(p.topics)] : []).filter((t) => TOPIC[t]).slice(0, LIMITS.topics + 5),
    preparation: str(p.preparation, LIMITS.preparation * 1.2),
    resources: (Array.isArray(p.resources) ? p.resources : []).slice(0, LIMITS.resources + 5).map((r) => ({
      title: str(r.title, 160),
      url: str(r.url, 600).trim(),
      kind: oneOf(r.kind, RKINDS) ?? 'other',
    })),
    difficulty: int(p.difficulty, 1, 5),
    outcome: oneOf(p.outcome, OUT),
    advice: str(p.advice, LIMITS.advice * 1.2),
    is_anonymous: !!p.is_anonymous,
    hide_department: !!p.is_anonymous && !!p.hide_department,
    confirmed: !!p.confirmed,
    duplicate_of: typeof p.duplicate_of === 'string' ? p.duplicate_of : null,
    duplicate_reason: str(p.duplicate_reason, LIMITS.duplicate_reason[1]).trim() || null,
  }
}

/* ---------------- Server-side validation (mirrors the zod schema) ---------------- */
export function validateForPublish(e) {
  const f = {}
  const now = new Date()
  if (!e.company_slug && !(e.new_company_name?.trim().length >= 2)) f.company = 'Choose the company, or add it if it isn’t listed.'
  const role = e.role_title?.trim() ?? ''
  if (role.length < LIMITS.role_title[0] || role.length > LIMITS.role_title[1]) f.role_title = 'Use 2–100 characters for the role title.'
  if (!OPP.includes(e.opportunity_type)) f.opportunity_type = 'Choose the opportunity type.'
  if (!HIRE.includes(e.hiring_mode)) f.hiring_mode = 'Choose the hiring mode.'
  if (!monthOk(e.interview_month)) f.interview_month = 'Choose the month you interviewed.'
  else {
    const [y, m] = e.interview_month.split('-').map(Number)
    if (y < LIMITS.first_year) f.interview_month = 'Choose a month from 2015 onwards.'
    else if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) f.interview_month = 'That month is in the future.'
  }
  if (!DEPARTMENT[e.department_id]) f.department_id = 'Choose your department.'
  if (!e.graduation_year) f.graduation_year = 'Choose your batch.'
  if ((e.application_process ?? '').length > LIMITS.application_process) f.application_process = 'Keep this under 2,000 characters.'
  if (e.eligibility?.other?.length > LIMITS.eligibility_other) f['eligibility.other'] = 'Keep this under 300 characters.'
  if (!e.rounds.length) f.rounds = 'Add at least one round so readers know the process.'
  if (e.rounds.length > LIMITS.rounds) f.rounds = `You can add up to ${LIMITS.rounds} rounds.`
  e.rounds.forEach((r, i) => {
    if (!RTYPE.includes(r.round_type)) f[`rounds.${i}.round_type`] = 'Choose the round type.'
    if (r.description.length > LIMITS.round_description) f[`rounds.${i}.description`] = 'Keep this under 5,000 characters.'
    else if (r.description.trim().length < LIMITS.round_description_min && r.questions.length === 0)
      f[`rounds.${i}.description`] = 'Describe this round in at least 30 characters, or add a question.'
    if (r.questions.length > LIMITS.questions) f[`rounds.${i}.questions`] = `Up to ${LIMITS.questions} questions per round.`
    r.questions.forEach((q, j) => {
      const len = q.body.trim().length
      if (len < LIMITS.question_body[0]) f[`rounds.${i}.questions.${j}.body`] = 'Write the question, or remove it.'
      else if (len > LIMITS.question_body[1]) f[`rounds.${i}.questions.${j}.body`] = 'Keep each question under 2,000 characters.'
    })
  })
  if (e.topics.length > LIMITS.topics) f.topics = `Pick up to ${LIMITS.topics} topics.`
  if (e.preparation.length > LIMITS.preparation) f.preparation = 'Keep this under 5,000 characters.'
  if (e.resources.length > LIMITS.resources) f.resources = `Add up to ${LIMITS.resources} resources.`
  e.resources.forEach((r, i) => {
    if (r.title.trim().length < LIMITS.resource_title[0]) f[`resources.${i}.title`] = 'Add a title for this resource.'
    if (!isHttps(r.url)) f[`resources.${i}.url`] = 'Use a full https:// link.'
  })
  if (!e.difficulty) f.difficulty = 'Rate the overall difficulty.'
  if (!OUT.includes(e.outcome)) f.outcome = 'Choose your result.'
  if (e.advice.length > LIMITS.advice) f.advice = 'Keep this under 3,000 characters.'
  if (!e.confirmed) f.confirmed = 'Confirm this is your own experience to publish.'
  if (e.is_anonymous && !db.settings.flags.anonymous_posting) f.is_anonymous = 'Anonymous posting is turned off right now.'
  return f
}

/* ---------------- Helpers ---------------- */
function ownRow(id, v) {
  const e = db.experiences.find((x) => x.id === id)
  if (!e || e.status === 'removed') throw new ApiError('This draft doesn’t exist or was deleted.', { code: 'not_found' })
  if (e.author_id !== v.id) throw new ApiError('You can only edit your own experiences.', { code: 'forbidden' })
  return e
}

/** Row shape the wizard loads (DB columns, topic slugs, child rows). */
const forEditor = (e) => ({
  ...structuredClone(e),
  company: e.company_slug ? { slug: e.company_slug, name: companyBySlug(e.company_slug)?.name ?? e.company_slug } : null,
})

const companyName = (e) => (e.company_slug ? companyBySlug(e.company_slug)?.name : e.new_company_name) ?? null

/* ---------------- Public API ---------------- */

/**
 * The viewer's drafts, newest first.
 * Items: { id, company_name, company_slug, role_title, draft_step, total_steps, updated_at, created_at }
 */
function mock_listMyDrafts() {
  return request(
    () => {
      const v = requireViewer()
      const cutoff = Date.now() - DRAFT_TTL_DAYS * 86400000
      return db.experiences
        .filter((e) => e.author_id === v.id && e.status === 'draft' && new Date(e.updated_at).getTime() > cutoff)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((e) => ({
          id: e.id,
          company_name: companyName(e),
          company_slug: e.company_slug ?? null,
          role_title: e.role_title || null,
          draft_step: e.draft_step ?? 1,
          total_steps: TOTAL_STEPS,
          updated_at: e.updated_at,
          created_at: e.created_at,
        }))
    },
    { list: [] },
  )
}

/** Owner-only. A published row throws code 'published' so callers can switch to edit mode. */
function mock_getDraft(id) {
  return request(() => {
    const v = requireViewer()
    const e = ownRow(id, v)
    if (e.status !== 'draft') throw new ApiError('This experience is already published.', { code: 'published' })
    return forEditor(e)
  })
}

/** Owner-only load of a published (or hidden) experience for the edit flow. */
function mock_getExperienceForEdit(id) {
  return request(() => {
    const v = requireViewer()
    const e = ownRow(id, v)
    if (e.status === 'draft') throw new ApiError('This is still a draft.', { code: 'draft' })
    return forEditor(e)
  })
}

/**
 * Creates (no id) or updates a draft. Child rows are replaced in one go.
 * Returns { id, updated_at }.
 */
function mock_saveDraft(payload) {
  return request(
    () => {
      const v = requireViewer()
      const content = sanitizeContent(payload)
      const step = int(payload.draft_step, 1, TOTAL_STEPS) ?? 1
      const maxStep = Math.max(step, int(payload.draft_max_step, 1, TOTAL_STEPS) ?? 1)
      const ts = nowIso()
      if (payload.id) {
        const e = ownRow(payload.id, v)
        if (e.status !== 'draft') throw new ApiError('Published experiences are updated with Update, not saved as drafts.', { code: 'published' })
        Object.assign(e, content, { draft_step: step, draft_max_step: Math.max(maxStep, e.draft_max_step ?? 1), updated_at: ts })
        return { id: e.id, updated_at: ts }
      }
      const id = newId('exp')
      db.experiences.push({
        id,
        author_id: v.id,
        ...content,
        status: 'draft',
        draft_step: step,
        draft_max_step: maxStep,
        published_at: null,
        created_at: ts,
        updated_at: ts,
        edited: false,
        version: 0,
        helpful_count: 0,
        view_count: 0,
      })
      return { id, updated_at: ts }
    },
    { write: true },
  )
}

/**
 * Same company + role + type + batch from the same author (not removed).
 * Returns { id, status, company_name, role_title, graduation_year } or null.
 */
function mock_checkDuplicate({ company_slug, role_title, opportunity_type, graduation_year, excludeId }) {
  return request(() => {
    const v = requireViewer()
    if (!company_slug || !role_title) return null
    const role = role_title.trim().toLowerCase().replace(/\s+/g, ' ')
    const hit = db.experiences.find(
      (e) =>
        e.author_id === v.id &&
        e.id !== excludeId &&
        e.status !== 'removed' &&
        e.company_slug === company_slug &&
        (e.role_title ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === role &&
        e.opportunity_type === opportunity_type &&
        Number(e.graduation_year) === Number(graduation_year),
    )
    if (!hit) return null
    return { id: hit.id, status: hit.status, company_name: companyName(hit), role_title: hit.role_title, graduation_year: hit.graduation_year }
  })
}

/**
 * Publishes a draft, or updates a published experience.
 * `changes` (optional): full wizard payload applied atomically before validation.
 * Fails with ApiError { code: 'validation', fields } or { code: 'rate_limited' }.
 * Returns { id, status, published_at, updated_at, edited, created_company }.
 */
function mock_publishExperience(id, changes) {
  return request(
    () => {
      const v = requireViewer()
      const e = ownRow(id, v)
      if (!['draft', 'published', 'hidden'].includes(e.status)) throw new ApiError('This experience can’t be published.', { code: 'forbidden' })
      const isUpdate = e.status !== 'draft'
      const candidate = changes ? { ...e, ...sanitizeContent(changes) } : e

      const fields = validateForPublish(candidate)
      if (Object.keys(fields).length) throw new ApiError('A few things need fixing before this can go live.', { code: 'validation', fields })

      if (!isUpdate) {
        const since = Date.now() - 86400000
        const n = db.experiences.filter((x) => x.author_id === v.id && x.published_at && new Date(x.published_at).getTime() > since).length
        const max = db.settings.limits.publish_per_day
        if (n >= max) throw new ApiError(`You’ve published ${max} experiences in the last 24 hours. Try again tomorrow; your draft is saved.`, { code: 'rate_limited' })
      }

      let created_company = null
      if (!candidate.company_slug && candidate.new_company_name) {
        if (!db.settings.flags.new_companies) {
          throw new ApiError('Adding new companies is turned off right now.', { code: 'validation', fields: { company: 'Pick a company from the list.' } })
        }
        const name = candidate.new_company_name.trim()
        const slug = slugify(name) || newId('co')
        const existing = db.companies.find((c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase())
        if (existing) candidate.company_slug = existing.merged_into_id ?? existing.slug
        else {
          db.companies.push({
            id: slug, slug, name, industry: 'Other', website: null, description: null, description_source: null,
            is_verified: false, aliases: [], logo_path: null, merged_into_id: null, created_by: v.id, created_at: nowIso(),
          })
          audit(v.id, 'company.create', 'company', slug, { source: 'share_wizard', name })
          candidate.company_slug = slug
          created_company = { slug, name }
        }
        candidate.new_company_name = null
      }

      const ts = nowIso()
      Object.assign(e, candidate, { updated_at: ts })
      if (isUpdate) {
        e.edited = true
        e.version = (e.version ?? 1) + 1
        audit(v.id, 'experience.update', 'experience', e.id, { version: e.version })
      } else {
        e.status = 'published'
        e.published_at = ts
        e.version = 1
        delete e.draft_step
        delete e.draft_max_step
        audit(v.id, 'experience.publish', 'experience', e.id, { company: e.company_slug, anonymous: e.is_anonymous })
      }
      if (e.duplicate_of && e.duplicate_reason) {
        audit(v.id, 'experience.duplicate_override', 'experience', e.id, { duplicate_of: e.duplicate_of, reason: e.duplicate_reason })
      }
      return { id: e.id, status: e.status, published_at: e.published_at, updated_at: ts, edited: !!e.edited, created_company }
    },
    { write: true },
  )
}

/** Hard-deletes an own draft (drafts have no readers, so nothing to tombstone). */
function mock_deleteDraft(id) {
  return request(
    () => {
      const v = requireViewer()
      const e = ownRow(id, v)
      if (e.status !== 'draft') throw new ApiError('Only drafts can be deleted here.', { code: 'forbidden' })
      db.experiences.splice(db.experiences.indexOf(e), 1)
      return true
    },
    { write: true },
  )
}

/** Popular role titles at a company (Step 1 suggestions). */
function mock_getRoleSuggestions(company_slug) {
  return request(
    () => {
      requireViewer()
      if (!company_slug) return []
      const counts = {}
      db.experiences
        .filter((e) => e.status === 'published' && e.company_slug === company_slug)
        .forEach((e) => (counts[e.role_title] = (counts[e.role_title] ?? 0) + 1))
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([title]) => title)
    },
    { list: [] },
  )
}

/** Feature flags, limits and profile defaults the wizard needs. */
function mock_getShareConfig() {
  return request(() => {
    const v = requireViewer()
    return {
      allow_new_companies: !!db.settings.flags.new_companies,
      allow_anonymous: !!db.settings.flags.anonymous_posting,
      publish_per_day: db.settings.limits.publish_per_day,
      default_anonymous: !!v.default_anonymous,
      default_hide_department: !!v.default_hide_department,
    }
  })
}

/* ---- Data-source switch (Phase 4): real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_drafts from './sb/mine'
export const listMyDrafts = __USE_SB ? __sb_drafts.listMyDrafts : mock_listMyDrafts
import * as __sb_wizard from './sb/drafts'
export const getDraft = __USE_SB ? __sb_wizard.getDraft : mock_getDraft
export const getExperienceForEdit = __USE_SB ? __sb_wizard.getExperienceForEdit : mock_getExperienceForEdit
export const saveDraft = __USE_SB ? __sb_wizard.saveDraft : mock_saveDraft
export const checkDuplicate = __USE_SB ? __sb_wizard.checkDuplicate : mock_checkDuplicate
export const publishExperience = __USE_SB ? __sb_wizard.publishExperience : mock_publishExperience
export const deleteDraft = __USE_SB ? __sb_wizard.deleteDraft : mock_deleteDraft
export const getRoleSuggestions = __USE_SB ? __sb_wizard.getRoleSuggestions : mock_getRoleSuggestions
export const getShareConfig = __USE_SB ? __sb_wizard.getShareConfig : mock_getShareConfig
