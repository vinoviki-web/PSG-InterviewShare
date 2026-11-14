#!/usr/bin/env node
/**
 * Phase 6 · live browse/read integration test against the LOCAL stack
 * (with the demo seed loaded). Uses the same queries as src/api/sb/experiences.js.
 * Run: npm run db:start && npm run db:reset && npm run test:browse
 */
import { check, finish, onboardedStudent } from './lib.mjs'

console.log('Roundwise live browse test\n')
const s = await onboardedStudent('br', 'Browse Student')
const FEED = 'id, company_slug, company_name, role_title, opportunity_type, outcome, difficulty, department_id, graduation_year, pipeline, topic_ids, helpful_count, view_count, published_at, author_name, author_id, is_anonymous, has_voted, has_saved, status'

const page = (q, mod = (x) => x, from = 0, to = 19) =>
  mod(s.rpc('search_feed', { p_q: q }, { count: 'exact' }).select(FEED).eq('status', 'published')).order('published_at', { ascending: false }).order('id', { ascending: false }).range(from, to)

// ---------------------------------------------------------------- listing, paging, counts
{
  const { data, count, error } = await page(null)
  check(!error && count >= 50, 'the feed lists the published demo experiences with a total count', error?.message ?? `${count}`)
  check(data.length === 20, 'pages are 20 rows')
  const { data: p2 } = await page(null, (x) => x, 20, 39)
  check(p2.length === 20 && !p2.some((r) => data.find((d) => d.id === r.id)), '“Load more” returns the next 20 with no repeats')
  check(data.every((r, i) => i === 0 || data[i - 1].published_at >= r.published_at), 'Latest is ordered newest first')
}

// ---------------------------------------------------------------- search + filters
{
  const { data: z } = await page('zoho')
  check(z.length > 0 && z.every((r) => r.company_slug === 'zoho-corporation'), 'searching “zoho” returns Zoho experiences')
  const { data: tcs } = await page('tcs')
  check(tcs.length > 0 && tcs.every((r) => r.company_slug === 'tata-consultancy-services'), 'searching the alias “tcs” finds TCS')
  const { data: dp } = await page('dynamic')
  check(dp.length > 0, 'searching a topic word (“dynamic”) finds experiences')
  const { data: intern } = await page(null, (x) => x.in('opportunity_type', ['internship']))
  check(intern.length > 0 && intern.every((r) => r.opportunity_type === 'internship'), 'type filter works')
  const { data: sel } = await page(null, (x) => x.in('outcome', ['selected']).in('difficulty', [4, 5]))
  check(sel.every((r) => r.outcome === 'selected' && r.difficulty >= 4), 'outcome + difficulty filters combine')
  const { data: sd } = await page(null, (x) => x.contains('pipeline', ['system_design']))
  check(sd.length > 0 && sd.every((r) => r.pipeline.includes('system_design')), '“Includes a system design round” filter works')
  const { data: cse } = await page(null, (x) => x.in('department_id', ['cse']))
  check(cse.every((r) => r.department_id === 'cse'), 'department filter works (hidden departments never match)')
  const { data: helpful } = await s.rpc('search_feed', { p_q: null }).select(FEED).eq('status', 'published').order('helpful_count', { ascending: false }).limit(10)
  check(helpful.every((r, i) => i === 0 || helpful[i - 1].helpful_count >= r.helpful_count) && helpful[0].helpful_count > 0, 'Most helpful sorts by real votes')
  const { data: facets } = await s.rpc('experience_facets')
  check(facets?.type?.internship > 0 && facets?.outcome?.selected > 0, 'facet counts come back for the filter rail')
}

// ---------------------------------------------------------------- anonymity in lists
{
  const { data } = await s.rpc('search_feed', { p_q: null }).select(FEED).eq('is_anonymous', true).limit(20)
  check(data.length > 0 && data.every((r) => r.author_name === null && r.author_id === null), 'anonymous posts never carry an author in lists')
}

// ---------------------------------------------------------------- detail, related, views
let target
{
  const { data } = await page('amazon')
  target = data[0]
  const { data: e, error } = await s.rpc('get_experience', { p_id: target.id })
  check(!error && e.company.slug === 'amazon' && e.rounds.length > 0, 'the experience page loads with its rounds', error?.message)
  check(e.rounds.flatMap((r) => r.questions).every((q) => typeof q.also_in === 'number' && Array.isArray(q.topics)), 'questions carry topics and an “also asked in” count')
  check(e.is_anonymous ? e.author === null : !!e.author?.full_name, 'the author shows only when the post isn’t anonymous')
  const { data: hidden, error: hErr } = await s.rpc('get_experience', { p_id: (await s.from('experience_feed').select('id').eq('status', 'hidden').limit(1)).data?.[0]?.id ?? '00000000-0000-4000-8000-000000000000' })
  check(!!hErr && !hidden, 'a hidden experience can’t be opened by a student')

  const { data: same } = await s.from('experience_feed').select('id').eq('status', 'published').eq('company_slug', 'amazon').neq('id', target.id).limit(4)
  check(same.length > 0, 'related experiences from the same company are found')

  await s.rpc('record_view', { p_id: target.id })
  await s.rpc('record_view', { p_id: target.id })
  const { data: after } = await s.from('experience_feed').select('view_count').eq('id', target.id).single()
  check(after.view_count === target.view_count + 1, 'viewing twice counts once', `${target.view_count} → ${after.view_count}`)
  const { data: recent } = await s.from('experience_views').select('experience_id')
  check(recent.length === 1 && recent[0].experience_id === target.id, 'it appears in “Recently viewed”')
}

// ---------------------------------------------------------------- helpful + saved
{
  const { error } = await s.from('helpful_votes').insert({ experience_id: target.id })
  const { data: v1 } = await s.from('experience_feed').select('helpful_count, has_voted').eq('id', target.id).single()
  check(!error && v1.has_voted && v1.helpful_count === target.helpful_count + 1, 'marking helpful counts immediately', error?.message)
  await s.from('helpful_votes').delete().eq('experience_id', target.id)
  const { data: v2 } = await s.from('experience_feed').select('helpful_count, has_voted').eq('id', target.id).single()
  check(!v2.has_voted && v2.helpful_count === target.helpful_count, 'removing the vote restores the count')

  const { error: bErr } = await s.from('bookmarks').insert({ experience_id: target.id })
  const { data: b } = await s.from('experience_feed').select('has_saved').eq('id', target.id).single()
  check(!bErr && b.has_saved, 'saving an experience works')
  await s.from('bookmarks').delete().eq('experience_id', target.id)

  const { data: mine } = await s.rpc('save_draft', { p: { company_slug: 'oracle', role_title: 'Member of Technical Staff', opportunity_type: 'full_time', hiring_mode: 'on_campus', interview_month: '2025-08-01', department_id: 'cse', graduation_year: 2027, difficulty: 3, outcome: 'selected', confirmed: true, rounds: [{ round_type: 'technical', description: 'Database internals and two SQL questions with follow-ups.', questions: [] }], topics: [], resources: [] } })
  await s.rpc('publish_experience', { p_id: mine.id })
  const { error: own } = await s.from('helpful_votes').insert({ experience_id: mine.id })
  check(own?.code === '42501', 'you can’t mark your own experience as helpful', own?.code)
}

finish()
