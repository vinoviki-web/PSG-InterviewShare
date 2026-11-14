import { supabase } from '@/lib/supabase'
import { ApiError } from '../client'
import { fromAuth, unwrap } from './errors'
import { PSG_DOMAIN } from '@/lib/constants'

const AVATAR_URL_TTL = 60 * 60

async function signedAvatar(path) {
  if (!path) return null
  const { data } = await supabase.storage.from('avatars').createSignedUrl(path, AVATAR_URL_TTL)
  return data?.signedUrl ?? null
}

/** Builds the viewer object the UI uses (same shape as the mock API). */
export async function loadViewer(authUser) {
  const [profile, roles] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle().then(unwrap),
    supabase.from('user_roles').select('role').eq('user_id', authUser.id).then(unwrap),
  ])
  if (!profile) return null
  const suspensionOver = profile.status === 'suspended' && profile.suspended_until && new Date(profile.suspended_until) < new Date()
  return {
    id: authUser.id,
    email: authUser.email,
    full_name: profile.full_name,
    handle: profile.handle,
    department_id: profile.department_id,
    graduation_year: profile.graduation_year,
    bio: profile.bio,
    interests: profile.interests ?? [],
    topics: profile.topic_ids ?? [],
    profile_visibility: profile.profile_visibility,
    default_anonymous: profile.default_anonymous,
    default_hide_department: profile.default_hide_department,
    avatar_path: profile.avatar_path,
    avatar_url: await signedAvatar(profile.avatar_path),
    onboarded_at: profile.onboarded_at,
    created_at: profile.created_at,
    status: suspensionOver ? 'active' : profile.status,
    suspended_until: profile.suspended_until,
    suspension_reason: profile.suspension_reason,
    roles: roles.map((r) => r.role),
  }
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw fromAuth(error)
  if (!data.session) return null
  return loadViewer(data.session.user)
}

const assertPsg = (email) => {
  if (!new RegExp(`^[^@\\s]+@${PSG_DOMAIN.replace(/\./g, '\\.')}$`, 'i').test(email)) {
    throw new ApiError('Only @psgtech.ac.in accounts can join.', { code: 'domain_rejected' })
  }
}

export async function sendOtp(email) {
  assertPsg(email) // UX only; the server enforces it (D2)
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw fromAuth(error)
  return { sent: true }
}

export async function verifyOtp(email, token) {
  assertPsg(email)
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw fromAuth(error)
  return loadViewer(data.user)
}

/** everywhere=true revokes every refresh token for this user (all devices). */
export async function signOut({ everywhere = false } = {}) {
  const { error } = await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' })
  if (error && error.status !== 401 && error.status !== 403) throw fromAuth(error)
  return true
}

export function switchPersona() {
  /* Prototype-only; personas don't exist against the real database. */
}
