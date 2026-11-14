#!/usr/bin/env node
/**
 * Phase 9 · live moderation + admin integration test (LOCAL stack, seed loaded).
 * Seeded moderator (21z235) and admin (22e646) sign in with real emailed codes.
 * Run: npm run db:start && npm run db:reset && npm run test:admin
 */
import { check, finish, onboardedStudent, signIn, stamp } from './lib.mjs'

console.log('PSG InterviewShare live moderation + admin test\n')
const [author, r1, r2, r3] = await Promise.all([
  onboardedStudent('ma', 'Mod Author'), onboardedStudent('m1', 'Rep One'), onboardedStudent('m2', 'Rep Two'), onboardedStudent('m3', 'Rep Three'),
])
const mod = await signIn('21z235@psgtech.ac.in')
const admin = await signIn('22e646@psgtech.ac.in')
const call = async (c, fn, args) => {
  const { data, error } = await c.rpc(fn, args)
  return { data, error }
}

async function publish(extra = {}) {
  const p = { company_slug: 'walmart-global-tech', role_title: `Software Engineer Intern ${Math.random().toString(36).slice(2, 6)}`, opportunity_type: 'internship', hiring_mode: 'on_campus',
    interview_month: '2025-07-01', department_id: 'cse', graduation_year: 2027, difficulty: 3, outcome: 'selected', confirmed: true,
    rounds: [{ round_type: 'technical', description: 'Graph problem with follow-ups and a short project discussion.', questions: [] }], topics: [], resources: [], ...extra }
  const { data } = await author.rpc('save_draft', { p })
  await author.rpc('publish_experience', { p_id: data.id })
  return data.id
}
const named = await publish()
const anon = await publish({ is_anonymous: true })
for (const r of [r1, r2, r3]) await r.rpc('create_report', { p_target_type: 'experience', p_target_id: named, p_reason: 'misleading', p_details: '' })
await r1.rpc('create_report', { p_target_type: 'experience', p_target_id: anon, p_reason: 'abusive', p_details: 'Names the interviewer' })

// ---------------------------------------------------------------- access
{
  const { error } = await call(r1, 'mod_queue', { p_tab: 'open' })
  check(error?.details === 'forbidden', 'a student can’t open the moderation queue', error?.details)
  const { error: e2 } = await call(mod, 'admin_overview')
  check(e2?.details === 'forbidden', 'a moderator can’t open the admin overview', e2?.details)
}

// ---------------------------------------------------------------- moderator
{
  const { data: q } = await call(mod, 'mod_queue', { p_tab: 'open' })
  const row = q.items.find((i) => i.target_id === named)
  check(row?.state === 'auto_hidden' && row.active_count === 3, 'the queue shows the auto-hidden post with 3 reports')
  check(row && row.reporters === null, 'moderators never see who reported')
  const { data: item } = await call(mod, 'mod_item', { p_type: 'experience', p_id: anon })
  check(item?.author?.masked === true && item.author.user === null && item.content?.author === null, 'an anonymous author stays masked in the drawer')

  const { error: v } = await call(mod, 'mod_hide', { p_type: 'experience', p_id: anon, p_reason: 'abusive', p_message: 'short' })
  check(v?.details === 'validation', 'hiding needs a real message to the author', v?.details)
  const { data: hid } = await call(mod, 'mod_hide', { p_type: 'experience', p_id: anon, p_reason: 'abusive', p_message: 'Please remove the remarks about the interviewer.' })
  const { data: gone } = await r2.from('experience_feed').select('id').eq('id', anon)
  check(!!hid?.action_id && gone.length === 0, 'hiding removes the post from students’ feeds')
  const { data: notes } = await author.from('notifications').select('type, payload')
  check(notes.some((n) => n.type === 'content_hidden' && /remarks/.test(n.payload.body)), 'the author receives the moderator’s message')
  await call(mod, 'mod_undo', { p_action_id: hid.action_id })
  const { data: back } = await r2.from('experience_feed').select('id').eq('id', anon)
  const { data: notes2 } = await author.from('notifications').select('type')
  check(back.length === 1 && !notes2.some((n) => n.type === 'content_hidden'), 'Undo restores the post and withdraws the notification')

  const { data: dis } = await call(mod, 'mod_dismiss', { p_type: 'experience', p_id: named, p_note: 'Rounds match other reports' })
  const { data: restored } = await r2.from('experience_feed').select('id').eq('id', named)
  check(dis?.restored === true && restored.length === 1, 'dismissing restores the auto-hidden post')
  await call(mod, 'mod_escalate_to_admin', { p_type: 'experience', p_id: anon, p_note: 'Needs an admin decision' })
  const { data: locked } = await call(mod, 'mod_item', { p_type: 'experience', p_id: anon })
  check(locked?.permissions?.blocked === 'escalated', 'after escalating, moderators can only watch')
}

