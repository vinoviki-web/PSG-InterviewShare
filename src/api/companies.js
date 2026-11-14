import { request, requireViewer, ApiError, db } from './client'
import { companyBySlug } from '@/mocks/db'
import { serializeExperience, alsoIn } from './experiences'
import { TOPIC } from '@/mocks/lookups'
import { DOMAIN } from '@/lib/taxonomy'

const published = () => db.experiences.filter((e) => e.status === 'published')
const INSIGHT_THRESHOLD = 3

function companyStats(c) {
  const exps = published().filter((e) => e.company_slug === c.slug)
  const latest = exps.map((e) => e.interview_month).sort().at(-1) ?? null
  return {
    id: c.id, slug: c.slug, name: c.name, industry: c.industry, website: c.website, is_verified: c.is_verified, aliases: c.aliases,
    experience_count: exps.length,
    latest_interview: latest,
    last_published_at: exps.map((e) => e.published_at).sort().at(-1) ?? null,
    question_count: exps.reduce((n, e) => n + e.rounds.reduce((m, r) => m + r.questions.length, 0), 0),
  }
}

/** For pickers: every non-merged company, including those with 0 experiences. */
function mock_listAllCompanies() {
  return request(() => db.companies.filter((c) => !c.merged_into_id).map(companyStats).sort((a, b) => a.name.localeCompare(b.name)))
}

function mock_listCompanies({ q = '', industry = '', sort = 'experiences' } = {}) {
  return request(
    () => {
      requireViewer()
      const query = q.trim().toLowerCase()
      let rows = db.companies
        .filter((c) => !c.merged_into_id)
        .map(companyStats)
        .filter((c) => c.experience_count > 0)
        .filter((c) => !industry || c.industry === industry)
        .filter((c) => !query || c.name.toLowerCase().includes(query) || c.aliases.some((a) => a.toLowerCase().includes(query)))
      if (sort === 'az') rows.sort((a, b) => a.name.localeCompare(b.name))
      else if (sort === 'recent') rows.sort((a, b) => (b.last_published_at ?? '').localeCompare(a.last_published_at ?? ''))
      else rows.sort((a, b) => b.experience_count - a.experience_count || a.name.localeCompare(b.name))
      return rows
    },
    { list: [] },
  )
}

function mock_listIndustries() {
  return request(() => [...new Set(db.companies.filter((c) => !c.merged_into_id).map((c) => c.industry))].sort())
}

function mock_getCompany(slug) {
  return request(() => {
    requireViewer()
    let c = companyBySlug(slug)
    if (c?.merged_into_id) return { redirect: c.merged_into_id }
    if (!c) throw new ApiError('We couldn’t find that company.', { code: 'not_found' })
    const byDomain = {}
    db.experiences.filter((e) => e.company_slug === c.slug && e.status === 'published' && e.domain_id).forEach((e) => (byDomain[e.domain_id] = (byDomain[e.domain_id] ?? 0) + 1))
    const domains = Object.entries(byDomain).filter(([id]) => DOMAIN[id]).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ ...DOMAIN[id], count }))
    return { ...companyStats(c), description: c.description, description_source: c.description_source, domains }
  })
}

