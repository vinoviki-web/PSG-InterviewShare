/**
 * Companies on the real database: picker list (Phase 5), directory, company
 * pages, insights, questions and trending (Phase 7). Shapes match the
 * prototype's src/api/companies.js.
 */
import { supabase } from '@/lib/supabase'
import { DOMAIN } from '@/lib/taxonomy'
import { unwrap } from './errors'
import { getLookups, feedRowToExperience, FEED_COLUMNS } from './mappers'

/** Every live (non-merged) company with aliases and published-experience counts. */
export async function listAllCompanies() {
  const [companies, feed] = await Promise.all([
    supabase.from('companies').select('id, slug, name, industry, website, is_verified, merged_into_id, company_aliases(alias)').is('merged_into_id', null).order('name').then(unwrap),
    supabase.from('experience_feed').select('company_slug, interview_month, published_at').eq('status', 'published').then(unwrap),
  ])
  const stats = {}
  for (const r of feed) {
    const s = (stats[r.company_slug] ??= { n: 0, latest: null, last: null })
    s.n++
    if (!s.latest || r.interview_month > s.latest) s.latest = r.interview_month
    if (!s.last || r.published_at > s.last) s.last = r.published_at
  }
  return companies.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    industry: c.industry,
    website: c.website,
    is_verified: c.is_verified,
    aliases: (c.company_aliases ?? []).map((a) => a.alias),
    experience_count: stats[c.slug]?.n ?? 0,
    latest_interview: stats[c.slug]?.latest ?? null,
    last_published_at: stats[c.slug]?.last ?? null,
  }))
}

/* ---------------- Phase 7: directory, page, insights, questions, trending ---------------- */

export async function listCompanies({ q = '', industry = '', sort = 'experiences' } = {}) {
  return unwrap(await supabase.rpc('company_directory', { p_q: q, p_industry: industry, p_sort: sort }))
}

export async function listIndustries() {
  return unwrap(await supabase.rpc('company_industries'))
}

/** One company; a merged company returns { redirect: slug }. */
export async function getCompany(slug) {
  const c = unwrap(await supabase.rpc('get_company', { p_slug: slug }))
  if (!c || c.redirect) return c
  return { ...c, domains: (c.domains ?? []).filter((d) => DOMAIN[d.id]).map((d) => ({ ...DOMAIN[d.id], count: d.count })) }
}

/** Student-reported insights (or { n, sufficient: false, threshold }) + the latest 3 experiences. */
export async function getCompanyInsights(slug) {
  const insights = unwrap(await supabase.rpc('get_company_insights', { p_slug: slug }))
  if (!insights?.sufficient) return insights
  const lookups = await getLookups()
  const latest = unwrap(
    await supabase.from('experience_feed').select(FEED_COLUMNS).eq('status', 'published').eq('company_slug', slug).order('published_at', { ascending: false }).limit(3),
  )
  return { ...insights, latest: latest.map((r) => feedRowToExperience(r, lookups)) }
}

/** Questions reported for a company, grouped and most-reported first. kind: '' | coding | technical | hr | … */
export async function getCompanyQuestions(slug, { kind = '' } = {}) {
  const lookups = await getLookups()
  const rows = unwrap(await supabase.rpc('get_company_questions', { p_slug: slug, p_kind: kind }))
  return rows.map((r) => ({ ...r, topics: (r.topics ?? []).map((t) => lookups.topics[t.value] ?? t) }))
}

export async function trendingCompanies(limit = 6) {
  return unwrap(await supabase.rpc('trending_companies', { p_limit: limit }))
}