// ---------------------------------------------------------------- admin
{
  const { data: reps } = await call(admin, 'admin_reports', { p_status: 'escalated', p_q: '' })
  const row = reps.items.find((i) => i.target_id === anon)
  check(row?.reporters?.[0]?.email?.endsWith('@psgtech.ac.in'), 'admins see who reported (with email)')
  const { error: noReason } = await call(admin, 'admin_unmask', { p_type: 'experience', p_id: anon, p_reason: 'why' })
  check(noReason?.details === 'validation', 'unmasking needs a reason')
  const { data: who } = await call(admin, 'admin_unmask', { p_type: 'experience', p_id: anon, p_reason: `Harassment ticket ${stamp}` })
  check(who?.full_name === 'Mod Author', 'an admin can unmask with a reason')
  const { data: log } = await call(admin, 'admin_audit', { p: { action: 'experience.unmask' } })
  check(log.items.some((i) => i.metadata?.reason === `Harassment ticket ${stamp}`), 'the unmask is in the audit log with its reason')

  const { data: sus } = await call(admin, 'admin_suspend_author', { p_type: 'experience', p_id: anon, p_days: 7, p_reason: 'Personal attacks in a post' })
  const { data: blocked } = await author.from('experience_feed').select('id').limit(1)
  check(!!sus?.until && blocked.length === 0, 'suspending the author locks them out immediately')
  const { data: users } = await call(admin, 'admin_users', { p: { q: 'mod author' } })
  check(users.items[0]?.status === 'suspended' && users.items[0]?.suspension?.reason === 'Personal attacks in a post', 'the users list shows the suspension and reason')
  await call(admin, 'admin_lift_suspension', { p_user: users.items[0].id })
  const { data: again } = await author.from('experience_feed').select('id').limit(1)
  check(again.length === 1, 'lifting the suspension restores access')

  const { error: rmErr } = await call(admin, 'admin_remove_content', { p_type: 'experience', p_id: anon, p_reason: 'Names a private individual' })
  const { data: rmGone } = await r2.from('experience_feed').select('id').eq('id', anon)
  check(!rmErr && rmGone.length === 0, 'an admin can remove content', rmErr?.message)

  const { data: co1, error: cErr } = await call(admin, 'admin_save_company', { p_id: null, p: { name: `Halo Robotics ${stamp}`, industry: 'Robotics', website: 'https://halo-robotics.example.com/', aliases: [`Halo ${stamp}`] } })
  check(!cErr && co1?.website === 'halo-robotics.example.com' && co1.is_verified, 'an admin can add a company (website normalised)', cErr?.message)
  const { data: co2 } = await call(admin, 'admin_save_company', { p_id: null, p: { name: `Halo Robotics India ${stamp}`, industry: 'Robotics' } })
  const { data: prev } = await call(admin, 'admin_merge_preview', { p_source: co2.id, p_target: co1.id })
  check(prev?.aliases_added?.includes(`Halo Robotics India ${stamp}`), 'the merge preview shows what will move')
  const { data: merged } = await call(admin, 'admin_merge_companies', { p_source: co2.id, p_target: co1.id })
  const { data: redirect } = await r1.rpc('get_company', { p_slug: co2.slug })
  check(merged?.moved === 0 && redirect?.redirect === co1.slug, 'merging makes the old company redirect')

  const { data: before } = await admin.from('platform_settings').select('announcement, flags, limits, landing_stats_threshold').single()
  const { error: bad } = await call(admin, 'admin_save_settings', { p: { ...before, limits: { ...before.limits, publish_per_day: 0 } } })
  check(bad?.details === 'validation', 'settings are validated')
  const { error: ok } = await call(admin, 'admin_save_settings', { p: { ...before, announcement: { text: 'Zoho drive on Friday', tone: 'info', expires_at: null } } })
  const { data: banner } = await r1.from('platform_settings').select('announcement').single()
  check(!ok && banner.announcement.text === 'Zoho drive on Friday', 'an announcement reaches students')
  await call(admin, 'admin_save_settings', { p: before })

  const { data: ov } = await call(admin, 'admin_overview')
  check(ov?.signups?.length === 8 && ov.kpis.students > 0, 'the overview loads with 8 weeks of charts')
}

finish()
