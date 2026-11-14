#!/usr/bin/env node
/**
 * Phase 8 · live comments + reporting integration test (LOCAL stack).
 * Five real students signed in with emailed codes; the same queries as
 * src/api/sb/community.js. Run: npm run db:start && npm run test:community
 */
import { check, finish, onboardedStudent } from './lib.mjs'

console.log('PSG InterviewShare live community test\n')
const [author, r1, r2, r3, r4] = await Promise.all([
  onboardedStudent('ca', 'Comm Author'),
  onboardedStudent('c1', 'Reader One'),
  onboardedStudent('c2', 'Reader Two'),
  onboardedStudent('c3', 'Reader Three'),
  onboardedStudent('c4', 'Reader Four'),
])
const COLS = 'id, parent_id, body, status, is_owner, is_experience_author, author_name, can_edit, edited_at'

async function publish(client, extra = {}) {
  const p = {
    company_slug: 'cisco', role_title: `Software Engineer Intern ${Math.random().toString(36).slice(2, 6)}`, opportunity_type: 'internship', hiring_mode: 'on_campus',
    interview_month: '2025-07-01', department_id: 'cse', graduation_year: 2027, difficulty: 3, outcome: 'selected', confirmed: true,
    rounds: [{ round_type: 'technical', description: 'Networking fundamentals and one linked-list problem with follow-ups.', questions: [] }],
    topics: [], resources: [], ...extra,
  }
  const { data } = await client.rpc('save_draft', { p })
  await client.rpc('publish_experience', { p_id: data.id })
  return data.id
}
const named = await publish(author)
const anon = await publish(author, { is_anonymous: true })

// ---------------------------------------------------------------- comments
let c1
{
  const { data, error } = await r1.from('comments').insert({ experience_id: named, body: 'Was the OA camera-proctored?' }).select('id').single()
  c1 = data?.id
  check(!error && !!c1, 'a student can comment on an experience', error?.message)
  const { data: feed } = await r2.from('comment_feed').select(COLS).eq('id', c1).single()
  check(feed?.author_name === 'Reader One' && !feed.is_owner, 'others see the comment with the commenter’s name')
  const { data: exp } = await r2.from('experience_feed').select('comment_count').eq('id', named).single()
  check(exp?.comment_count === 1, 'the experience’s comment count goes up')

  const { data: reply, error: rErr } = await author.from('comments').insert({ experience_id: named, parent_id: c1, body: 'Yes, for everyone.' }).select('id').single()
  const { data: rf } = await r1.from('comment_feed').select(COLS).eq('id', reply?.id).single()
  check(!rErr && rf?.is_experience_author && rf?.author_name === 'Comm Author', 'the author can reply, marked as the author', rErr?.message)
  const { error: deep } = await r2.from('comments').insert({ experience_id: named, parent_id: reply.id, body: 'Reply to a reply' })
  check(deep?.details === 'invalid_parent', 'replies are one level deep', deep?.details)

  const { error: long } = await r2.from('comments').insert({ experience_id: named, body: 'x'.repeat(2001) })
  check(long?.code === '23514', 'comments over 2,000 characters are refused', long?.code)
  const { error: imp } = await r2.from('comments').insert({ experience_id: named, body: 'Impersonating', author_id: (await r1.auth.getUser()).data.user.id })
  check(!!imp, 'you can’t comment as someone else')
}

