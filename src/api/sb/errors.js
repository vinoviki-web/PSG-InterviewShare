import { ApiError } from '../client'

const PG_FRIENDLY = {
  '42501': ['forbidden', 'You don’t have permission to do that.'],
  '23505': ['duplicate', 'That already exists.'],
  '23514': ['validation', 'Some details aren’t valid.'],
  '22P02': ['validation', 'Some details aren’t valid.'],
}

/**
 * Maps a PostgREST / RPC error to ApiError. Our RPCs raise SQLSTATE P0001
 * with a stable code in DETAIL and JSON field errors in HINT (docs/03).
 */
export function fromPostgrest(error) {
  if (!error) return null
  if (error.code === 'P0001') {
    let fields
    try {
      fields = error.hint ? JSON.parse(error.hint) : undefined
    } catch {
      fields = undefined
    }
    return new ApiError(error.message, { code: error.details || 'error', fields })
  }
  if (PG_FRIENDLY[error.code]) {
    const [code, message] = PG_FRIENDLY[error.code]
    return new ApiError(message, { code })
  }
  if (error.message?.toLowerCase().includes('fetch')) return new ApiError('Network error. Check your connection.', { code: 'network' })
  if (import.meta.env.DEV) console.error('Unmapped database error', error)
  return new ApiError('Something went wrong. Try again.', { code: 'error' })
}

/** Throws a mapped error, otherwise returns data. */
export function unwrap({ data, error }) {
  if (error) throw fromPostgrest(error)
  return data
}

/** Maps Supabase Auth errors to the codes the sign-in screen understands. */
export function fromAuth(error) {
  const status = error?.status
  const msg = (error?.message ?? '').toLowerCase()
  if (status === 403 && msg.includes('psgtech')) return new ApiError('Only @psgtech.ac.in accounts can join.', { code: 'domain_rejected' })
  if (status === 429 || msg.includes('rate limit') || msg.includes('security purposes')) {
    return new ApiError('Too many attempts. Wait a minute, then try again.', { code: 'rate_limited' })
  }
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('otp')) {
    return new ApiError('That code is wrong or has expired. Check the latest email, or resend.', { code: 'otp_invalid' })
  }
  if (msg.includes('fetch') || msg.includes('network')) return new ApiError('Network error. Check your connection.', { code: 'network' })
  /* Never show raw server errors to students. */
  if (!status || status >= 500) {
    if (import.meta.env.DEV) console.error('Auth server error', error)
    return new ApiError('Something went wrong on our side. Try again in a moment.', { code: 'server_error' })
  }
  return new ApiError('Couldn’t sign you in. Check the address and try again.', { code: 'auth_error' })
}
