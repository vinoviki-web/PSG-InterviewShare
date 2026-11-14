import { z } from 'zod'
import { DOMAINS } from '@/lib/taxonomy'
import { LIMITS } from '@/api/drafts'
import { OPPORTUNITY_TYPES, HIRING_MODES, OUTCOMES, ROUND_TYPES, QUESTION_KINDS, RESOURCE_KINDS } from '@/lib/constants'

export const STEPS = [
  { id: 'basics', title: 'Basics', blurb: 'Company, role and when you interviewed.' },
  { id: 'process', title: 'Process', blurb: 'Tell juniors how the process worked, round by round.' },
  { id: 'preparation', title: 'Preparation', blurb: 'What you studied and what actually helped.' },
  { id: 'outcome', title: 'Outcome & advice', blurb: 'How it went, and what you’d tell a junior.' },
  { id: 'review', title: 'Review', blurb: 'This is exactly how your experience will look.' },
]

const vals = (list) => list.map((x) => x.value)
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`
export const newRoundId = () => uid('r')
export const newQuestionId = () => uid('q')

const ROUND_TYPE_VALUES = vals(ROUND_TYPES)

const numOrBlank = (lo, hi, message) =>
  z.string().refine((v) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi), message)

/* ---------------- Step schemas ---------------- */
const now = new Date()
const basics = z.object({
  company: z.custom((v) => !!v && (!!v.slug || (v.is_new && v.name?.trim().length >= 2)), {
    error: 'Choose the company, or add it if it isn’t listed.',
  }),
  role_title: z
    .string()
    .trim()
    .min(LIMITS.role_title[0], 'Enter the role title from the job post.')
    .max(LIMITS.role_title[1], 'Keep the role title under 100 characters.'),
  domain_id: z.enum(DOMAINS.map((d) => d.value), { error: 'Choose the domain this role belongs to.' }),
  opportunity_type: z.enum(vals(OPPORTUNITY_TYPES), { error: 'Choose the opportunity type.' }),
  hiring_mode: z.enum(vals(HIRING_MODES), { error: 'Choose the hiring mode.' }),
  interview_month: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/, 'Choose the month you interviewed.')
    .refine((v) => Number(v.slice(0, 4)) >= LIMITS.first_year, 'Choose a month from 2015 onwards.')
    .refine((v) => {
      const [y, m] = v.split('-').map(Number)
      return y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)
    }, 'That month is in the future.'),
  department_id: z.string().min(1, 'Choose your department.'),
  graduation_year: z.string().min(1, 'Choose your batch.'),
})

const question = z.object({
  id: z.string(),
  body: z
    .string()
    .refine((v) => v.trim().length >= LIMITS.question_body[0], 'Write the question, or remove it.')
    .refine((v) => v.length <= LIMITS.question_body[1], 'Keep each question under 2,000 characters.'),
  kind: z.enum(vals(QUESTION_KINDS), { error: 'Choose a kind.' }),
  topics: z.array(z.string()).max(LIMITS.question_topics, `Up to ${LIMITS.question_topics} topics per question.`),
})

const round = z
  .object({
    id: z.string(),
    // refine (not enum) so the round-level description check still runs when the type is missing
    round_type: z.string().refine((v) => ROUND_TYPE_VALUES.includes(v), 'Choose the round type.'),
    mode: z.enum(['online', 'offline']),
    duration_minutes: numOrBlank(1, 600, 'Use minutes between 1 and 600.'),
    difficulty: z.number().int().min(1).max(5).nullable(),
    description: z.string().max(LIMITS.round_description, 'Keep this under 5,000 characters.'),
    questions: z.array(question).max(LIMITS.questions, `Up to ${LIMITS.questions} questions per round.`),
  })
  .superRefine((r, ctx) => {
    if (r.description.trim().length < LIMITS.round_description_min && r.questions.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Describe this round in at least 30 characters, or add a question.' })
    }
  })

const processStep = z.object({
  eligibility: z.object({
    cgpa: numOrBlank(0, 10, 'Use a CGPA between 0 and 10.'),
    branches: z.array(z.string()),
    backlogs: z.enum(['no', 'yes', 'unknown']),
    other: z.string().max(LIMITS.eligibility_other, 'Keep this under 300 characters.'),
  }),
  application_process: z.string().max(LIMITS.application_process, 'Keep this under 2,000 characters.'),
  rounds: z
    .array(round)
    .min(1, 'Add at least one round so readers know the process.')
    .max(LIMITS.rounds, `You can add up to ${LIMITS.rounds} rounds.`),
})

const isHttps = (u) => {
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}

const preparation = z.object({
  topics: z.array(z.string()).max(LIMITS.topics, `Pick up to ${LIMITS.topics} topics.`),
  preparation: z.string().max(LIMITS.preparation, 'Keep this under 5,000 characters.'),
  resources: z
    .array(
      z.object({
        title: z.string().trim().min(LIMITS.resource_title[0], 'Add a title for this resource.').max(LIMITS.resource_title[1], 'Keep the title under 120 characters.'),
        url: z.string().trim().refine(isHttps, 'Use a full https:// link.'),
        kind: z.enum(vals(RESOURCE_KINDS)),
      }),
    )
    .max(LIMITS.resources, `Add up to ${LIMITS.resources} resources.`),
})

const outcome = z.object({
  difficulty: z.number({ error: 'Rate the overall difficulty.' }).int().min(1).max(5),
  outcome: z.enum(vals(OUTCOMES), { error: 'Choose your result.' }),
  advice: z.string().max(LIMITS.advice, 'Keep this under 3,000 characters.'),
  is_anonymous: z.boolean(),
  hide_department: z.boolean(),
  confirmed: z.literal(true, { error: 'Confirm this is your own experience to publish.' }),
})

/** Index = step - 1. The Review step validates everything. */
export const STEP_SCHEMAS = [basics, processStep, preparation, outcome, basics.extend(processStep.shape).extend(preparation.shape).extend(outcome.shape)]
export const FULL_SCHEMA = STEP_SCHEMAS[4]

/** Which step owns a field path (client or server error keys). */
export function stepOfPath(path) {
  const head = String(path).split('.')[0]
  if (['company', 'company_slug', 'new_company_name', 'role_title', 'domain_id', 'opportunity_type', 'hiring_mode', 'interview_month', 'department_id', 'graduation_year'].includes(head)) return 1
  if (['eligibility', 'application_process', 'rounds'].includes(head)) return 2
  if (['topics', 'preparation', 'resources'].includes(head)) return 3
  return 4
}

/* ---------------- Defaults & mapping ---------------- */
export const emptyRound = (patch = {}) => ({
  id: newRoundId(),
  round_type: '',
  mode: 'online',
  duration_minutes: '',
  difficulty: null,
  description: '',
  questions: [],
  ...patch,
})
export const emptyQuestion = () => ({ id: newQuestionId(), body: '', kind: 'technical', topics: [] })
export const emptyResource = () => ({ title: '', url: '', kind: 'practice' })

export function defaultValues(user, config) {
  return {
    company: null,
    role_title: '',
    domain_id: '',
    opportunity_type: '',
    hiring_mode: '',
    interview_month: '',
    department_id: user?.department_id ?? '',
    graduation_year: user?.graduation_year ? String(user.graduation_year) : '',
    eligibility: { cgpa: '', branches: [], backlogs: 'unknown', other: '' },
    application_process: '',
    rounds: [],
    topics: [],
    preparation: '',
    resources: [],
    difficulty: null,
    outcome: '',
    advice: '',
    is_anonymous: !!config?.default_anonymous && config?.allow_anonymous !== false,
    hide_department: !!config?.default_hide_department,
    confirmed: false,
    duplicate_of: null,
    duplicate_reason: '',
    duplicate_key: '',
  }
}

/** DB row (getDraft / getExperienceForEdit) → form values. */
export function fromRow(row, user, config) {
  const d = defaultValues(user, config)
  const el = row.eligibility
  return {
    ...d,
    company: row.company_slug
      ? { slug: row.company_slug, name: row.company?.name ?? row.company_slug, is_new: false }
      : row.new_company_name
        ? { slug: null, name: row.new_company_name, is_new: true }
        : null,
    role_title: row.role_title ?? '',
    domain_id: row.domain_id ?? '',
    opportunity_type: row.opportunity_type ?? '',
    hiring_mode: row.hiring_mode ?? '',
    interview_month: row.interview_month ?? '',
    department_id: row.department_id ?? d.department_id,
    graduation_year: row.graduation_year ? String(row.graduation_year) : d.graduation_year,
    eligibility: el
      ? { cgpa: el.cgpa != null ? String(el.cgpa) : '', branches: el.branches ?? [], backlogs: el.backlogs ?? 'unknown', other: el.other ?? '' }
      : d.eligibility,
    application_process: row.application_process ?? '',
    rounds: (row.rounds ?? []).map((r) => ({
      id: r.id ?? newRoundId(),
      round_type: r.round_type ?? '',
      mode: r.mode ?? 'online',
      duration_minutes: r.duration_minutes ? String(r.duration_minutes) : '',
      difficulty: r.difficulty ?? null,
      description: r.description ?? '',
      questions: (r.questions ?? []).map((q) => ({ id: q.id ?? newQuestionId(), body: q.body ?? '', kind: q.kind ?? 'technical', topics: q.topics ?? [] })),
    })),
    topics: row.topics ?? [],
    preparation: row.preparation ?? '',
    resources: (row.resources ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', kind: r.kind ?? 'other' })),
    difficulty: row.difficulty ?? null,
    outcome: row.outcome ?? '',
    advice: row.advice ?? '',
    is_anonymous: !!row.is_anonymous,
    hide_department: !!row.hide_department,
    confirmed: row.status && row.status !== 'draft' ? true : !!row.confirmed,
    duplicate_of: row.duplicate_of ?? null,
    duplicate_reason: row.duplicate_reason ?? '',
    duplicate_key: row.duplicate_of ? duplicateKey(row) : '',
  }
}

export const duplicateKey = (v) =>
  [v.company?.slug ?? v.company_slug ?? '', (v.role_title ?? '').trim().toLowerCase(), v.opportunity_type, v.graduation_year].join('|')

/** Form values → save_draft / publish payload. */
export function toPayload(v) {
  return {
    company_slug: v.company?.is_new ? null : v.company?.slug ?? null,
    new_company_name: v.company?.is_new ? v.company.name : null,
    role_title: v.role_title,
    domain_id: v.domain_id || null,
    opportunity_type: v.opportunity_type || null,
    hiring_mode: v.hiring_mode || null,
    interview_month: v.interview_month || null,
    department_id: v.department_id || null,
    graduation_year: v.graduation_year ? Number(v.graduation_year) : null,
    eligibility: v.eligibility,
    application_process: v.application_process,
    rounds: v.rounds.map((r) => ({
      id: r.id,
      round_type: r.round_type || null,
      mode: r.mode,
      duration_minutes: r.duration_minutes === '' ? null : Number(r.duration_minutes),
      difficulty: r.difficulty,
      description: r.description,
      questions: r.questions.map((q) => ({ id: q.id, body: q.body, kind: q.kind, topics: q.topics })),
    })),
    topics: v.topics,
    preparation: v.preparation,
    resources: v.resources.filter((r) => r.title.trim() || r.url.trim()),
    difficulty: v.difficulty,
    outcome: v.outcome || null,
    advice: v.advice,
    is_anonymous: v.is_anonymous,
    hide_department: v.is_anonymous && v.hide_department,
    confirmed: v.confirmed,
    duplicate_of: v.duplicate_of,
    duplicate_reason: v.duplicate_reason,
  }
}

/** "Meaningful" enough to create a draft row (spec: company or role). */
export const isMeaningful = (v) => !!v.company || v.role_title.trim().length > 0

export const ROUND_TEMPLATES = [
  {
    id: 'oa-tech-hr',
    label: 'OA + 2 Technical + HR',
    hint: 'Typical product company',
    rounds: [
      { round_type: 'online_assessment', mode: 'online', duration_minutes: '90' },
      { round_type: 'technical', mode: 'online', duration_minutes: '60' },
      { round_type: 'technical', mode: 'online', duration_minutes: '60' },
      { round_type: 'hr', mode: 'online', duration_minutes: '20' },
    ],
  },
  {
    id: 'apt-gd-tech-hr',
    label: 'Aptitude + GD + Technical + HR',
    hint: 'Typical service or core company',
    rounds: [
      { round_type: 'aptitude', mode: 'offline', duration_minutes: '60' },
      { round_type: 'group_discussion', mode: 'offline', duration_minutes: '20' },
      { round_type: 'technical', mode: 'offline', duration_minutes: '45' },
      { round_type: 'hr', mode: 'offline', duration_minutes: '20' },
    ],
  },
]
