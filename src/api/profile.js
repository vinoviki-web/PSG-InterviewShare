import { request, requireViewer, viewer, ApiError, db } from './client'
import { nowIso, session, audit } from '@/mocks/db'
import { DEPARTMENT } from '@/mocks/lookups'
import { serializeExperience } from './experiences'
import { slugify } from '@/lib/utils'

/* Column allowlist: mirrors the column GRANTs planned for `profiles`. */
const EDITABLE = ['full_name', 'department_id', 'graduation_year', 'bio', 'interests', 'topics', 'profile_visibility', 'handle', 'avatar_url', 'default_anonymous', 'default_hide_department']

function validate(p) {
  const fields = {}
  if (p.full_name != null && (p.full_name.trim().length < 2 || p.full_name.length > 80)) fields.full_name = 'Use 2–80 characters.'
  if (p.department_id != null && !DEPARTMENT[p.department_id]) fields.department_id = 'Choose your department.'
  const y = new Date().getFullYear()
  if (p.graduation_year != null && (p.graduation_year < y - 6 || p.graduation_year > y + 6)) fields.graduation_year = 'Choose a valid batch.'
  if (p.bio != null && p.bio.length > 280) fields.bio = 'Keep your bio under 280 characters.'
  if (p.handle != null && !/^[a-z0-9-]{3,30}$/.test(p.handle)) fields.handle = 'Use 3–30 lowercase letters, numbers or hyphens.'
  if (Object.keys(fields).length) throw new ApiError('Please fix the highlighted fields.', { code: 'validation', fields })
}

const toProfile = (u) => ({ ...u, department: DEPARTMENT[u.department_id] ?? null })

function mock_getMyProfile() {
  return request(() => {
    const v = viewer()
    return v ? toProfile(v) : null
  })
}

function mock_updateProfile(patch) {
  return request(
    () => {
      const v = requireViewer()
      const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => EDITABLE.includes(k)))
      validate(clean)
      if (clean.handle && db.users.some((u) => u.handle === clean.handle && u.id !== v.id)) {
        throw new ApiError('That handle is taken.', { code: 'validation', fields: { handle: 'That handle is taken.' } })
      }
      const u = db.users.find((x) => x.id === v.id)
      Object.assign(u, clean, { updated_at: nowIso() })
      return toProfile({ ...u, roles: v.roles })
    },
    { write: true },
  )
}

function mock_completeOnboarding(data) {
  return request(
    () => {
      const v = requireViewer()
      const required = {}
      if (!data.full_name?.trim()) required.full_name = 'Enter your name.'
      if (!data.department_id) required.department_id = 'Choose your department.'
      if (!data.graduation_year) required.graduation_year = 'Choose your batch.'
      if (Object.keys(required).length) throw new ApiError('Please complete the required fields.', { code: 'validation', fields: required })
      validate(data)
      const u = db.users.find((x) => x.id === v.id)
      let handle = slugify(data.full_name)
      if (db.users.some((x) => x.handle === handle && x.id !== u.id)) handle = `${handle}-${Math.floor(Math.random() * 90 + 10)}`
      Object.assign(u, {
        full_name: data.full_name.trim(), department_id: data.department_id, graduation_year: Number(data.graduation_year),
        interests: data.interests ?? [], topics: data.topics ?? [], handle: u.handle ?? handle, onboarded_at: nowIso(),
      })
      return toProfile({ ...u, roles: v.roles })
    },
    { write: true },
  )
}

function mock_getPublicProfile(handle) {
  return request(() => {
    const v = requireViewer()
    const u = db.users.find((x) => x.handle === handle && x.onboarded_at)
    if (!u) throw new ApiError('No student with that profile link.', { code: 'not_found' })
    const own = u.id === v.id
    const base = { handle: u.handle, full_name: u.full_name, department: DEPARTMENT[u.department_id], graduation_year: u.graduation_year, is_self: own }
    if (u.profile_visibility === 'private' && !own) return { ...base, private: true }
    /* Anonymous experiences never appear (or count) on public profiles. */
    const exps = db.experiences.filter((e) => e.author_id === u.id && e.status === 'published' && !e.is_anonymous)
    return {
      ...base,
      bio: u.bio,
      private: false,
      experiences: exps.map((e) => serializeExperience(e, v)),
      helpful_received: exps.reduce((s, e) => s + e.helpful_count, 0),
    }
  })
}

function mock_getMyStats() {
  return request(() => {
    const v = requireViewer()
    const mine = db.experiences.filter((e) => e.author_id === v.id && e.status === 'published')
    return {
      published: mine.length,
      helpful_received: mine.reduce((s, e) => s + e.helpful_count, 0),
      views: mine.reduce((s, e) => s + e.view_count, 0),
      saved: db.bookmarks.filter((b) => b.user_id === v.id).length,
    }
  })
}

function mock_exportMyData() {
  return request(() => {
    const v = requireViewer()
    return {
      exported_at: nowIso(),
      profile: db.users.find((u) => u.id === v.id),
      experiences: db.experiences.filter((e) => e.author_id === v.id),
      comments: db.comments.filter((c) => c.author_id === v.id),
      bookmarks: db.bookmarks.filter((b) => b.user_id === v.id),
      helpful_votes: db.votes.filter((x) => x.user_id === v.id),
    }
  })
}

/** mode: 'anonymise' (default, D14) | 'delete' */
function mock_deleteAccount(mode = 'anonymise') {
  return request(
    () => {
      const v = requireViewer()
      db.experiences.forEach((e) => {
        if (e.author_id !== v.id) return
        if (mode === 'delete' || e.status === 'draft') e.status = 'removed'
        else { e.is_anonymous = true; e.author_id = 'former-student' }
      })
      db.votes = db.votes.filter((x) => x.user_id !== v.id)
      db.bookmarks = db.bookmarks.filter((x) => x.user_id !== v.id)
      db.views = db.views.filter((x) => x.user_id !== v.id)
      db.users = db.users.filter((u) => u.id !== v.id)
      audit(v.id, 'account.delete', 'user', v.id, { mode })
      session.clear()
      return true
    },
    { write: true },
  )
}

/* ---- Data-source switch (Phase 4): real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_profile from './sb/profile'
export const getMyProfile = __USE_SB ? __sb_profile.getMyProfile : mock_getMyProfile
export const updateProfile = __USE_SB ? __sb_profile.updateProfile : mock_updateProfile
export const completeOnboarding = __USE_SB ? __sb_profile.completeOnboarding : mock_completeOnboarding
export const getPublicProfile = __USE_SB ? __sb_profile.getPublicProfile : mock_getPublicProfile
export const getMyStats = __USE_SB ? __sb_profile.getMyStats : mock_getMyStats
export const exportMyData = __USE_SB ? __sb_profile.exportMyData : mock_exportMyData
export const deleteAccount = __USE_SB ? __sb_profile.deleteAccount : mock_deleteAccount
