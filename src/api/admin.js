/**
 * Admin API (spec §9.14). Planned as `admin_*` RPCs that check
 * `has_role('admin')` and write `audit_logs` with before/after.
 */
import { request, requireRole, ApiError, db } from './client'
import { audit, nowIso, userById, rolesOf, companyBySlug, persist } from '@/mocks/db'
import { DEPARTMENT } from '@/mocks/lookups'
import { slugify } from '@/lib/utils'
import { queueBuckets, parseKey, findTarget, authorIdOf, isMasked, recordAction, reportsFor, previewOf } from './moderation'

const DAY = 86400000
const admin = () => requireRole('admin')

/* ======================================================================
   Overview
   ====================================================================== */
function startOfWeek(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // Monday
  return x
}

function weekly(dates, weeks = 8) {
  const thisWeek = startOfWeek(new Date())
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(thisWeek)
    start.setDate(start.getDate() - (weeks - 1 - i) * 7)
    return { start: start.toISOString(), value: 0, current: i === weeks - 1 }
  })
  const first = new Date(buckets[0].start).getTime()
  dates.forEach((iso) => {
    const t = new Date(iso).getTime()
    if (t < first) return
    const idx = Math.floor((t - first) / (7 * DAY))
    if (buckets[idx]) buckets[idx].value++
  })
  return buckets
}

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function mock_getAdminOverview() {
  return request(() => {
    admin()
    const now = Date.now()
    const within = (iso, from, to = now) => {
      const t = new Date(iso).getTime()
      return t >= from && t < to
    }
    const students = db.users.filter((u) => u.onboarded_at)
    const signupDates = db.users.map((u) => u.created_at).filter(Boolean)
    const published = db.experiences.filter((e) => e.status === 'published' && e.published_at)
    const activeReports = db.reports.filter((r) => r.status === 'open' || r.status === 'escalated')
    const resolved = db.reports.filter((r) => r.resolved_at && within(r.resolved_at, now - 90 * DAY))
    const buckets = queueBuckets({ id: null, roles: ['admin'] })

    const recent = published.filter((e) => within(e.published_at, now - 30 * DAY))
    const byCompany = {}
    recent.forEach((e) => (byCompany[e.company_slug] = (byCompany[e.company_slug] ?? 0) + 1))

    return {
      kpis: {
        students: students.length,
        students_new_7d: db.users.filter((u) => u.created_at && within(u.created_at, now - 7 * DAY)).length,
        students_new_prev_7d: db.users.filter((u) => u.created_at && within(u.created_at, now - 14 * DAY, now - 7 * DAY)).length,
        published: published.length,
        published_new_7d: published.filter((e) => within(e.published_at, now - 7 * DAY)).length,
        published_new_prev_7d: published.filter((e) => within(e.published_at, now - 14 * DAY, now - 7 * DAY)).length,
        open_reports: activeReports.length,
        open_items: buckets.open.length,
        escalated_items: buckets.open.filter((r) => r.state === 'escalated').length,
        median_resolution_ms: median(resolved.map((r) => new Date(r.resolved_at) - new Date(r.created_at))),
        resolved_90d: resolved.length,
      },
      signups: weekly(signupDates),
      publishes: weekly(published.map((e) => e.published_at)),
      top_companies: Object.entries(byCompany)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([slug, count]) => {
          const c = companyBySlug(slug)
          return { slug, name: c?.name ?? slug, count }
        }),
      attention: {
        escalated: buckets.open.filter((r) => r.state === 'escalated').length,
        open: buckets.open.length,
        unverified_companies: db.companies.filter((c) => !c.is_verified && !c.merged_into_id).length,
        suspended_users: db.users.filter((u) => u.status === 'suspended').length,
      },
    }
  })
}

/* ======================================================================
   Users
   ====================================================================== */
const primaryRole = (id) => {
  const r = rolesOf(id)
  return r.includes('admin') ? 'admin' : r.includes('moderator') ? 'moderator' : 'student'
}

