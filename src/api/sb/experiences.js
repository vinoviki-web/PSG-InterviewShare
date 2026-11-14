/**
 * Browsing and reading on the real database (Phase 6). Same signatures and
 * shapes as the prototype's src/api/experiences.js. Visibility, anonymity
 * and department masking all come from the experience_feed view / RPCs.
 */
import { supabase } from '@/lib/supabase'
import { ApiError } from '../client'
import { unwrap, fromPostgrest } from './errors'
import { getLookups, feedRowToExperience, FEED_COLUMNS } from './mappers'
import { readingMinutes } from '@/lib/utils'
import { DOMAIN } from '@/lib/taxonomy'

const arr = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(',')).filter(Boolean)

async function currentUserId() {
  const { data } = await supabase.auth.getUser()
  if (!data?.user) throw new ApiError('Sign in required', { code: 'unauthenticated' })
  return data.user.id
}

/**
 * params: { q, domain[], company[], type[], hiring[], outcome[], difficulty[], dept[], year[], round[], sort, cursor, limit, exclude }
 * returns { items, total, nextCursor }
 */
export async function searchExperiences(params = {}) {
  const lookups = await getLookups()
  const limit = Math.min(Number(params.limit ?? 20), 50)
  const offset = Math.max(Number(params.cursor ?? 0), 0)
  let qb = supabase.rpc('search_feed', { p_q: params.q?.trim() || null }, { count: 'exact' }).select(FEED_COLUMNS).eq('status', 'published')

  const domain = arr(params.domain)
  const company = arr(params.company)
  const type = arr(params.type)
  const hiring = arr(params.hiring)
  const outcome = arr(params.outcome)
  const difficulty = arr(params.difficulty).map(Number)
  const dept = arr(params.dept)
  const year = arr(params.year).map(Number)
  const round = arr(params.round)
  if (domain.length) qb = qb.in('domain_id', domain)
  if (company.length) qb = qb.in('company_slug', company)
  if (type.length) qb = qb.in('opportunity_type', type)
  if (hiring.length) qb = qb.in('hiring_mode', hiring)
  if (outcome.length) qb = qb.in('outcome', outcome)
  if (difficulty.length) qb = qb.in('difficulty', difficulty)
  if (dept.length) qb = qb.in('department_id', dept) // hidden departments are null in the view, so never match
  if (year.length) qb = qb.in('graduation_year', year)
  if (round.length) qb = qb.contains('pipeline', round)
  if (params.exclude) qb = qb.neq('id', params.exclude)

  const sort = params.sort ?? 'latest'
  if (sort === 'helpful') qb = qb.order('helpful_count', { ascending: false }).order('published_at', { ascending: false })
  else if (sort === 'read') qb = qb.order('view_count', { ascending: false }).order('published_at', { ascending: false })
  else qb = qb.order('published_at', { ascending: false })
  qb = qb.order('id', { ascending: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await qb
  if (error) throw fromPostgrest(error)
  const total = count ?? data.length
  return { items: data.map((r) => feedRowToExperience(r, lookups)), total, nextCursor: offset + limit < total ? offset + limit : null }
}

/** Filter-rail counts (published only). */
export async function getFacets() {
  return unwrap(await supabase.rpc('experience_facets'))
}

/** Full experience for the detail page (author already masked by the RPC). */
export async function getExperience(id) {
  const e = unwrap(await supabase.rpc('get_experience', { p_id: id }))
  const questions = e.rounds.flatMap((r) => r.questions)
  return {
    ...e,
    domain: DOMAIN[e.domain?.id] ?? null,
    pipeline: e.rounds.map((r) => ({ type: r.round_type, mode: r.mode, difficulty: r.difficulty })),
    question_count: questions.length,
    reading_minutes: readingMinutes(e.application_process ?? '', e.preparation ?? '', e.advice ?? '', ...e.rounds.map((r) => r.description ?? ''), ...questions.map((q) => q.body)),
    rounds: e.rounds.map((r) => ({
      ...r,
      // The UI only needs how many other experiences share the question
      questions: r.questions.map((q) => ({ ...q, also_in: Array.from({ length: q.also_in ?? 0 }) })),
    })),
  }
}

/** Same company first, then the same opportunity type with overlapping topics. */
export async function getRelated(id) {
  const lookups = await getLookups()
  const base = unwrap(await supabase.from('experience_feed').select('company_slug, opportunity_type, topic_ids').eq('id', id).maybeSingle())
  if (!base) return []
  const same = unwrap(
    await supabase.from('experience_feed').select(FEED_COLUMNS).eq('status', 'published').eq('company_slug', base.company_slug).neq('id', id).order('published_at', { ascending: false }).limit(4),
  )
  let similar = []
  if (same.length < 4 && base.topic_ids?.length) {
    similar = unwrap(
      await supabase
        .from('experience_feed')
        .select(FEED_COLUMNS)
        .eq('status', 'published')
        .eq('opportunity_type', base.opportunity_type)
        .neq('company_slug', base.company_slug)
        .overlaps('topic_ids', base.topic_ids)
        .order('helpful_count', { ascending: false })
        .limit(4 - same.length),
    )
  }
  return [...same, ...similar].map((r) => feedRowToExperience(r, lookups))
}

export async function recordView(id) {
  const { error } = await supabase.rpc('record_view', { p_id: id })
  if (error) throw fromPostgrest(error)
  return true
}

export async function getRecentlyViewed(limit = 4) {
  const uid = await currentUserId()
  const lookups = await getLookups()
  const views = unwrap(await supabase.from('experience_views').select('experience_id, last_viewed_at').eq('user_id', uid).order('last_viewed_at', { ascending: false }).limit(20))
  if (!views.length) return []
  const rows = unwrap(await supabase.from('experience_feed').select(FEED_COLUMNS).eq('status', 'published').in('id', views.map((v) => v.experience_id)))
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  return views.map((v) => byId[v.experience_id]).filter(Boolean).slice(0, limit).map((r) => feedRowToExperience(r, lookups))
}

export async function deleteExperience(id) {
  unwrap(await supabase.rpc('delete_experience', { p_id: id }))
  return true
}

async function counts(id) {
  return unwrap(await supabase.from('experience_feed').select('helpful_count').eq('id', id).maybeSingle())
}

export async function toggleHelpful(id) {
  const uid = await currentUserId()
  const existing = unwrap(await supabase.from('helpful_votes').select('experience_id').eq('user_id', uid).eq('experience_id', id).maybeSingle())
  if (existing) {
    unwrap(await supabase.from('helpful_votes').delete().eq('user_id', uid).eq('experience_id', id))
  } else {
    const { error } = await supabase.from('helpful_votes').insert({ experience_id: id })
    if (error?.code === '42501') throw new ApiError('You can’t mark your own experience as helpful.', { code: 'forbidden' })
    if (error && error.code !== '23505') throw fromPostgrest(error) // 23505: already voted in another tab
  }
  const row = await counts(id)
  return { has_voted: !existing, helpful_count: row?.helpful_count ?? 0 }
}

export async function toggleBookmark(id) {
  const uid = await currentUserId()
  const existing = unwrap(await supabase.from('bookmarks').select('experience_id').eq('user_id', uid).eq('experience_id', id).maybeSingle())
  if (existing) {
    unwrap(await supabase.from('bookmarks').delete().eq('user_id', uid).eq('experience_id', id))
  } else {
    const { error } = await supabase.from('bookmarks').insert({ experience_id: id })
    if (error && error.code !== '23505') throw fromPostgrest(error)
  }
  return { has_saved: !existing }
}
