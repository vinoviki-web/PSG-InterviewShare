/**
 * Moderation on the real database (Phase 9). Same signatures and shapes as
 * the prototype's src/api/moderation.js; all logic, role checks, snapshots
 * and audit rows live in the mod_* SQL functions (migration 0800).
 */
import { supabase } from '@/lib/supabase'
import { unwrap } from './errors'

const parseKey = (key) => {
  const i = key.indexOf(':')
  return { p_type: key.slice(0, i), p_id: key.slice(i + 1) }
}

/** tab: open | hidden | resolved → { items, counts } */
export async function listModerationQueue(tab = 'open') {
  return unwrap(await supabase.rpc('mod_queue', { p_tab: tab }))
}

/** key: "experience:<id>" | "comment:<id>" | "profile:<id>" */
export async function getModerationItem(key) {
  return unwrap(await supabase.rpc('mod_item', parseKey(key)))
}

export async function dismissReports(key, { note = '' } = {}) {
  return unwrap(await supabase.rpc('mod_dismiss', { ...parseKey(key), p_note: note }))
}

export async function hideContent(key, { reason, message }) {
  return unwrap(await supabase.rpc('mod_hide', { ...parseKey(key), p_reason: reason ?? null, p_message: message ?? '' }))
}

export async function restoreContent(key, { note = '' } = {}) {
  return unwrap(await supabase.rpc('mod_restore', { ...parseKey(key), p_note: note }))
}

export async function escalateReports(key, { note = '' } = {}) {
  return unwrap(await supabase.rpc('mod_escalate_to_admin', { ...parseKey(key), p_note: note }))
}

export async function undoModerationAction(actionId) {
  return unwrap(await supabase.rpc('mod_undo', { p_action_id: Number(actionId) }))
}
