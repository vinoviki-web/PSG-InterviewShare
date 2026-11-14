/**
 * Mock transport. Simulates latency, failures and empty datasets according
 * to the Prototype controls. In Phase 3 each api/* function is reimplemented
 * on supabase-js with the same signature and return shape.
 */
import { controls, persist, db, session, userById, rolesOf } from '@/mocks/db'
import { sleep } from '@/lib/utils'
import { USE_SUPABASE } from '@/lib/supabase'

export class ApiError extends Error {
  constructor(message, { code = 'error', fields } = {}) {
    super(message)
    this.code = code
    this.fields = fields
  }
}

export async function request(fn, { list = false, write = false, bypass = false } = {}) {
  /* In database mode, anything still on the mock API says so instead of
     quietly showing sample data (Phase 4 connects auth + profile only). */
  if (USE_SUPABASE) {
    throw new ApiError('This section isn’t connected to the database yet. It will be in a later phase.', { code: 'not_connected' })
  }
  if (bypass) return structuredClone(fn())
  const base = controls.latency === 'slow' ? 1800 : 220
  await sleep(base + Math.random() * (controls.latency === 'slow' ? 900 : 260))
  if (controls.fail) throw new ApiError('Simulated network failure', { code: 'network' })
  if (list && controls.empty && !write) return Array.isArray(list) ? list : { items: [], total: 0, nextCursor: null }
  const result = fn()
  if (write) persist()
  return structuredClone(result)
}

/** Current viewer (or null). Mirrors auth.uid() + role lookups. */
export function viewer() {
  const s = session.get()
  if (!s) return null
  const user = userById(s.userId)
  if (!user) return null
  return { ...user, roles: rolesOf(user.id) }
}

export function requireViewer() {
  const v = viewer()
  if (!v) throw new ApiError('Sign in required', { code: 'unauthenticated' })
  if (v.status === 'suspended') throw new ApiError('Account suspended', { code: 'suspended' })
  return v
}

export function requireRole(role) {
  const v = requireViewer()
  const ok = role === 'moderator' ? v.roles.includes('moderator') || v.roles.includes('admin') : v.roles.includes(role)
  if (!ok) throw new ApiError('You don’t have permission to do that', { code: 'forbidden' })
  return v
}

export { db }
