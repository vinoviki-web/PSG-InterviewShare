import { DEPARTMENT, TOPIC } from '@/mocks/lookups'
import { readingMinutes } from '@/lib/utils'

const isHttps = (u) => {
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Form values → the exact shape `serializeExperience(e, v, { full: true })`
 * produces, as a READER will see it (anonymity and hidden department applied),
 * so the Review step can render <ExperienceArticle /> unchanged.
 */
export function toPreview(v, { user, id, companies, edited, updatedAt } = {}) {
  const co = v.company
  const known = co?.slug ? companies?.find((c) => c.slug === co.slug) : null
  const el = v.eligibility
  const cgpa = el?.cgpa?.trim?.() ? Number(el.cgpa) : null
  const hasEligibility = el && (cgpa != null || el.branches?.length || (el.backlogs && el.backlogs !== 'unknown') || el.other?.trim())
  const rounds = v.rounds.map((r, i) => ({
    id: r.id,
    position: i + 1,
    round_type: r.round_type || 'other',
    mode: r.mode,
    duration_minutes: r.duration_minutes ? Number(r.duration_minutes) : null,
    difficulty: r.difficulty,
    description: r.description,
    questions: r.questions
      .filter((q) => q.body.trim())
      .map((q) => ({ id: q.id, body: q.body, kind: q.kind, topics: q.topics.map((t) => TOPIC[t]).filter(Boolean), also_in: [] })),
  }))
  const questions = rounds.flatMap((r) => r.questions)
  return {
    id: id ?? 'preview',
    company: { name: known?.name ?? co?.name ?? 'Company', slug: known?.slug ?? null, is_verified: known?.is_verified ?? false },
    role_title: v.role_title.trim() || 'Role title',
    opportunity_type: v.opportunity_type,
    hiring_mode: v.hiring_mode,
    department: v.is_anonymous && v.hide_department ? null : DEPARTMENT[v.department_id] ?? null,
    graduation_year: v.graduation_year ? Number(v.graduation_year) : null,
    interview_month: v.interview_month,
    difficulty: v.difficulty,
    outcome: v.outcome,
    is_anonymous: v.is_anonymous,
    hide_department: v.hide_department,
    status: 'published',
    edited: !!edited,
    updated_at: updatedAt ?? new Date().toISOString(),
    topics: v.topics.map((t) => TOPIC[t]).filter(Boolean),
    eligibility: hasEligibility ? { cgpa, branches: el.branches, backlogs: el.backlogs, other: el.other?.trim() } : null,
    application_process: v.application_process.trim(),
    preparation: v.preparation.trim(),
    resources: v.resources.filter((r) => r.title.trim() && isHttps(r.url.trim())).map((r) => ({ ...r, url: r.url.trim() })),
    advice: v.advice.trim(),
    rounds,
    reading_minutes: readingMinutes(v.application_process, v.preparation, v.advice, ...v.rounds.map((r) => r.description), ...questions.map((q) => q.body)),
    author: v.is_anonymous || !user ? null : { id: user.id, full_name: user.full_name, handle: null },
    is_owner: false,
    helpful_count: 0,
    comment_count: 0,
  }
}
