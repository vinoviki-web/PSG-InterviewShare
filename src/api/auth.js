/**
 * Mock auth. Mirrors the Phase 4 contract:
 *  - sendOtp / verifyOtp → Supabase email OTP (6 digits) to the college
 *    inbox. This is the only sign-in method (DECISIONS.md D19).
 * Server-side domain enforcement is simulated here; in production it is the
 * Before-User-Created hook + RLS (DECISIONS.md D2).
 */
import { request, viewer, ApiError, db } from './client'
import { session, newId, nowIso } from '@/mocks/db'
import { PSG_DOMAIN } from '@/lib/constants'

const DEMO_CODE = '123456'
const EXPIRED_CODE = '000000'

function enforceDomain(email) {
  if (!email.toLowerCase().endsWith(`@${PSG_DOMAIN}`)) {
    throw new ApiError('Only @psgtech.ac.in accounts can join.', { code: 'domain_rejected' })
  }
}

function findOrCreateUser(email) {
  let u = db.users.find((x) => x.email.toLowerCase() === email.toLowerCase())
  if (!u) {
    u = {
      id: newId('u'), email: email.toLowerCase(), full_name: '', handle: null, department_id: null, graduation_year: null,
      onboarded_at: null, created_at: nowIso(), bio: '', interests: [], topics: [], status: 'active', profile_visibility: 'public_psg',
    }
    db.users.push(u)
  }
  return u
}

function mock_getSession() {
  /* Session reads are local in Supabase (no network), so they bypass the
     simulated failure/latency controls. */
  return request(() => viewer(), { bypass: true })
}

function mock_sendOtp(email) {
  return request(() => {
    enforceDomain(email)
    return { sent: true }
  })
}

function mock_verifyOtp(email, code) {
  return request(
    () => {
      enforceDomain(email)
      if (code === EXPIRED_CODE) throw new ApiError('This code expired. We’ve sent a new one.', { code: 'otp_expired' })
      if (code !== DEMO_CODE) throw new ApiError('That code doesn’t match. Check the latest email.', { code: 'otp_invalid' })
      const u = findOrCreateUser(email)
      session.set({ userId: u.id })
      return viewer()
    },
    { write: true },
  )
}

function mock_signOut() {
  return request(() => {
    session.clear()
    return true
  })
}

/** Prototype-only: jump straight into a persona. */
function mock_switchPersona(userId) {
  if (userId) session.set({ userId })
  else session.clear()
}

/* ---- Data-source switch (Phase 4): real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_auth from './sb/auth'
export const getSession = __USE_SB ? __sb_auth.getSession : mock_getSession
export const sendOtp = __USE_SB ? __sb_auth.sendOtp : mock_sendOtp
export const verifyOtp = __USE_SB ? __sb_auth.verifyOtp : mock_verifyOtp
export const signOut = __USE_SB ? __sb_auth.signOut : mock_signOut
export const switchPersona = __USE_SB ? __sb_auth.switchPersona : mock_switchPersona
