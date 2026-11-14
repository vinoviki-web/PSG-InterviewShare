/**
 * In-memory prototype database, persisted to localStorage so the prototype
 * survives reloads. Shape mirrors the Phase 3 Postgres schema closely.
 */
import * as seed from './seed'

const DB_KEY = 'rw-proto-db-v1'
const SESSION_KEY = 'rw-proto-session-v1'
const CONTROLS_KEY = 'rw-proto-controls-v1'

const safe = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
  },
  del(key) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  },
}

function fresh() {
  const companies = seed.COMPANY_PROFILES.map(({ roles, pipelines, focus, types, ...c }, i) => ({
    ...c,
    id: c.slug,
    logo_path: null,
    merged_into_id: null,
    created_by: c.is_verified ? 'u-admin' : 'u-12',
    created_at: seed.iso((500 - i * 10) * 86400000),
  }))
  const exps = structuredClone(seed.EXPERIENCES)
  const studentSaves = [exps[1], exps[8], exps[14], exps[30]].map((e, i) => ({ user_id: 'u-student', experience_id: e.id, created_at: seed.iso((i + 1) * 2 * 86400000) }))
  const studentViews = [exps[2], exps[9], exps[17], exps[22], exps[40]].map((e, i) => ({ user_id: 'u-student', experience_id: e.id, last_viewed_at: seed.iso((i + 1) * 3600000 * 7) }))
  const draft = {
    id: 'exp-draft-demo',
    author_id: 'u-student',
    company_slug: 'zoho-corporation',
    role_title: 'Member Technical Staff',
    opportunity_type: 'full_time',
    hiring_mode: 'on_campus',
    department_id: 'cse',
    graduation_year: 2027,
    interview_month: '2026-08-01',
    eligibility: null,
    application_process: 'Registered through the placement portal.',
    preparation: '',
    resources: [],
    advice: '',
    difficulty: null,
    outcome: null,
    is_anonymous: false,
    hide_department: false,
    status: 'draft',
    draft_step: 3,
    published_at: null,
    created_at: seed.iso(3 * 86400000),
    updated_at: seed.iso(2 * 86400000),
    helpful_count: 0,
    view_count: 0,
    topics: [],
    rounds: [
      { id: 'exp-draft-demo-r1', position: 1, round_type: 'aptitude', mode: 'offline', duration_minutes: 60, difficulty: 3, description: 'Pen-and-paper aptitude with C output questions. 25 questions, very tight on time.', questions: [] },
      { id: 'exp-draft-demo-r2', position: 2, round_type: 'coding', mode: 'offline', duration_minutes: 180, difficulty: 4, description: 'Lab programming round with 5 problems.', questions: [{ id: 'q-draft-1', round_id: 'exp-draft-demo-r2', position: 1, body: 'Print a matrix in spiral order.', kind: 'coding', topics: ['arrays'] }] },
    ],
  }
  return {
    users: structuredClone(seed.USERS),
    roles: structuredClone(seed.ROLES),
    companies,
    experiences: [...exps, draft],
    comments: structuredClone(seed.COMMENTS),
    reports: structuredClone(seed.REPORTS),
    audit: structuredClone(seed.AUDIT),
    moderation_actions: [],
    settings: structuredClone(seed.SETTINGS),
    votes: exps.slice(0, 6).map((e) => ({ user_id: 'u-student', experience_id: e.id, created_at: e.published_at })).filter((v) => !exps.find((x) => x.id === v.experience_id && x.author_id === 'u-student')),
    bookmarks: studentSaves,
    views: studentViews,
    notifications: [],
  }
}

export const db = safe.get(DB_KEY) ?? fresh()

let persistTimer
export function persist() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => safe.set(DB_KEY, db), 50)
}

export function resetDb() {
  safe.del(DB_KEY)
  safe.del(SESSION_KEY)
  location.reload()
}

/* ---------------- Session (mock auth) ---------------- */
export const session = {
  get: () => safe.get(SESSION_KEY),
  set: (s) => safe.set(SESSION_KEY, s),
  clear: () => safe.del(SESSION_KEY),
}

/* ---------------- Prototype controls ---------------- */
const DEFAULT_CONTROLS = { latency: 'normal', fail: false, empty: false }
export const controls = { ...DEFAULT_CONTROLS, ...(safe.get(CONTROLS_KEY) ?? {}) }
const listeners = new Set()
export function setControls(patch) {
  Object.assign(controls, patch)
  safe.set(CONTROLS_KEY, controls)
  listeners.forEach((l) => l())
}
export function subscribeControls(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/* ---------------- Helpers ---------------- */
export const nowIso = () => new Date().toISOString()
export const newId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`
export const userById = (id) => db.users.find((u) => u.id === id)
export const companyBySlug = (slug) => db.companies.find((c) => c.slug === slug)
export const rolesOf = (userId) => db.roles.filter((r) => r.user_id === userId).map((r) => r.role)
export function audit(actor_id, action, entity, entity_id, metadata = {}) {
  db.audit.push({ id: (db.audit.at(-1)?.id ?? 0) + 1, actor_id, action, entity, entity_id, metadata, created_at: nowIso() })
}
