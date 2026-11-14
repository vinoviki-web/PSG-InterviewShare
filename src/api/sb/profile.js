import { supabase } from '@/lib/supabase'
import { ApiError } from '../client'
import { unwrap, fromPostgrest } from './errors'
import { loadViewer } from './auth'
import { getLookups, feedRowToExperience, FEED_COLUMNS } from './mappers'

async function currentUser() {
  const { data } = await supabase.auth.getUser()
  if (!data?.user) throw new ApiError('Sign in required', { code: 'unauthenticated' })
  return data.user
}

/* Column allowlist mirrors the column GRANTs on public.profiles (0300). */
const EDITABLE = {
  full_name: 'full_name', handle: 'handle', department_id: 'department_id', graduation_year: 'graduation_year',
  bio: 'bio', interests: 'interests', topics: 'topic_ids', profile_visibility: 'profile_visibility',
  default_anonymous: 'default_anonymous', default_hide_department: 'default_hide_department',
}

/**
 * Avatar: the UI hands us a resized webp data URL (or null to remove).
 * Stored at avatars/{uid}/avatar-{timestamp}.webp; older files are removed.
 */
async function syncAvatar(userId, dataUrl) {
  const { data: existing } = await supabase.storage.from('avatars').list(userId)
  let path = null
  if (dataUrl) {
    const blob = await (await fetch(dataUrl)).blob()
    path = `${userId}/avatar-${Date.now()}.webp`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: false })
    if (error) throw new ApiError('Couldn’t upload your photo. Use a PNG, JPEG or WebP under 2 MB.', { code: 'upload_failed' })
  }
  const stale = (existing ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== path)
  if (stale.length) await supabase.storage.from('avatars').remove(stale)
  return path
}

export async function getMyProfile() {
  const { data } = await supabase.auth.getUser()
  return data?.user ? loadViewer(data.user) : null
}

export async function updateProfile(patch) {
  const user = await currentUser()
  const row = {}
  for (const [k, col] of Object.entries(EDITABLE)) if (k in patch) row[col] = patch[k]
  if ('graduation_year' in row) row.graduation_year = Number(row.graduation_year)
  if ('avatar_url' in patch && !String(patch.avatar_url ?? '').startsWith('http')) {
    row.avatar_path = await syncAvatar(user.id, patch.avatar_url)
  }
  if (Object.keys(row).length) {
    const { error } = await supabase.from('profiles').update(row).eq('id', user.id)
    if (error) {
      if (error.code === '23505') throw new ApiError('That profile link is taken.', { code: 'validation', fields: { handle: 'That profile link is taken.' } })
      const e = fromPostgrest(error)
      if (e.code === 'handle_cooldown') e.fields = { handle: e.message }
      throw e
    }
  }
  return loadViewer(user)
}

export async function completeOnboarding(data) {
  const user = await currentUser()
  unwrap(
    await supabase.rpc('complete_onboarding', {
      p_full_name: data.full_name ?? '',
      p_department_id: data.department_id || null,
      p_graduation_year: data.graduation_year ? Number(data.graduation_year) : null,
      p_interests: data.interests ?? [],
      p_topic_ids: data.topics ?? [],
    }),
  )
  return loadViewer(user)
}

export async function getPublicProfile(handle) {
  const lookups = await getLookups()
  const p = unwrap(await supabase.from('public_profiles').select('*').eq('handle', handle).maybeSingle())
  if (!p) throw new ApiError('No student with that profile link.', { code: 'not_found' })
  const base = { handle: p.handle, full_name: p.full_name, department: lookups.departments[p.department_id], graduation_year: p.graduation_year, is_self: p.is_self }
  if (p.is_private && !p.is_self) return { ...base, private: true }
  /* Anonymous posts never carry author_id in the feed, so they can't appear here. */
  const rows = unwrap(
    await supabase.from('experience_feed').select(FEED_COLUMNS).eq('author_id', p.id).eq('is_anonymous', false).eq('status', 'published').order('published_at', { ascending: false }),
  )
  const experiences = rows.map((r) => feedRowToExperience(r, lookups))
  return { ...base, bio: p.bio, private: false, experiences, helpful_received: experiences.reduce((s, e) => s + e.helpful_count, 0) }
}

export async function getMyStats() {
  const user = await currentUser()
  const [mine, saved] = await Promise.all([
    supabase.from('experiences').select('helpful_count, view_count').eq('author_id', user.id).eq('status', 'published').then(unwrap),
    supabase.from('bookmarks').select('experience_id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])
  return {
    published: mine.length,
    helpful_received: mine.reduce((s, e) => s + e.helpful_count, 0),
    views: mine.reduce((s, e) => s + e.view_count, 0),
    saved: saved.count ?? 0,
  }
}

/** Everything the student can see that is theirs, as JSON. */
export async function exportMyData() {
  const user = await currentUser()
  const [profile, experiences, comments, bookmarks, votes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(unwrap),
    supabase.from('experiences').select('*, experience_rounds(*, questions(*)), experience_topics(topic_id), experience_resources(*)').eq('author_id', user.id).then(unwrap),
    supabase.from('comments').select('*').eq('author_id', user.id).then(unwrap),
    supabase.from('bookmarks').select('*').eq('user_id', user.id).then(unwrap),
    supabase.from('helpful_votes').select('*').eq('user_id', user.id).then(unwrap),
  ])
  return { exported_at: new Date().toISOString(), email: user.email, profile, experiences, comments, bookmarks, helpful_votes: votes }
}

/** mode: 'anonymise' (default, D14) | 'delete'. Runs the delete-account Edge Function. */
export async function deleteAccount(mode = 'anonymise') {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { mode } })
  if (error) {
    let body
    try {
      body = await error.context?.json?.()
    } catch {
      body = null
    }
    throw new ApiError(body?.message ?? 'Couldn’t delete your account. Try again.', { code: body?.code ?? 'error' })
  }
  await supabase.auth.signOut({ scope: 'local' })
  return data
}
