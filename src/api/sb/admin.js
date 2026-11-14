/**
 * Admin on the real database (Phase 9). Same signatures and shapes as the
 * prototype's src/api/admin.js; every function is an admin-only, audited
 * SQL function (migration 0810). Anonymous authors are only ever revealed
 * by revealAuthor (reason required, audited).
 */
import { supabase } from '@/lib/supabase'
import { unwrap } from './errors'

const parseKey = (key) => {
  const i = key.indexOf(':')
  return { p_type: key.slice(0, i), p_id: key.slice(i + 1) }
}
const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args))

/* ---------------- Overview ---------------- */
export const getAdminOverview = () => rpc('admin_overview')

/* ---------------- Users ---------------- */
/** params: { q, role, status, dept, batch } */
export const listUsers = (params = {}) => rpc('admin_users', { p: params })
export const getUserFacets = () => rpc('admin_user_facets')
export const getUserDetail = (id) => rpc('admin_user_detail', { p_id: id })
export const suspendUser = (id, { days, reason }) => rpc('admin_suspend', { p_user: id, p_days: Number(days), p_reason: reason ?? '' })
export const unsuspendUser = (id) => rpc('admin_lift_suspension', { p_user: id })

/** role: student | moderator | admin (one effective role per user). */
export async function setUserRole(id, role) {
  await rpc('admin_set_role', { p_user: id, p_role: role === 'student' ? null : role })
  return { role }
}

/* ---------------- Companies ---------------- */
/** status: all | verified | unverified | merged */
export const listAdminCompanies = ({ q = '', status = 'all' } = {}) => rpc('admin_companies', { p_q: q, p_status: status })
export const getAdminCompany = (id) => rpc('admin_company', { p_id: id })
export const listIndustryOptions = () => rpc('company_industries')
/** id null → create. */
export const saveCompany = (id, data) => rpc('admin_save_company', { p_id: id ?? null, p: data })
export const setCompanyVerified = (id, verified) => rpc('admin_set_company_verified', { p_id: id, p_verified: !!verified })
export const previewCompanyMerge = (sourceId, targetId) => rpc('admin_merge_preview', { p_source: sourceId, p_target: targetId })
export const mergeCompanies = (sourceId, targetId) => rpc('admin_merge_companies', { p_source: sourceId, p_target: targetId })

/* ---------------- Reports ---------------- */
/** status: escalated | open | resolved | all */
export const listAllReports = ({ status = 'escalated', q = '' } = {}) => rpc('admin_reports', { p_status: status, p_q: q })
export const removeContent = (key, { reason }) => rpc('admin_remove_content', { ...parseKey(key), p_reason: reason ?? '' })
export const suspendAuthorOf = (key, { days, reason }) => rpc('admin_suspend_author', { ...parseKey(key), p_days: Number(days), p_reason: reason ?? '' })
export const revealAuthor = (key, { reason }) => rpc('admin_unmask', { ...parseKey(key), p_reason: reason ?? '' })

/* ---------------- Audit log ---------------- */
/** filters: { actor, action, entity, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } */
export const listAuditLog = (filters = {}) => rpc('admin_audit', { p: filters })
export const recordAuditExport = (count, filters) => rpc('admin_audit_export', { p_count: count, p_filters: filters ?? {} })

/* ---------------- Settings ---------------- */
export async function getSettings() {
  return unwrap(await supabase.from('platform_settings').select('announcement, flags, limits, landing_stats_threshold').single())
}
export const updateSettings = (next) => rpc('admin_save_settings', { p: next })
