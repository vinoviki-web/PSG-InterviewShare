/**
 * Empty stand-in for the prototype's in-memory store (src/mocks/db.js) and
 * fictional seed (src/mocks/seed.js) in DATABASE builds. vite.config.js
 * aliases both modules here when VITE_DATA_SOURCE=supabase, so no
 * fictional student or experience ever ships to production (DECISIONS LA2).
 * Nothing in database mode calls into the mock API, so these are inert.
 */
const empty = () => []
export const db = {
  users: [], roles: [], companies: [], experiences: [], comments: [], reports: [], audit: [],
  moderation_actions: [], votes: [], bookmarks: [], views: [], notifications: [],
  settings: { announcement: { text: '' }, flags: {}, limits: {}, landing_stats_threshold: 0 },
}
export const controls = { latency: 'normal', fail: false, empty: false }
export const session = { get: () => null, set: () => {}, clear: () => {} }
export const persist = () => {}
export const resetDb = () => {}
export const setControls = () => {}
export const subscribeControls = () => () => {}
export const nowIso = () => new Date().toISOString()
export const newId = (prefix) => `${prefix}-0`
export const userById = () => null
export const companyBySlug = () => null
export const rolesOf = empty
export const audit = () => {}

// seed.js exports
export const DEMO_USERS = {}
export const USERS = []
export const ROLES = []
export const COMPANY_PROFILES = []
export const EXPERIENCES = []
export const COMMENTS = []
export const REPORTS = []
export const AUDIT = []
export const SETTINGS = db.settings
export const QUESTION_POOL = {}
export const DEPARTMENTS = []
export const iso = () => new Date().toISOString()
