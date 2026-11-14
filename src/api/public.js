/**
 * The ONLY data callable without a session (planned as `get_public_stats()`
 * RPC granted to `anon`). Aggregates only: no experience text, no people.
 */
import { request, db } from './client'

export function getPublicStats() {
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
      top_companies: Object.entries(byCompany)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([slug, count]) => ({ name: db.companies.find((c) => c.slug === slug)?.name, count })),
    }
  })
}

export function getAnnouncement() {
  return request(() => {
    const a = db.settings.announcement
    if (!a?.text) return null
    if (a.expires_at && new Date(a.expires_at) < new Date()) return null
    return a
  })
}
