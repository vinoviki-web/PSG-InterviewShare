/** Shared helpers for the live integration scripts (local stack only). */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.db.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
export const API_URL = env.VITE_SUPABASE_URL
export const ANON_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API_URL)) {
  console.error(`Refusing to run against ${API_URL}: local stack only.`)
  process.exit(2)
}

export const stamp = Date.now().toString(36)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const client = () => createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

let passed = 0
let failed = 0
export function check(ok, name, extra = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'ok    ' : 'FAIL  '} ${name}${!ok && extra ? `  →  ${extra}` : ''}`)
}
export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

export async function codeFor(email, after) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const { messages = [] } = await res.json()
    const fresh = messages.filter((m) => new Date(m.Created) >= after)
    if (fresh.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`)).json()
      return (msg.Text ?? '').match(/\b(\d{6})\b/)?.[1]
    }
    await sleep(500)
  }
  return null
}

/** Signs a fresh PSG student in with a real emailed code and onboards them. */
export async function onboardedStudent(prefix, name, dept = 'cse', year = 2027) {
  const email = `${prefix}${stamp}@psgtech.ac.in`
  const c = client()
  const before = new Date(Date.now() - 1000)
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw new Error(`signInWithOtp ${email}: ${error.message}`)
  const token = await codeFor(email, before)
  const { error: vErr } = await c.auth.verifyOtp({ email, token, type: 'email' })
  if (vErr) throw new Error(`verifyOtp ${email}: ${vErr.message}`)
  const { error: oErr } = await c.rpc('complete_onboarding', { p_full_name: name, p_department_id: dept, p_graduation_year: year })
  if (oErr) throw new Error(`onboarding: ${oErr.message}`)
  return c
}

/** Signs an existing account in with a real emailed code (e.g. seeded moderator/admin). */
export async function signIn(email) {
  const c = client()
  const before = new Date(Date.now() - 1000)
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (error) throw new Error(`signInWithOtp ${email}: ${error.message}`)
  const token = await codeFor(email, before)
  const { error: vErr } = await c.auth.verifyOtp({ email, token, type: 'email' })
  if (vErr) throw new Error(`verifyOtp ${email}: ${vErr.message}`)
  return c
}
