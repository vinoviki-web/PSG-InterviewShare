/**
 * The ONLY data callable without a session (planned as `get_public_stats()`
 * RPC granted to `anon`). Aggregates only: no experience text, no people.
 */
import { request, db } from './client'

function mock_getPublicStats() {
  return request(() => {
    const pub = db.experiences.filter((e) => e.status === 'published')
    const byCompany = {}
    pub.forEach((e) => (byCompany[e.company_slug] = (byCompany[e.company_slug] ?? 0) + 1))
    const threshold = db.settings.landing_stats_threshold
    return {
      show_counts: pub.length >= threshold,
      experiences: pub.length,
      companies: Object.keys(byCompany).length,
      departments: new Set(pub.filter((e) => !e.hide_department).map((e) => e.department_id)).size,
      questions: pub.reduce((n, e) => n + e.rounds.reduce((m, r) => m + r.questions.length, 0), 0),
      // Per-domain counts follow the same threshold as the headline counts (MD5).
      domains: pub.length >= threshold ? pub.reduce((m, e) => (e.domain_id ? ((m[e.domain_id] = (m[e.domain_id] ?? 0) + 1), m) : m), {}) : {},
      top_companies: Object.entries(byCompany)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([slug, count]) => {
          const tally = {}
          pub.filter((e) => e.company_slug === slug && e.domain_id).forEach((e) => (tally[e.domain_id] = (tally[e.domain_id] ?? 0) + 1))
          const domain = Object.entries(tally).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0] ?? null
          return { name: db.companies.find((c) => c.slug === slug)?.name, count, domain }
        }),
    }
  })
}

function mock_getAnnouncement() {
  return request(() => {
    const a = db.settings.announcement
    if (!a?.text) return null
    if (a.expires_at && new Date(a.expires_at) < new Date()) return null
    return a
  })
}

/* Database mode (found in the multi-domain review: these two were never switched over) */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_public from './sb/public'
export const getPublicStats = __USE_SB ? __sb_public.getPublicStats : mock_getPublicStats
export const getAnnouncement = __USE_SB ? __sb_public.getAnnouncement : mock_getAnnouncement
