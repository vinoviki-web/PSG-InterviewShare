import { supabase } from '@/lib/supabase'
import { unwrap } from './errors'

let lookupsPromise
/** Departments and topics from the database, cached for the session. */
export function getLookups() {
  lookupsPromise ??= Promise.all([
    supabase.from('departments').select('id, code, name, degree').then(unwrap),
    supabase.from('topics').select('id, name, group_name').then(unwrap),
  ])
    .then(([departments, topics]) => ({
      departments: Object.fromEntries(departments.map((d) => [d.id, d])),
      topics: Object.fromEntries(topics.map((t) => [t.id, { value: t.id, label: t.name, group: t.group_name }])),
    }))
    .catch((e) => {
      lookupsPromise = undefined
      throw e
    })
  return lookupsPromise
}

/** experience_feed row → the shape the UI components expect (same as the mock API). */
export function feedRowToExperience(r, { departments, topics }) {
  return {
    id: r.id,
    company: { id: r.company_id, slug: r.company_slug, name: r.company_name, is_verified: r.company_verified },
    role_title: r.role_title,
    opportunity_type: r.opportunity_type,
    hiring_mode: r.hiring_mode,
    department: r.department_id ? departments[r.department_id] ?? null : null,
    graduation_year: r.graduation_year,
    interview_month: r.interview_month,
    difficulty: r.difficulty,
    outcome: r.outcome,
    is_anonymous: r.is_anonymous,
    status: r.status,
    hidden_reason: r.hidden_reason ?? undefined,
    published_at: r.published_at,
    updated_at: r.updated_at,
    edited: r.edited,
    helpful_count: r.helpful_count,
    view_count: r.view_count,
    comment_count: r.comment_count,
    topics: (r.topic_ids ?? []).map((t) => topics[t]).filter(Boolean),
    pipeline: (r.pipeline ?? []).map((type) => ({ type })),
    question_count: r.question_count,
    excerpt: r.excerpt,
    // Estimate until the feed carries word counts (Phase 6)
    reading_minutes: Math.max(1, Math.round((300 + r.question_count * 30 + (r.excerpt?.length ?? 0)) / 200)),
    author: r.author_name ? { id: r.author_id, full_name: r.author_name, handle: r.author_handle } : null,
    is_owner: r.is_owner,
    has_voted: r.has_voted,
    has_saved: r.has_saved,
  }
}

export const FEED_COLUMNS =
  'id, company_id, company_slug, company_name, company_verified, role_title, opportunity_type, hiring_mode, department_id, graduation_year, ' +
  'interview_month, difficulty, outcome, is_anonymous, status, hidden_reason, published_at, updated_at, edited, helpful_count, view_count, ' +
  'comment_count, author_id, author_name, author_handle, is_owner, has_voted, has_saved, topic_ids, pipeline, question_count, excerpt'
