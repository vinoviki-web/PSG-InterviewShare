#!/usr/bin/env node
/**
 * Phase 4 · live sign-in integration test against the LOCAL Supabase stack.
 * Exercises the real Auth server, Mailpit, PostgREST, Storage and the
 * delete-account Edge Function. Run: npm run db:start && npm run test:auth
 *
 * Refuses to run against anything but localhost.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.db.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_)) {
  console.error(`Refusing to run against ${URL_}: local stack only.`)
  process.exit(2)
}

let passed = 0
let failed = 0
const check = (ok, name, extra = '') => {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'ok    ' : 'FAIL  '} ${name}${!ok && extra ? `  →  ${extra}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const client = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = Date.now().toString(36)

async function codeFor(email, after) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const { messages = [] } = await res.json()
    const fresh = messages.filter((m) => new Date(m.Created) >= after)
    if (fresh.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`)).json()
      const code = (msg.Text ?? '').match(/\b(\d{6})\b/)?.[1] ?? (msg.HTML ?? '').match(/>\s*(\d{6})\s*</)?.[1]
      return { code, subject: msg.Subject, html: msg.HTML ?? '' }
    }
    await sleep(500)
  }
  return {}
}

async function signInWithCode(c, email) {
  const before = new Date(Date.now() - 1000)
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw new Error(`signInWithOtp: ${error.message}`)
  const mail = await codeFor(email, before)
  const { data, error: vErr } = await c.auth.verifyOtp({ email, token: mail.code, type: 'email' })
  if (vErr) throw new Error(`verifyOtp: ${vErr.message}`)
  return { session: data.session, mail }
}

console.log(`PSG InterviewShare live auth test · ${URL_}\n`)

// ---------------------------------------------------------------- domain
{
  const c = client()
  const { error } = await c.auth.signInWithOtp({ email: `someone.${stamp}@gmail.com`, options: { shouldCreateUser: true } })
  check(error?.status === 403 && /psgtech/i.test(error.message), 'Gmail sign-in code request is refused with 403', error?.message)

  const { error: e2 } = await c.auth.signUp({ email: `pw.${stamp}@gmail.com`, password: 'Sup3r-secret-pass!' })
  check(!!e2, 'Gmail password sign-up is refused', 'no error')

  const { data: d3 } = await c.auth.signUp({ email: `pw${stamp}@psgtech.ac.in`, password: 'Sup3r-secret-pass!' })
  check(!d3?.session, 'a PSG password sign-up gets no session without confirming the mailbox')
  const { error: e4 } = await c.auth.signInWithPassword({ email: `pw${stamp}@psgtech.ac.in`, password: 'Sup3r-secret-pass!' })
  check(!!e4, 'an unconfirmed password account cannot sign in', 'signed in')
}

// ---------------------------------------------------------------- code sign-in
const email = `it${stamp}@psgtech.ac.in`
const A = client()
let sessionA
{
  const before = new Date(Date.now() - 1000)
  const { error } = await A.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  check(!error, 'a PSG address can request a sign-in code', error?.message)
  const mail = await codeFor(email, before)
  check(/^\d{6}$/.test(mail.code ?? ''), 'a 6-digit code arrives by email (Mailpit)', JSON.stringify(mail.subject))
  check(mail.subject === 'Your PSG InterviewShare sign-in code', 'the email uses the PSG InterviewShare template', mail.subject)
  check(!/href=|token_hash|verify\?/i.test(mail.html ?? ''), 'the email contains a code, not a sign-in link')

  const { error: again } = await A.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  check(!!again, 'a second code within 30 seconds is refused (resend limit)', 'allowed')

  const wrong = mail.code === '000000' ? '111111' : '000000'
  const { error: bad } = await A.auth.verifyOtp({ email, token: wrong, type: 'email' })
  check(!!bad, 'a wrong code is refused', 'accepted')

  const { data, error: vErr } = await A.auth.verifyOtp({ email, token: mail.code, type: 'email' })
  sessionA = data?.session
  check(!vErr && !!sessionA, 'the right code signs the student in', vErr?.message)
  check(sessionA?.user?.email === email, 'the session belongs to the right email')
}

// ---------------------------------------------------------------- onboarding + data access
{
  const { data: feed0 } = await A.from('experience_feed').select('id')
  check((feed0 ?? []).length === 0, 'before onboarding, the student reads no experiences')
  const { error } = await A.rpc('complete_onboarding', { p_full_name: 'Integration Student', p_department_id: 'cse', p_graduation_year: 2027, p_interests: ['SDE'], p_topic_ids: ['graphs'] })
  check(!error, 'onboarding succeeds', error?.message)
  const { data: feed1 } = await A.from('experience_feed').select('id')
  check((feed1 ?? []).length >= 1, 'after onboarding, published experiences are readable', `${feed1?.length}`)

  const uid = sessionA.user.id
  const { error: upd } = await A.from('profiles').update({ bio: 'Hello from the integration test' }).eq('id', uid)
  check(!upd, 'the student can edit their bio', upd?.message)
  const { error: bad } = await A.from('profiles').update({ status: 'active' }).eq('id', uid)
  check(!!bad, 'the student cannot edit their account status', 'allowed')
  const { error: role } = await A.from('user_roles').insert({ user_id: uid, role: 'admin' })
  check(!!role, 'the student cannot grant themselves admin', 'allowed')

  const png = new Blob([Uint8Array.from([0x52, 0x49, 0x46, 0x46])], { type: 'image/webp' })
  const { error: up } = await A.storage.from('avatars').upload(`${uid}/avatar-test.webp`, png, { contentType: 'image/webp' })
  check(!up, 'the student can upload their avatar', up?.message)
  const { data: signed } = await A.storage.from('avatars').createSignedUrl(`${uid}/avatar-test.webp`, 60)
  check(!!signed?.signedUrl, 'the avatar is served through a signed URL')
  const { error: other } = await A.storage.from('avatars').upload(`00000000-0000-4000-8000-000000000000/x.webp`, png, { contentType: 'image/webp' })
  check(!!other, 'the student cannot write to another student’s avatar folder', 'allowed')
  const { error: exe } = await A.storage.from('avatars').upload(`${uid}/evil.svg`, new Blob(['<svg/>'], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' })
  check(!!exe, 'SVG uploads are refused (MIME allowlist)', 'allowed')

  const visitor = client()
  const { data: v, error: ve } = await visitor.from('experience_feed').select('id')
  check(!!ve || (v ?? []).length === 0, 'a signed-out visitor reads no experiences')
  const { data: stats } = await visitor.rpc('get_public_stats')
  check(typeof stats?.experiences === 'number', 'a signed-out visitor gets aggregate stats only')
}

// ---------------------------------------------------------------- sign out everywhere
{
  const B = client()
  await B.auth.setSession({ access_token: sessionA.access_token, refresh_token: sessionA.refresh_token })
  const { error } = await A.auth.signOut({ scope: 'global' })
  check(!error, 'sign out of all devices succeeds', error?.message)
  const { error: refresh } = await B.auth.refreshSession()
  check(!!refresh, 'the other device can no longer refresh its session', 'refreshed')
}

// ---------------------------------------------------------------- account deletion (Edge Function)
{
  const email2 = `del${stamp}@psgtech.ac.in`
  const C = client()
  const { session } = await signInWithCode(C, email2)
  await C.rpc('complete_onboarding', { p_full_name: 'Delete Me', p_department_id: 'it', p_graduation_year: 2026 })
  const { data, error } = await C.functions.invoke('delete-account', { body: { mode: 'anonymise' } })
  check(!error && data?.ok, 'the delete-account Edge Function deletes the account', error?.message ?? JSON.stringify(data))
  const D = client()
  const { error: gone } = await D.auth.getUser(session.access_token)
  check(!!gone, 'the deleted user’s token no longer resolves to a user', 'still exists')
  const noAuth = await fetch(`${URL_}/functions/v1/delete-account`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: '{}' })
  check(noAuth.status === 401, 'the Edge Function refuses calls without a signed-in user', `HTTP ${noAuth.status}`)
  // verify_jwt is off (LA7), so the function's own check must reject anything that isn't a live session.
  const fnCall = (bearer) => fetch(`${URL_}/functions/v1/delete-account`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}',
  }).then((r) => r.status)
  const forged = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', btoa(JSON.stringify({ sub: crypto.randomUUID(), role: 'authenticated' })).replace(/=+$/, ''), 'forged'].join('.')
  check((await fnCall(forged)) === 401, 'the Edge Function refuses a forged token')
  check((await fnCall(ANON)) === 401, 'the Edge Function refuses the public key used as a token')
  check((await fnCall(session.access_token)) === 401, 'the Edge Function refuses the deleted user’s old token')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
