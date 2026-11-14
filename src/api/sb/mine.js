/**
 * The student's own lists, needed by Home and My profile in Phase 4.
 * The rest of experiences/drafts connects in Phases 5–6.
 */
import { supabase } from '@/lib/supabase'
import { ApiError } from '../client'
import { unwrap } from './errors'
import { getLookups, feedRowToExperience, FEED_COLUMNS } from './mappers'

async function uid() {
  const { data } = await supabase.auth.getUser()
  if (!data?.user) throw new ApiError('Sign in required', { code: 'unauthenticated' })
  return data.user.id
}

export async function getMyExperiences() {
  await uid()
  const lookups = await getLookups()
  const rows = unwrap(await supabase.from('experience_feed').select(FEED_COLUMNS).eq('is_owner', true).order('published_at', { ascending: false }))
  return rows.map((r) => feedRowToExperience(r, lookups))
}

export async function getSaved() {
  const [id, lookups] = await Promise.all([uid(), getLookups()])
  const marks = unwrap(await supabase.from('bookmarks').select('experience_id, created_at').eq('user_id', id).order('created_at', { ascending: false }))
  if (!marks.length) return []
  const rows = unwrap(await supabase.from('experience_feed').select(FEED_COLUMNS).in('id', marks.map((m) => m.experience_id)))
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  return marks.map((m) =>
    byId[m.experience_id] && byId[m.experience_id].status === 'published'
      ? { ...feedRowToExperience(byId[m.experience_id], lookups), saved_at: m.created_at }
      : { id: m.experience_id, unavailable: true, saved_at: m.created_at },
  )
}

export async function listMyDrafts() {
  const id = await uid()
  const rows = unwrap(
    await supabase
      .from('experiences')
      .select('id, role_title, draft_step, updated_at, created_at, new_company_name, companies(name, slug)')
      .eq('author_id', id)
      .eq('status', 'draft')
      .gte('updated_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('updated_at', { ascending: false }),
  )
  return rows.map((d) => ({
    id: d.id,
    company_name: d.companies?.name ?? d.new_company_name ?? '',
    company_slug: d.companies?.slug ?? null,
    role_title: d.role_title ?? '',
    draft_step: d.draft_step,
    total_steps: 5,
    updated_at: d.updated_at,
    created_at: d.created_at,
  }))
}
