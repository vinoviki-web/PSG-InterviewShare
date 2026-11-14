#!/usr/bin/env node
/**
 * Phase 7 · live companies integration test against the LOCAL stack (demo
 * seed loaded). Cross-checks every insight against the raw feed.
 * Run: npm run db:start && npm run db:reset && npm run test:companies
 */
import { check, finish, onboardedStudent } from './lib.mjs'

console.log('Roundwise live companies test\n')
const s = await onboardedStudent('co', 'Company Student')
const rpc = async (fn, args) => {
  const { data, error } = await s.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

// ---------------------------------------------------------------- directory
{
  const all = await rpc('company_directory', { p_q: '', p_industry: '', p_sort: 'experiences' })
  check(all.length >= 15 && all.every((c) => c.experience_count > 0), 'the directory lists companies that have experiences', `${all.length}`)
  check(all.every((c, i) => i === 0 || all[i - 1].experience_count >= c.experience_count), 'sorted by most experiences')
  const az = await rpc('company_directory', { p_q: '', p_industry: '', p_sort: 'az' })
  check(az.every((c, i) => i === 0 || az[i - 1].name.toLowerCase() <= c.name.toLowerCase()), 'A–Z sort works')
  const tcs = await rpc('company_directory', { p_q: 'tcs', p_industry: '', p_sort: 'experiences' })
  check(tcs.length === 1 && tcs[0].slug === 'tata-consultancy-services', 'searching the alias “tcs” finds Tata Consultancy Services')
  const industries = await rpc('company_industries', {})
  const sw = await rpc('company_directory', { p_q: '', p_industry: 'Software', p_sort: 'experiences' })
  check(industries.includes('Software') && sw.length > 0 && sw.every((c) => c.industry === 'Software'), 'the industry filter works')
}

// ---------------------------------------------------------------- page + insights cross-checked against the feed
for (const slug of ['amazon', 'zoho-corporation']) {
  const page = await rpc('get_company', { p_slug: slug })
  const { data: feed } = await s.from('experience_feed').select('id, difficulty, outcome, pipeline, graduation_year, question_count').eq('status', 'published').eq('company_slug', slug)
  check(page.experience_count === feed.length, `${page.name}: the page count matches the feed (${feed.length})`)
  check(page.question_count === feed.reduce((n, r) => n + r.question_count, 0), `${page.name}: the question count matches the feed`)

  const ins = await rpc('get_company_insights', { p_slug: slug })
  const avg = Math.round((feed.reduce((s2, r) => s2 + r.difficulty, 0) / feed.length) * 10) / 10
  check(ins.sufficient && ins.n === feed.length, `${page.name}: insights are shown for ${feed.length} experiences`)
  check(Number(ins.avg_difficulty) === avg, `${page.name}: average difficulty matches (${avg})`, `${ins.avg_difficulty}`)
  check(ins.selected === feed.filter((r) => r.outcome === 'selected').length && ins.disclosed === feed.filter((r) => ['selected', 'not_selected'].includes(r.outcome)).length, `${page.name}: reported outcomes match`)
  check(ins.sequences.reduce((n, q) => n + q.count, 0) === feed.length, `${page.name}: every experience is counted in exactly one process`)
  const top = ins.sequences[0]
  check(top.count === feed.filter((r) => r.pipeline.join('>') === top.steps.join('>')).length, `${page.name}: the most common process count is right`)
  check(ins.batches.reduce((n, b) => n + b.count, 0) === feed.length, `${page.name}: batches add up`)
  check(ins.topics.length > 0 && ins.topics.every((t) => t.count <= feed.length), `${page.name}: topic counts are per experience`)

  const qs = await rpc('get_company_questions', { p_slug: slug, p_kind: '' })
  check(qs.length > 0 && qs.every((q, i) => i === 0 || qs[i - 1].experiences.length >= q.experiences.length), `${page.name}: questions are listed most-reported first`)
  check(qs.every((q) => q.experiences.every((e) => feed.some((r) => r.id === e.id))), `${page.name}: every question links to a published experience`)
  const coding = await rpc('get_company_questions', { p_slug: slug, p_kind: 'coding' })
  check(coding.every((q) => q.kind === 'coding'), `${page.name}: the question-type filter works`)
}

// ---------------------------------------------------------------- small and unverified companies
{
  const page = await rpc('get_company', { p_slug: 'kissflow' })
  check(page.is_verified === false && page.description === null, 'an unverified student-added company has no official description')
  const ins = await rpc('get_company_insights', { p_slug: 'kissflow' })
  check(ins.sufficient === false && ins.threshold === 3, 'a company with fewer than 3 experiences gets no insights, only the count')
  const { error } = await s.rpc('get_company', { p_slug: 'no-such-company' })
  check(error?.details === 'not_found', 'an unknown company is not found')
}

// ---------------------------------------------------------------- trending
{
  const t = await rpc('trending_companies', { p_limit: 6 })
  check(t.length > 0 && t.length <= 6 && t.every((c) => c.slug && c.experience_count > 0), 'trending companies come back for Home')
}

finish()