/** Seeded suspensions predate the suspended_until column, so fall back to the audit trail. */
function suspensionOf(u) {
  if (u.status !== 'suspended') return null
  const last = db.audit.filter((a) => a.action === 'user.suspend' && a.entity_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return {
    until: u.suspended_until !== undefined ? u.suspended_until : last?.metadata?.until ?? null,
    reason: u.suspension_reason ?? last?.metadata?.reason ?? null,
    by: userById(u.suspended_by ?? last?.actor_id)?.full_name ?? null,
    at: u.suspended_at ?? last?.created_at ?? null,
  }
}

/** Lazily lift suspensions whose end date has passed (a cron job in Phase 3). */
function expireSuspensions() {
  let changed = false
  db.users.forEach((u) => {
    if (u.status === 'suspended' && u.suspended_until && new Date(u.suspended_until) < new Date()) {
      u.status = 'active'
      audit('system', 'user.unsuspend', 'user', u.id, { reason: 'Suspension ended', before: 'suspended', after: 'active' })
      changed = true
    }
  })
  if (changed) persist()
}

function userRow(u) {
  const authored = db.experiences.filter((e) => e.author_id === u.id && e.status === 'published')
  return {
    id: u.id,
    full_name: u.full_name || '',
    handle: u.handle ?? null,
    email: u.email,
    department: DEPARTMENT[u.department_id]?.code ?? null,
    department_id: u.department_id ?? null,
    graduation_year: u.graduation_year ?? null,
    role: primaryRole(u.id),
    status: u.status === 'suspended' ? 'suspended' : u.onboarded_at ? 'active' : 'onboarding',
    created_at: u.created_at ?? null,
    published_count: authored.length,
    comment_count: db.comments.filter((c) => c.author_id === u.id && c.status === 'visible').length,
    suspension: suspensionOf(u),
  }
}

/** params: { q, role, status, dept, batch } */
function mock_listUsers(params = {}) {
  return request(
    () => {
      admin()
      expireSuspensions()
      const q = (params.q ?? '').trim().toLowerCase()
      const items = db.users
        .map(userRow)
        .filter((u) => !q || u.full_name.toLowerCase().includes(q) || (u.handle ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        .filter((u) => !params.role || params.role === 'all' || u.role === params.role)
        .filter((u) => !params.status || params.status === 'all' || u.status === params.status)
        .filter((u) => !params.dept || params.dept === 'all' || u.department_id === params.dept)
        .filter((u) => !params.batch || params.batch === 'all' || String(u.graduation_year) === String(params.batch))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      return { items, total: items.length }
    },
    { list: true },
  )
}

/** Filter options derived from data, so they never list empty values. */
function mock_getUserFacets() {
  return request(() => {
    admin()
    const depts = [...new Set(db.users.map((u) => u.department_id).filter(Boolean))]
    const years = [...new Set(db.users.map((u) => u.graduation_year).filter(Boolean))].sort()
    return {
      departments: depts.map((id) => ({ value: id, label: DEPARTMENT[id]?.code ?? id })).sort((a, b) => a.label.localeCompare(b.label)),
      batches: years.map((y) => ({ value: String(y), label: `’${String(y).slice(-2)} (${y})` })),
    }
  })
}

function mock_getUserDetail(id) {
  return request(() => {
    const v = admin()
    expireSuspensions()
    const u = userById(id)
    if (!u) throw new ApiError('This user doesn’t exist.', { code: 'not_found' })
    const mine = db.experiences.filter((e) => e.author_id === id && e.status !== 'draft')
    const ownKeys = new Set([...mine.map((e) => `experience:${e.id}`), ...db.comments.filter((c) => c.author_id === id).map((c) => `comment:${c.id}`), `profile:${id}`])
    /* Reports on anonymous content are excluded so this view can't unmask anyone (D7). */
    const reportsAgainst = db.reports
      .filter((r) => ownKeys.has(`${r.target_type}:${r.target_id}`))
      .filter((r) => !isMasked(r.target_type, findTarget(r.target_type, r.target_id)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({ id: r.id, key: `${r.target_type}:${r.target_id}`, target_type: r.target_type, title: previewOf(r.target_type, findTarget(r.target_type, r.target_id)).title, reason: r.reason, status: r.status, created_at: r.created_at }))
    const admins = db.roles.filter((r) => r.role === 'admin').length
    return {
      ...userRow(u),
      bio: u.bio ?? '',
      onboarded_at: u.onboarded_at ?? null,
      profile_visibility: u.profile_visibility ?? 'public_psg',
      experiences: mine
        .filter((e) => !e.is_anonymous)
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .map((e) => ({ id: e.id, title: previewOf('experience', e).title, status: e.status, published_at: e.published_at, helpful_count: e.helpful_count })),
      anonymous_count: mine.filter((e) => e.is_anonymous).length,
      helpful_received: mine.reduce((n, e) => n + (e.helpful_count ?? 0), 0),
      reports_against: reportsAgainst,
      activity: db.audit
        .filter((a) => a.entity === 'user' && a.entity_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8)
        .map((a) => ({ id: a.id, action: a.action, actor: a.actor_id === 'system' ? 'System' : userById(a.actor_id)?.full_name ?? 'Unknown', metadata: a.metadata, created_at: a.created_at })),
      is_self: v.id === id,
      is_last_admin: primaryRole(id) === 'admin' && admins <= 1,
    }
  })
}

const SUSPEND_DAYS = new Set([1, 7, 30, 0]) // 0 = until lifted

function validateSuspension({ days, reason }) {
  const fields = {}
  if (!SUSPEND_DAYS.has(Number(days))) fields.days = 'Choose how long the suspension lasts.'
  if (!reason || reason.trim().length < 10) fields.reason = 'Give a reason of at least 10 characters. The student sees it when they sign in.'
  else if (reason.trim().length > 300) fields.reason = 'Keep the reason under 300 characters.'
  if (Object.keys(fields).length) throw new ApiError('Check the highlighted fields.', { code: 'validation', fields })
}

function suspendCore(v, u, { days, reason }, extra = {}) {
  if (u.id === v.id) throw new ApiError('You can’t suspend yourself.', { code: 'forbidden' })
  if (primaryRole(u.id) === 'admin') throw new ApiError('Admins can’t be suspended. Change their role first.', { code: 'forbidden' })
  const before = { status: u.status, suspended_until: u.suspended_until ?? null }
  const until = Number(days) ? new Date(Date.now() + Number(days) * DAY).toISOString() : null
  Object.assign(u, { status: 'suspended', suspended_until: until, suspension_reason: reason.trim(), suspended_by: v.id, suspended_at: nowIso() })
  audit(v.id, 'user.suspend', 'user', u.id, { until, reason: reason.trim(), before, after: { status: 'suspended', suspended_until: until }, ...extra })
  return { until }
}

function mock_suspendUser(id, { days, reason }) {
  return request(
    () => {
      const v = admin()
      validateSuspension({ days, reason })
      const u = userById(id)
      if (!u) throw new ApiError('This user doesn’t exist.', { code: 'not_found' })
      return suspendCore(v, u, { days, reason })
    },
    { write: true },
  )
}

function mock_unsuspendUser(id) {
  return request(
    () => {
      const v = admin()
      const u = userById(id)
      if (!u) throw new ApiError('This user doesn’t exist.', { code: 'not_found' })
      if (u.status !== 'suspended') throw new ApiError('This account isn’t suspended.', { code: 'conflict' })
      const before = { status: u.status, suspended_until: u.suspended_until ?? null }
      Object.assign(u, { status: 'active', suspended_until: null, suspension_reason: null, suspended_by: null, suspended_at: null })
      audit(v.id, 'user.unsuspend', 'user', id, { before, after: { status: 'active' } })
      return true
    },
    { write: true },
  )
}

/** role: student | moderator | admin (one effective role per user). */
function mock_setUserRole(id, role) {
  return request(
    () => {
      const v = admin()
      if (!['student', 'moderator', 'admin'].includes(role)) throw new ApiError('Unknown role.', { code: 'validation' })
      if (id === v.id) throw new ApiError('You can’t change your own role. Ask another admin.', { code: 'forbidden' })
      const u = userById(id)
      if (!u) throw new ApiError('This user doesn’t exist.', { code: 'not_found' })
      const before = primaryRole(id)
      if (before === role) return { role }
      const admins = db.roles.filter((r) => r.role === 'admin').length
      if (before === 'admin' && admins <= 1) throw new ApiError('This is the last admin. Make someone else an admin first.', { code: 'forbidden' })
      if (role !== 'student' && u.status === 'suspended') throw new ApiError('Lift the suspension before granting a team role.', { code: 'conflict' })
      for (let i = db.roles.length - 1; i >= 0; i--) if (db.roles[i].user_id === id) db.roles.splice(i, 1)
      if (role !== 'student') db.roles.push({ user_id: id, role, granted_by: v.id, granted_at: nowIso() })
      audit(v.id, 'role.change', 'user', id, { before, after: role })
      return { role }
    },
    { write: true },
  )
}

/* ======================================================================
   Companies
   ====================================================================== */
export const DESCRIPTION_SOURCES = [
  { value: 'admin_curated', label: 'Written by the Roundwise team' },
  { value: 'company_website', label: 'Company website' },
  { value: 'student_submitted', label: 'Student-submitted' },
]

function companyRow(c) {
  const exps = db.experiences.filter((e) => e.company_slug === c.slug && e.status !== 'draft' && e.status !== 'removed')
  const target = c.merged_into_id ? db.companies.find((x) => x.id === c.merged_into_id) : null
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    aliases: c.aliases ?? [],
    industry: c.industry ?? '',
    website: c.website ?? '',
    description: c.description ?? '',
    description_source: c.description_source ?? null,
    is_verified: !!c.is_verified,
    merged_into: target ? { id: target.id, slug: target.slug, name: target.name } : null,
    merged_at: c.merged_at ?? null,
    experience_count: exps.length,
    published_count: exps.filter((e) => e.status === 'published').length,
    created_by: c.created_by ? (userById(c.created_by)?.full_name ?? 'Unknown') : null,
    created_at: c.created_at ?? null,
  }
}

/** status: all | verified | unverified | merged */
function mock_listAdminCompanies({ q = '', status = 'all' } = {}) {
  return request(
    () => {
      admin()
      const query = q.trim().toLowerCase()
      const all = db.companies.map(companyRow)
      const counts = {
        all: all.filter((c) => !c.merged_into).length,
        verified: all.filter((c) => !c.merged_into && c.is_verified).length,
        unverified: all.filter((c) => !c.merged_into && !c.is_verified).length,
        merged: all.filter((c) => c.merged_into).length,
      }
      const items = all
        .filter((c) => (status === 'merged' ? c.merged_into : !c.merged_into))
        .filter((c) => status !== 'verified' || c.is_verified)
        .filter((c) => status !== 'unverified' || !c.is_verified)
        .filter((c) => !query || c.name.toLowerCase().includes(query) || c.aliases.some((a) => a.toLowerCase().includes(query)) || c.slug.includes(query))
        .sort((a, b) => a.name.localeCompare(b.name))
      return { items, counts }
    },
    { list: true },
  )
}

function mock_getAdminCompany(id) {
  return request(() => {
    admin()
    const c = db.companies.find((x) => x.id === id)
    if (!c) throw new ApiError('This company doesn’t exist.', { code: 'not_found' })
    return {
      ...companyRow(c),
      merged_from: db.companies.filter((x) => x.merged_into_id === c.id).map((x) => ({ id: x.id, slug: x.slug, name: x.name, merged_at: x.merged_at ?? null })),
      history: db.audit
        .filter((a) => a.entity === 'company' && (a.entity_id === id || a.metadata?.into === id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8)
        .map((a) => ({ id: a.id, action: a.action, actor: a.actor_id === 'system' ? 'System' : userById(a.actor_id)?.full_name ?? 'Unknown', created_at: a.created_at, metadata: a.metadata })),
    }
  })
}

const mock_listIndustryOptions = () =>
  request(() => [...new Set(db.companies.map((c) => c.industry).filter(Boolean))].sort(), { bypass: true })

const normaliseWebsite = (w) => w.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')

function validateCompany(data, selfId) {
  const fields = {}
  const name = (data.name ?? '').trim()
  const aliases = [...new Set((data.aliases ?? []).map((a) => a.trim()).filter(Boolean))].filter((a) => a.toLowerCase() !== name.toLowerCase())
  const website = normaliseWebsite(data.website ?? '')
  const description = (data.description ?? '').trim()
  if (name.length < 2) fields.name = 'Enter the company’s name.'
  else if (name.length > 80) fields.name = 'Keep the name under 80 characters.'
  else {
    const clash = db.companies.find(
      (c) => c.id !== selfId && !c.merged_into_id && (c.name.toLowerCase() === name.toLowerCase() || (c.aliases ?? []).some((a) => a.toLowerCase() === name.toLowerCase())),
    )
    if (clash) fields.name = `“${clash.name}” already uses this name. Merge instead of creating a duplicate.`
  }
  if (aliases.some((a) => a.length > 60)) fields.aliases = 'Each alias must be under 60 characters.'
  if (aliases.length > 10) fields.aliases = 'Add at most 10 aliases.'
  if (!(data.industry ?? '').trim()) fields.industry = 'Add an industry so students can browse by it.'
  if (website && !/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(website)) fields.website = 'Enter a domain like zoho.com.'
  if (description.length > 600) fields.description = 'Keep the description under 600 characters.'
  if (description && !DESCRIPTION_SOURCES.some((s) => s.value === data.description_source)) fields.description_source = 'Say where the description comes from.'
  if (Object.keys(fields).length) throw new ApiError('Check the highlighted fields.', { code: 'validation', fields })
  return { name, aliases, industry: data.industry.trim(), website, description: description || null, description_source: description ? data.description_source : null }
}

/** id null → create. */
function mock_saveCompany(id, data) {
  return request(
    () => {
      const v = admin()
      const clean = validateCompany(data, id)
      if (!id) {
        let slug = slugify(clean.name)
        for (let n = 2; db.companies.some((c) => c.slug === slug); n++) slug = `${slugify(clean.name)}-${n}`
        const c = { ...clean, slug, id: slug, is_verified: true, logo_path: null, merged_into_id: null, created_by: v.id, created_at: nowIso() }
        db.companies.push(c)
        audit(v.id, 'company.create', 'company', c.id, { after: clean })
        return companyRow(c)
      }
      const c = db.companies.find((x) => x.id === id)
      if (!c) throw new ApiError('This company doesn’t exist.', { code: 'not_found' })
      const before = {}
      const after = {}
      Object.keys(clean).forEach((k) => {
        if (JSON.stringify(c[k] ?? null) !== JSON.stringify(clean[k] ?? null)) {
          before[k] = c[k] ?? null
          after[k] = clean[k]
        }
      })
      if (!Object.keys(after).length) return companyRow(c)
      Object.assign(c, clean)
      audit(v.id, 'company.update', 'company', id, { before, after })
      return companyRow(c)
    },
    { write: true },
  )
}

function mock_setCompanyVerified(id, verified) {
  return request(
    () => {
      const v = admin()
      const c = db.companies.find((x) => x.id === id)
      if (!c) throw new ApiError('This company doesn’t exist.', { code: 'not_found' })
      if (c.merged_into_id) throw new ApiError('Merged companies can’t be changed.', { code: 'conflict' })
      if (!!c.is_verified === !!verified) return companyRow(c)
      c.is_verified = !!verified
      audit(v.id, verified ? 'company.verify' : 'company.unverify', 'company', id, { before: !verified, after: !!verified })
      return companyRow(c)
    },
    { write: true },
  )
}

function mergePlan(sourceId, targetId) {
  if (!sourceId || !targetId) throw new ApiError('Choose both companies.', { code: 'validation' })
  if (sourceId === targetId) throw new ApiError('Choose two different companies.', { code: 'validation' })
  const source = db.companies.find((c) => c.id === sourceId)
  const target = db.companies.find((c) => c.id === targetId)
  if (!source || !target) throw new ApiError('One of these companies no longer exists.', { code: 'not_found' })
  if (source.merged_into_id || target.merged_into_id) throw new ApiError('One of these companies was already merged.', { code: 'conflict' })
  const moving = db.experiences.filter((e) => e.company_slug === source.slug)
  const existing = new Set([target.name, ...(target.aliases ?? [])].map((a) => a.toLowerCase()))
  const aliasesAdded = [...new Set([source.name, ...(source.aliases ?? [])])].filter((a) => !existing.has(a.toLowerCase()))
  return { source, target, moving, aliasesAdded }
}

function mock_previewCompanyMerge(sourceId, targetId) {
  return request(() => {
    admin()
    const { source, target, moving, aliasesAdded } = mergePlan(sourceId, targetId)
    const visible = moving.filter((e) => e.status !== 'draft')
    return {
      source: companyRow(source),
      target: companyRow(target),
      experiences: visible
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .map((e) => ({ id: e.id, role_title: e.role_title, status: e.status, graduation_year: e.graduation_year, interview_month: e.interview_month, published_at: e.published_at })),
      draft_count: moving.length - visible.length,
      aliases_added: aliasesAdded,
      redirects: [source.slug, ...db.companies.filter((c) => c.merged_into_id === source.id).map((c) => c.slug)],
    }
  })
}

function mock_mergeCompanies(sourceId, targetId) {
  return request(
    () => {
      const v = admin()
      const { source, target, moving, aliasesAdded } = mergePlan(sourceId, targetId)
      moving.forEach((e) => (e.company_slug = target.slug))
      target.aliases = [...(target.aliases ?? []), ...aliasesAdded]
      Object.assign(source, { merged_into_id: target.id, merged_at: nowIso(), merged_by: v.id })
      /* Keep redirect chains one hop long. */
      const chained = db.companies.filter((c) => c.merged_into_id === source.id)
      chained.forEach((c) => (c.merged_into_id = target.id))
      audit(v.id, 'company.merge', 'company', source.id, {
        into: target.id,
        moved: moving.map((e) => e.id),
        aliases_added: aliasesAdded,
        redirects: [source.slug, ...chained.map((c) => c.slug)],
      })
      return { moved: moving.length, target: companyRow(target) }
    },
    { write: true },
  )
}

/* ======================================================================
   Reports (admin view: all reports, reporter identity, remove / suspend)
   ====================================================================== */
/** status: escalated | open | resolved | all */
function mock_listAllReports({ status = 'escalated', q = '' } = {}) {
  return request(
    () => {
      const v = admin()
      const b = queueBuckets(v)
      const reported = b.all.filter((r) => r.report_count > 0)
      const pick = {
        escalated: reported.filter((r) => r.state === 'escalated'),
        open: b.open,
        resolved: b.resolved,
        all: reported,
      }
      const query = q.trim().toLowerCase()
      const items = (pick[status] ?? reported)
        .filter((r) => !query || r.preview.title.toLowerCase().includes(query) || r.reporters?.some((u) => u.full_name.toLowerCase().includes(query)))
        .sort((x, y) => (y.last_reported_at ?? '').localeCompare(x.last_reported_at ?? ''))
      return {
        items,
        counts: { escalated: pick.escalated.length, open: pick.open.length, resolved: pick.resolved.length, all: reported.length, reports: db.reports.length },
      }
    },
    { list: true },
  )
}

/** Permanent removal (admin only). Soft-deleted in the DB for the audit trail. */
function mock_removeContent(key, { reason }) {
  return request(
    () => {
      const v = admin()
      const { type, id } = parseKey(key)
      if (type === 'profile') throw new ApiError('Profiles can’t be removed. Suspend the account instead.', { code: 'validation' })
      if (!reason || reason.trim().length < 10) throw new ApiError('Check the highlighted fields.', { code: 'validation', fields: { reason: 'Give a reason of at least 10 characters.' } })
      const t = findTarget(type, id)
      if (!t) throw new ApiError('This content no longer exists.', { code: 'not_found' })
      if (t.status === 'removed') throw new ApiError('This was already removed.', { code: 'conflict' })
      if (t.author_id === v.id) throw new ApiError('You can’t moderate your own content.', { code: 'forbidden' })
      const before = t.status
      const active = reportsFor(type, id).filter((r) => r.status === 'open' || r.status === 'escalated')
      const now = nowIso()
      Object.assign(t, { status: 'removed', removed_at: now, removed_by: v.id, removal_reason: reason.trim() })
      active.forEach((r) => Object.assign(r, { status: 'actioned', resolved_by: v.id, resolved_at: now, resolution: 'removed' }))
      db.notifications.push({ id: `n-${Math.random().toString(36).slice(2, 10)}`, user_id: t.author_id, type: 'content_removed', target_type: type, target_id: id, title: `Your ${type} was removed`, body: reason.trim(), created_at: now, read_at: null })
      recordAction(v, 'remove', type, id, { note: reason.trim() })
      audit(v.id, `${type}.remove`, type, id, { reason: reason.trim(), reports: active.map((r) => r.id), before, after: 'removed' })
      return true
    },
    { write: true },
  )
}

/** Suspends whoever wrote the target without revealing who it is. */
function mock_suspendAuthorOf(key, { days, reason }) {
  return request(
    () => {
      const v = admin()
      validateSuspension({ days, reason })
      const { type, id } = parseKey(key)
      const t = findTarget(type, id)
      const u = userById(authorIdOf(type, t))
      if (!u) throw new ApiError('We couldn’t find the author.', { code: 'not_found' })
      if (u.status === 'suspended') throw new ApiError('The author is already suspended.', { code: 'conflict' })
      const res = suspendCore(v, u, { days, reason }, { source: { type, id } })
      recordAction(v, 'suspend_author', type, id, { note: reason.trim() })
      return res
    },
    { write: true },
  )
}

/** D7: the only way to see who wrote anonymous content. Reason required, always audited. */
function mock_revealAuthor(key, { reason }) {
  return request(
    () => {
      const v = admin()
      if (!reason || reason.trim().length < 10) throw new ApiError('Check the highlighted fields.', { code: 'validation', fields: { reason: 'Give a reason of at least 10 characters.' } })
      const { type, id } = parseKey(key)
      const t = findTarget(type, id)
      if (!t) throw new ApiError('This content no longer exists.', { code: 'not_found' })
      if (!isMasked(type, t)) throw new ApiError('This author isn’t anonymous.', { code: 'conflict' })
      const u = userById(authorIdOf(type, t))
      if (!u) throw new ApiError('The author’s account no longer exists.', { code: 'not_found' })
      audit(v.id, `${type}.unmask`, type, id, { reason: reason.trim() })
      recordAction(v, 'unmask', type, id, { note: reason.trim() })
      return { id: u.id, full_name: u.full_name, handle: u.handle, email: u.email, department: DEPARTMENT[u.department_id]?.code ?? null, graduation_year: u.graduation_year, status: u.status }
    },
    { write: true },
  )
}

/* ======================================================================
   Audit log (append-only: there is deliberately no update/delete here)
   ====================================================================== */
const actorName = (id) => (id === 'system' ? 'System' : userById(id)?.full_name ?? id)

/** filters: { actor, action, entity, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } */
function mock_listAuditLog(filters = {}) {
  return request(
    () => {
      admin()
      const from = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null
      const to = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null
      const all = db.audit.slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
      const items = all
        .filter((a) => !filters.actor || filters.actor === 'all' || a.actor_id === filters.actor)
        .filter((a) => !filters.action || filters.action === 'all' || a.action === filters.action)
        .filter((a) => !filters.entity || filters.entity === 'all' || a.entity === filters.entity)
        .filter((a) => from == null || new Date(a.created_at).getTime() >= from)
        .filter((a) => to == null || new Date(a.created_at).getTime() <= to)
        .map((a) => ({ ...a, actor_name: actorName(a.actor_id) }))
      return {
        items,
        total: all.length,
        facets: {
          actors: [...new Set(all.map((a) => a.actor_id))].map((id) => ({ value: id, label: actorName(id) })).sort((a, b) => a.label.localeCompare(b.label)),
          actions: [...new Set(all.map((a) => a.action))].sort(),
          entities: [...new Set(all.map((a) => a.entity))].sort(),
        },
      }
    },
    { list: true },
  )
}

/** Exports contain personal data, so the export itself is audited. */
function mock_recordAuditExport(count, filters) {
  return request(
    () => {
      const v = admin()
      audit(v.id, 'audit.export', 'audit', 'csv', { rows: count, filters })
      return true
    },
    { write: true },
  )
}

/* ======================================================================
   Settings
   ====================================================================== */
export const LIMIT_RULES = {
  publish_per_day: { min: 1, max: 50 },
  comments_per_hour: { min: 1, max: 200 },
  reports_per_day: { min: 1, max: 100 },
  auto_hide_threshold: { min: 2, max: 10 },
}

function mock_getSettings() {
  return request(() => {
    admin()
    return db.settings
  })
}

function diff(before, after, path = '', out = {}) {
  Object.keys({ ...before, ...after }).forEach((k) => {
    const p = path ? `${path}.${k}` : k
    const a = before?.[k]
    const b = after?.[k]
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) diff(a, b, p, out)
    else if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[p] = { before: a ?? null, after: b ?? null }
  })
  return out
}

function mock_updateSettings(next) {
  return request(
    () => {
      const v = admin()
      const fields = {}
      const a = next.announcement ?? {}
      const text = (a.text ?? '').trim()
      if (text.length > 200) fields['announcement.text'] = 'Keep the announcement under 200 characters.'
      if (!['info', 'warning'].includes(a.tone)) fields['announcement.tone'] = 'Choose a tone.'
      if (a.expires_at && new Date(a.expires_at) <= new Date()) fields['announcement.expires_at'] = 'Pick a date in the future, or leave it empty.'
      Object.entries(LIMIT_RULES).forEach(([k, r]) => {
        const n = Number(next.limits?.[k])
        if (!Number.isInteger(n) || n < r.min || n > r.max) fields[`limits.${k}`] = `Enter a whole number from ${r.min} to ${r.max}.`
      })
      const th = Number(next.landing_stats_threshold)
      if (!Number.isInteger(th) || th < 0 || th > 10000) fields.landing_stats_threshold = 'Enter a whole number from 0 to 10,000.'
      if (Object.keys(fields).length) throw new ApiError('Check the highlighted fields.', { code: 'validation', fields })
      const clean = {
        announcement: { text, tone: a.tone, expires_at: text ? a.expires_at || null : null },
        flags: { comments: !!next.flags?.comments, anonymous_posting: !!next.flags?.anonymous_posting, new_companies: !!next.flags?.new_companies },
        limits: Object.fromEntries(Object.keys(LIMIT_RULES).map((k) => [k, Number(next.limits[k])])),
        landing_stats_threshold: th,
      }
      const changes = diff(db.settings, clean)
      if (!Object.keys(changes).length) return db.settings
      db.settings = clean
      audit(v.id, 'settings.update', 'settings', 'global', { changes })
      return db.settings
    },
    { write: true },
  )
}

/* ---- Data-source switch: real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_admin from './sb/admin'
export const getAdminOverview = __USE_SB ? __sb_admin.getAdminOverview : mock_getAdminOverview
export const listUsers = __USE_SB ? __sb_admin.listUsers : mock_listUsers
export const getUserFacets = __USE_SB ? __sb_admin.getUserFacets : mock_getUserFacets
export const getUserDetail = __USE_SB ? __sb_admin.getUserDetail : mock_getUserDetail
export const suspendUser = __USE_SB ? __sb_admin.suspendUser : mock_suspendUser
export const unsuspendUser = __USE_SB ? __sb_admin.unsuspendUser : mock_unsuspendUser
export const setUserRole = __USE_SB ? __sb_admin.setUserRole : mock_setUserRole
export const listAdminCompanies = __USE_SB ? __sb_admin.listAdminCompanies : mock_listAdminCompanies
export const getAdminCompany = __USE_SB ? __sb_admin.getAdminCompany : mock_getAdminCompany
export const listIndustryOptions = __USE_SB ? __sb_admin.listIndustryOptions : mock_listIndustryOptions
export const saveCompany = __USE_SB ? __sb_admin.saveCompany : mock_saveCompany
export const setCompanyVerified = __USE_SB ? __sb_admin.setCompanyVerified : mock_setCompanyVerified
export const previewCompanyMerge = __USE_SB ? __sb_admin.previewCompanyMerge : mock_previewCompanyMerge
export const mergeCompanies = __USE_SB ? __sb_admin.mergeCompanies : mock_mergeCompanies
export const listAllReports = __USE_SB ? __sb_admin.listAllReports : mock_listAllReports
export const removeContent = __USE_SB ? __sb_admin.removeContent : mock_removeContent
export const suspendAuthorOf = __USE_SB ? __sb_admin.suspendAuthorOf : mock_suspendAuthorOf
export const revealAuthor = __USE_SB ? __sb_admin.revealAuthor : mock_revealAuthor
export const listAuditLog = __USE_SB ? __sb_admin.listAuditLog : mock_listAuditLog
export const recordAuditExport = __USE_SB ? __sb_admin.recordAuditExport : mock_recordAuditExport
export const getSettings = __USE_SB ? __sb_admin.getSettings : mock_getSettings
export const updateSettings = __USE_SB ? __sb_admin.updateSettings : mock_updateSettings