// ---------------------------------------------------------------- edit / delete / undo
{
  const { data: e1, error } = await r1.from('comments').update({ body: 'Was the OA camera-proctored for everyone?' }).eq('id', c1).select('id')
  const { data: after } = await r2.from('comment_feed').select(COLS).eq('id', c1).single()
  check(!error && e1.length === 1 && !!after.edited_at, 'you can edit your comment (marked edited)', error?.message)
  const { data: e2 } = await r2.from('comments').update({ body: 'Hijacked' }).eq('id', c1).select('id')
  check((e2 ?? []).length === 0, 'you can’t edit someone else’s comment')
  const { error: mod } = await r1.from('comments').update({ status: 'hidden' }).eq('id', c1)
  check(mod?.details === 'forbidden', 'you can’t apply moderation states yourself', mod?.details)

  await r1.from('comments').update({ status: 'deleted' }).eq('id', c1)
  const { data: del } = await r2.from('comment_feed').select(COLS).eq('id', c1).single()
  check(del.status === 'deleted' && del.body === null, 'a deleted comment’s text disappears for everyone')
  const { data: exp } = await r2.from('experience_feed').select('comment_count').eq('id', named).single()
  check(exp.comment_count === 1, 'deleted comments don’t count')
  await r1.from('comments').update({ status: 'visible' }).eq('id', c1)
  const { data: undo } = await r2.from('comment_feed').select(COLS).eq('id', c1).single()
  check(undo.status === 'visible' && !!undo.body, 'Undo brings the comment back')
}

// ---------------------------------------------------------------- anonymous author replies
{
  const { data: q } = await r1.from('comments').insert({ experience_id: anon, body: 'Did they ask about projects?' }).select('id').single()
  const { data: a } = await author.from('comments').insert({ experience_id: anon, parent_id: q.id, body: 'Yes, for about 15 minutes.' }).select('id').single()
  const { data: seen } = await r2.from('comment_feed').select(COLS).eq('id', a.id).single()
  check(seen.author_name === null && seen.is_experience_author, 'the author of an anonymous post replies as “Author”, without a name')
}

// ---------------------------------------------------------------- reports + auto-hide
{
  const { error } = await r1.rpc('create_report', { p_target_type: 'experience', p_target_id: named, p_reason: 'misleading', p_details: 'Rounds look wrong' })
  check(!error, 'a student can report an experience', error?.message)
  const { error: again } = await r1.rpc('create_report', { p_target_type: 'experience', p_target_id: named, p_reason: 'spam', p_details: '' })
  check(again?.details === 'duplicate', 'you can’t report the same thing twice', again?.details)
  const { data: peek } = await r1.from('reports').select('id')
  check((peek ?? []).length === 0, 'students can’t read reports, even their own')

  await r2.rpc('create_report', { p_target_type: 'experience', p_target_id: named, p_reason: 'misleading', p_details: '' })
  const { data: still } = await r4.from('experience_feed').select('id').eq('id', named)
  check(still.length === 1, 'two reports don’t hide anything')
  await r3.rpc('create_report', { p_target_type: 'experience', p_target_id: named, p_reason: 'confidential', p_details: '' })
  const { data: gone } = await r4.from('experience_feed').select('id').eq('id', named)
  check(gone.length === 0, 'three different reporters auto-hide the experience')
  const { data: own } = await author.from('experience_feed').select('status, hidden_reason').eq('id', named).single()
  check(own?.status === 'hidden' && /3 reports/.test(own.hidden_reason), 'the author still sees it, with the reason')
  const { data: notes } = await author.from('notifications').select('type')
  check(notes.some((n) => n.type === 'experience_hidden'), 'the author is notified')
  const { error: onHidden } = await r4.from('comments').insert({ experience_id: named, body: 'Commenting on a hidden post' })
  check(!!onHidden, 'nobody can comment on a hidden experience')
  const { error: rep4 } = await r4.rpc('create_report', { p_target_type: 'experience', p_target_id: named, p_reason: 'spam', p_details: '' })
  check(rep4?.details === 'not_found', 'hidden content can’t be reported again', rep4?.details)
}

// ---------------------------------------------------------------- reporting a comment
{
  const { data: bad } = await r4.from('comments').insert({ experience_id: anon, body: 'Buy my paid course!!!' }).select('id').single()
  for (const c of [r1, r2, r3]) await c.rpc('create_report', { p_target_type: 'comment', p_target_id: bad.id, p_reason: 'spam', p_details: '' })
  const { data: hidden } = await author.from('comment_feed').select(COLS).eq('id', bad.id).single()
  check(hidden.status === 'hidden' && hidden.body === null, 'three reports hide a comment, and its text disappears')
}

finish()
