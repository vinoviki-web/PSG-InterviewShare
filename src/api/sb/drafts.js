/**
 * Share wizard on the real database (Phase 5). Same signatures and return
 * shapes as the prototype's src/api/drafts.js; validation and limits live in
 * the RPCs (supabase/migrations/…0500_share_wizard.sql).
 */
import { supabase } from '@/lib/supabase'
import { ApiError } from '../client'
import { unwrap } from './errors'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const asUuid = (v) => (typeof v === 'string' && UUID.test(v) ? v : null)

async function editorRow(id) {
  if (!asUuid(id)) throw new ApiError('This draft doesn’t exist or was deleted.', { code: 'not_found' })
  return unwrap(await supabase.rpc('get_experience_for_editor', { p_id: id }))
}

/** Owner-only. A published row throws code 'published' so the caller can switch to edit mode. */
export async function getDraft(id) {
  const row = await editorRow(id)
  if (row.status !== 'draft') throw new ApiError('This experience is already published.', { code: 'published' })
  return row
}

/** Owner-only load of a published (or hidden) experience for the edit flow. */
export async function getExperienceForEdit(id) {
  const row = await editorRow(id)
  if (row.status === 'draft') throw new ApiError('This is still a draft.', { code: 'draft' })
  return row
}

/** Creates (no id) or updates a draft; children replaced in one transaction. Returns { id, updated_at }. */
export async function saveDraft(payload) {
  const { id, ...rest } = payload
  return unwrap(await supabase.rpc('save_draft', { p: { ...rest, id: asUuid(id) } }))
}

async function companyIdForSlug(slug) {
  if (!slug) return null
  const row = unwrap(await supabase.from('companies').select('id, name, merged_into_id').eq('slug', slug).maybeSingle())
  return row ? { id: row.merged_into_id ?? row.id, name: row.name } : null
}

/** Same company + role + type + batch from the same author. Returns { id, status, company_name, role_title, graduation_year } or null. */
export async function checkDuplicate({ company_slug, role_title, opportunity_type, graduation_year, excludeId }) {
  if (!company_slug || !role_title?.trim() || !opportunity_type || !graduation_year) return null
  const company = await companyIdForSlug(company_slug)
  if (!company) return null
  const hit = unwrap(
    await supabase.rpc('check_duplicate_experience', {
      p_company_id: company.id,
      p_role_title: role_title,
      p_opportunity_type: opportunity_type,
      p_graduation_year: Number(graduation_year),
      p_exclude: asUuid(excludeId),
    }),
  )
  return hit ? { ...hit, company_name: company.name } : null
}

/**
 * Publishes a draft, or updates a published experience with `changes`.
 * Fails with ApiError { code: 'validation', fields } (wizard field paths) or 'rate_limited'.
 */
export async function publishExperience(id, changes) {
  return unwrap(await supabase.rpc('publish_experience', { p_id: id, p_changes: changes ?? null }))
}

/** Hard-deletes an own draft (refuses published experiences). */
export async function deleteDraft(id) {
  unwrap(await supabase.rpc('delete_draft', { p_id: id }))
  return true
}

/** Popular role titles at a company (Step 1 suggestions). */
export async function getRoleSuggestions(company_slug) {
  if (!company_slug) return []
  const rows = unwrap(await supabase.from('experience_feed').select('role_title').eq('company_slug', company_slug).eq('status', 'published').limit(200))
  const counts = {}
  rows.forEach((r) => (counts[r.role_title] = (counts[r.role_title] ?? 0) + 1))
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([title]) => title)
}

/** Feature flags, limits and the student's privacy defaults. */
export async function getShareConfig() {
  const { data: auth } = await supabase.auth.getUser()
  const [settings, profile] = await Promise.all([
    supabase.from('platform_settings').select('flags, limits').maybeSingle().then(unwrap),
    supabase.from('profiles').select('default_anonymous, default_hide_department').eq('id', auth?.user?.id).maybeSingle().then(unwrap),
  ])
  return {
    allow_new_companies: !!settings?.flags?.new_companies,
    allow_anonymous: !!settings?.flags?.anonymous_posting,
    publish_per_day: settings?.limits?.publish_per_day ?? 5,
    default_anonymous: !!profile?.default_anonymous,
    default_hide_department: !!profile?.default_hide_department,
  }
}
