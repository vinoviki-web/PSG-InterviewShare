/**
 * Visitor-facing reads on the real database. get_public_stats() is the only
 * function visitors may call (aggregates only, D11); the announcement is read
 * by signed-in students from platform_settings (RLS: PSG users only).
 */
import { supabase } from '@/lib/supabase'
import { unwrap } from './errors'

export async function getPublicStats() {
  return unwrap(await supabase.rpc('get_public_stats'))
}

export async function getAnnouncement() {
  const row = unwrap(await supabase.from('platform_settings').select('announcement').maybeSingle())
  const a = row?.announcement
  if (!a?.text) return null
  if (a.expires_at && new Date(a.expires_at) < new Date()) return null
  return a
}