function mock_getCompanyInsights(slug) {
  return request(() => {
    requireViewer()
    const exps = published().filter((e) => e.company_slug === slug)
    const n = exps.length
    if (n < INSIGHT_THRESHOLD) return { n, sufficient: false, threshold: INSIGHT_THRESHOLD }
    const disclosed = exps.filter((e) => ['selected', 'not_selected'].includes(e.outcome))
    const seqs = {}
    exps.forEach((e) => {
      const k = e.rounds.map((r) => r.round_type).join('>')
      seqs[k] = (seqs[k] ?? 0) + 1
    })
    const sequences = Object.entries(seqs).map(([k, count]) => ({ steps: k.split('>'), count })).sort((a, b) => b.count - a.count)
    const topicCounts = {}
    const roundCounts = {}
    exps.forEach((e) => {
      const ts = new Set([...e.topics, ...e.rounds.flatMap((r) => r.questions.flatMap((q) => q.topics))])
      ts.forEach((t) => (topicCounts[t] = (topicCounts[t] ?? 0) + 1))
      e.rounds.forEach((r) => (roundCounts[r.round_type] = (roundCounts[r.round_type] ?? 0) + 1))
    })
    const batches = {}
    exps.forEach((e) => (batches[e.graduation_year] = (batches[e.graduation_year] ?? 0) + 1))
    const months = exps.map((e) => e.interview_month).sort()
    return {
      n,
      sufficient: true,
      avg_difficulty: Math.round((exps.reduce((s, e) => s + e.difficulty, 0) / n) * 10) / 10,
      selected: disclosed.filter((e) => e.outcome === 'selected').length,
      disclosed: disclosed.length,
      first_month: months[0],
      latest_month: months.at(-1),
      sequences,
      topics: Object.entries(topicCounts).map(([t, count]) => ({ topic: TOPIC[t], count })).filter((x) => x.topic).sort((a, b) => b.count - a.count).slice(0, 8),
      rounds: Object.entries(roundCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      batches: Object.entries(batches).map(([year, count]) => ({ year: Number(year), count })).sort((a, b) => a.year - b.year),
      latest: exps.sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 3).map((e) => serializeExperience(e)),
    }
  })
}

/** Flattened questions for a company. group: 'topic' | 'round' */
function mock_getCompanyQuestions(slug, { kind = '' } = {}) {
  return request(
    () => {
      requireViewer()
      const seen = new Map()
      published()
        .filter((e) => e.company_slug === slug)
        .forEach((e) =>
          e.rounds.forEach((r) =>
            r.questions.forEach((q) => {
              if (kind && q.kind !== kind) return
              const key = q.body.toLowerCase()
              const entry = seen.get(key) ?? {
                id: q.id, body: q.body, kind: q.kind, topics: q.topics.map((t) => TOPIC[t]).filter(Boolean),
                round_types: new Set(), experiences: [], batches: new Set(),
              }
              entry.round_types.add(r.round_type)
              entry.experiences.push({ id: e.id, role_title: e.role_title, year: e.graduation_year })
              entry.batches.add(e.graduation_year)
              seen.set(key, entry)
            }),
          ),
        )
      return [...seen.values()]
        .map((x) => ({ ...x, round_types: [...x.round_types], batches: [...x.batches].sort(), also_in: alsoIn(x.body, x.experiences[0].id) }))
        .sort((a, b) => b.experiences.length - a.experiences.length)
    },
    { list: [] },
  )
}

function mock_trendingCompanies(limit = 6) {
  return request(
    () => {
      requireViewer()
      const cutoff = Date.now() - 120 * 86400000
      const recent = {}
      published()
        .filter((e) => new Date(e.published_at).getTime() > cutoff)
        .forEach((e) => (recent[e.company_slug] = (recent[e.company_slug] ?? 0) + 1 + e.view_count / 500))
      return Object.entries(recent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([slug]) => companyStats(companyBySlug(slug)))
    },
    { list: [] },
  )
}

/* ---- Data-source switch: real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_companies from './sb/companies'
export const listAllCompanies = __USE_SB ? __sb_companies.listAllCompanies : mock_listAllCompanies
export const listCompanies = __USE_SB ? __sb_companies.listCompanies : mock_listCompanies
export const listIndustries = __USE_SB ? __sb_companies.listIndustries : mock_listIndustries
export const getCompany = __USE_SB ? __sb_companies.getCompany : mock_getCompany
export const getCompanyInsights = __USE_SB ? __sb_companies.getCompanyInsights : mock_getCompanyInsights
export const getCompanyQuestions = __USE_SB ? __sb_companies.getCompanyQuestions : mock_getCompanyQuestions
export const trendingCompanies = __USE_SB ? __sb_companies.trendingCompanies : mock_trendingCompanies
