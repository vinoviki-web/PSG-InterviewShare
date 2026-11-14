/**
 * Moderation API (spec §9.13, journey J4). Planned as role-checked RPCs:
 * `mod_queue()`, `mod_item()`, `mod_dismiss()`, `mod_hide()`, `mod_escalate()`,
 * `mod_restore()`, `mod_undo()`. Each mutation writes `moderation_actions`
 * and `audit_logs`. Reporter identity is only returned to admins.
 */
import { request, requireRole, ApiError, db } from './client'
import { audit, newId, nowIso, userById, companyBySlug } from '@/mocks/db'
import { serializeExperience } from './experiences'
import { DEPARTMENT } from '@/mocks/lookups'
import { REPORT_REASONS } from '@/lib/constants'

export const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]))
const ACTIVE = new Set(['open', 'escalated'])
const isAdmin = (v) => v.roles.includes('admin')
const clip = (s = '', n = 140) => {
  const t = String(s).replace(/[*`_#>]/g, '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/* ---------------- Target helpers (shared with admin.js) ---------------- */
export const keyOf = (type, id) => `${type}:${id}`
export function parseKey(key) {
  const i = key.indexOf(':')
  return { type: key.slice(0, i), id: key.slice(i + 1) }
}

export function findTarget(type, id) {
  if (type === 'experience') return db.experiences.find((e) => e.id === id) ?? null
  if (type === 'comment') return db.comments.find((c) => c.id === id) ?? null
  if (type === 'profile') return db.users.find((u) => u.id === id) ?? null
  return null
}

export const authorIdOf = (type, t) => (!t ? null : type === 'profile' ? t.id : t.author_id)

/** True when the author's identity is masked from readers (D7). */
export function isMasked(type, t) {
  if (!t) return false
  if (type === 'experience') return !!t.is_anonymous
  if (type === 'comment') {
    const e = db.experiences.find((x) => x.id === t.experience_id)
    return !!(e?.is_anonymous && e.author_id === t.author_id)
  }
  return false
}

export function previewOf(type, t) {
  if (!t) return { title: 'Content no longer exists', excerpt: '', href: null }
  if (type === 'experience') {
    const co = companyBySlug(t.company_slug)
    return { title: `${co?.name ?? 'Unknown company'} · ${t.role_title}`, excerpt: clip(t.advice || t.preparation || t.application_process), href: `/experiences/${t.id}` }
  }
  if (type === 'comment') {
    const e = db.experiences.find((x) => x.id === t.experience_id)
    const co = e && companyBySlug(e.company_slug)
    return { title: clip(t.body, 110), excerpt: e ? `Comment on ${co?.name ?? 'an experience'} · ${e.role_title}` : 'Comment', href: e ? `/experiences/${e.id}` : null }
  }
  return { title: t.full_name || 'Unnamed student', excerpt: t.handle ? `Profile · @${t.handle}` : 'Profile', href: t.handle ? `/u/${t.handle}` : null }
}

export const reportsFor = (type, id) => db.reports.filter((r) => r.target_type === type && r.target_id === id)
const isHiddenStatus = (t) => t?.status === 'hidden'

function topReason(reports) {
  const counts = {}
  reports.forEach((r) => (counts[r.reason] = (counts[r.reason] ?? 0) + 1))
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return { top: sorted[0]?.[0] ?? null, reasons: sorted.map(([reason, count]) => ({ reason, label: REASON_LABEL[reason] ?? reason, count })) }
}

/**
 * Lifecycle state for one target, used for badges and tab placement.
 * needs_review · auto_hidden · escalated · hidden · removed · dismissed · restored
 */
function stateOf(type, t, reports) {
  if (t?.status === 'removed') return 'removed'
  const active = reports.filter((r) => ACTIVE.has(r.status))
  if (active.some((r) => r.status === 'escalated')) return 'escalated'
  if (active.length) return isHiddenStatus(t) ? 'auto_hidden' : 'needs_review'
  if (isHiddenStatus(t)) return 'hidden'
  const last = [...reports].sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))[0]
  if (last?.resolution === 'restored') return 'restored'
  if (last?.resolution === 'hidden') return 'hidden'
  return 'dismissed'
}

/** Summary row for one reported/hidden target. */
export function summarize(type, id, v) {
  const t = findTarget(type, id)
  const reports = reportsFor(type, id)
  const active = reports.filter((r) => ACTIVE.has(r.status))
  const scope = active.length ? active : reports
  const { top, reasons } = topReason(scope)
  const dates = reports.map((r) => r.created_at).sort()
  const resolved = reports.filter((r) => r.resolved_at).map((r) => r.resolved_at).sort()
  const lastResolved = reports.find((r) => r.resolved_at === resolved.at(-1))
  const authorId = authorIdOf(type, t)
  return {
    key: keyOf(type, id),
    target_type: type,
    target_id: id,
    preview: previewOf(type, t),
    exists: !!t,
    state: stateOf(type, t, reports),
    content_status: t?.status ?? null,
    hidden_reason: t?.hidden_reason ?? null,
    hidden_at: t?.hidden_at ?? (isHiddenStatus(t) ? autoHideDate(type, id) ?? dates.at(-1) ?? null : null),
    hidden_by: t?.hidden_by ?? (isHiddenStatus(t) ? 'system' : null),
    report_count: reports.length,
    active_count: active.length,
    top_reason: top,
    top_reason_label: top ? REASON_LABEL[top] ?? top : null,
    reasons,
    first_reported_at: dates[0] ?? null,
    last_reported_at: dates.at(-1) ?? null,
    resolved_at: resolved.at(-1) ?? null,
    resolved_by: lastResolved?.resolved_by ? nameOf(lastResolved.resolved_by) : null,
    is_own: !!authorId && authorId === v.id,
    reporters: isAdmin(v) ? reports.map((r) => publicUser(userById(r.reporter_id))).filter(Boolean) : undefined,
  }
}

function autoHideDate(type, id) {
  return db.audit.filter((a) => a.entity === type && a.entity_id === id && a.action.endsWith('auto_hide')).map((a) => a.created_at).sort().at(-1)
}
const nameOf = (id) => (id === 'system' ? 'System' : userById(id)?.full_name ?? 'Unknown')
function publicUser(u) {
  if (!u) return null
  return { id: u.id, full_name: u.full_name, handle: u.handle, email: u.email }
}

/** All targets that have ever been reported, plus hidden content with no reports. */
function allTargets() {
  const keys = new Map()
  db.reports.forEach((r) => r.target_id && keys.set(keyOf(r.target_type, r.target_id), [r.target_type, r.target_id]))
  db.experiences.filter((e) => e.status === 'hidden').forEach((e) => keys.set(keyOf('experience', e.id), ['experience', e.id]))
  db.comments.filter((c) => c.status === 'hidden').forEach((c) => keys.set(keyOf('comment', c.id), ['comment', c.id]))
  return [...keys.values()]
}

export function queueBuckets(v) {
  const rows = allTargets().map(([type, id]) => summarize(type, id, v))
  return {
    open: rows.filter((r) => r.active_count > 0),
    hidden: rows.filter((r) => r.content_status === 'hidden'),
    resolved: rows.filter((r) => r.active_count === 0 && r.report_count > 0),
    all: rows,
  }
}

const byPriority = (a, b) =>
  Number(b.state === 'escalated') - Number(a.state === 'escalated') ||
  b.active_count - a.active_count ||
  (a.first_reported_at ?? '').localeCompare(b.first_reported_at ?? '')

/** tab: open | hidden | resolved → { items, counts } */
function mock_listModerationQueue(tab = 'open') {
  return request(
    () => {
      const v = requireRole('moderator')
      const b = queueBuckets(v)
      const items = (b[tab] ?? []).slice()
      if (tab === 'open') items.sort(byPriority)
      else if (tab === 'hidden') items.sort((x, y) => (y.hidden_at ?? '').localeCompare(x.hidden_at ?? ''))
      else items.sort((x, y) => (y.resolved_at ?? '').localeCompare(x.resolved_at ?? ''))
      return {
        items,
        counts: { open: b.open.length, hidden: b.hidden.length, resolved: b.resolved.length, escalated: b.open.filter((r) => r.state === 'escalated').length },
      }
    },
    { list: true },
  )
}

/* ---------------- Detail ---------------- */
function contentFor(type, t, v) {
  if (!t) return null
  if (type === 'experience') return serializeExperience(t, v, { full: true })
  if (type === 'comment') {
    const e = db.experiences.find((x) => x.id === t.experience_id)
    const parent = t.parent_id ? db.comments.find((c) => c.id === t.parent_id) : null
    const masked = isMasked('comment', t)
    const author = masked ? null : userById(t.author_id)
    const parentAuthor = parent && !isMasked('comment', parent) ? userById(parent.author_id) : null
    return {
      id: t.id,
      body: t.body,
      status: t.status,
      created_at: t.created_at,
      author: author ? { full_name: author.full_name, handle: author.handle } : null,
      is_experience_author: !!e && e.author_id === t.author_id,
      experience: e ? { id: e.id, title: previewOf('experience', e).title } : null,
      parent: parent ? { body: parent.body, author: parentAuthor?.full_name ?? 'Anonymous', created_at: parent.created_at } : null,
    }
  }
  const dept = DEPARTMENT[t.department_id]
  return { id: t.id, full_name: t.full_name, handle: t.handle, bio: t.bio, department: dept?.code ?? null, graduation_year: t.graduation_year, status: t.status }
}

function authorHistory(type, t, authorId) {
  if (!authorId) return { prior_actions: 0, other_reports: 0 }
  const ownTargets = new Set([
    ...db.experiences.filter((e) => e.author_id === authorId).map((e) => keyOf('experience', e.id)),
    ...db.comments.filter((c) => c.author_id === authorId).map((c) => keyOf('comment', c.id)),
    keyOf('profile', authorId),
  ])
  ownTargets.delete(keyOf(type, t.id))
  const prior = db.moderation_actions.filter((a) => !a.undone_at && ['hide', 'remove'].includes(a.action) && ownTargets.has(keyOf(a.target_type, a.target_id))).length
  const others = db.reports.filter((r) => ownTargets.has(keyOf(r.target_type, r.target_id))).length
  return { prior_actions: prior, other_reports: others }
}

const ACTION_VERB = { dismiss: 'Dismissed reports', hide: 'Hid content', restore: 'Restored content', escalate: 'Escalated to admins', remove: 'Removed content', suspend_author: 'Suspended the author', unmask: 'Revealed the author' }

/** key: "experience:<id>" | "comment:<id>" | "profile:<id>" */
function mock_getModerationItem(key) {
  return request(() => {
    const v = requireRole('moderator')
    const { type, id } = parseKey(key)
    const t = findTarget(type, id)
    const reports = reportsFor(type, id)
    if (!t && !reports.length) throw new ApiError('This item no longer exists.', { code: 'not_found' })
    const summary = summarize(type, id, v)
    const authorId = authorIdOf(type, t)
    const masked = isMasked(type, t)
    const author = authorId && !masked ? userById(authorId) : null
    const admin = isAdmin(v)
    const escalation = reports.filter((r) => r.status === 'escalated').sort((a, b) => (b.escalated_at ?? '').localeCompare(a.escalated_at ?? ''))[0]
    let blocked = null
    if (summary.is_own) blocked = 'own'
    else if (!t) blocked = 'missing'
    else if (summary.state === 'removed') blocked = 'removed'
    else if (summary.state === 'escalated' && !admin) blocked = 'escalated'
    const history = [
      ...db.moderation_actions
        .filter((a) => a.target_type === type && a.target_id === id)
        .map((a) => ({ id: a.id, label: ACTION_VERB[a.action] ?? a.action, action: a.action, actor: nameOf(a.actor_id), reason: a.reason_label ?? null, note: a.note || a.message || null, created_at: a.created_at, undone_at: a.undone_at ?? null })),
      ...db.audit
        .filter((a) => a.entity === type && a.entity_id === id && a.action.endsWith('auto_hide'))
        .map((a) => ({ id: `audit-${a.id}`, label: `Auto-hidden after ${a.metadata?.reports ?? 3} reports`, action: 'auto_hide', actor: 'System', created_at: a.created_at })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return {
      ...summary,
      content: contentFor(type, t, v),
      reports: reports
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => ({
          id: r.id,
          reason: r.reason,
          reason_label: REASON_LABEL[r.reason] ?? r.reason,
          details: r.details || '',
          status: r.status,
          created_at: r.created_at,
          resolved_at: r.resolved_at ?? null,
          reporter: admin ? publicUser(userById(r.reporter_id)) : null,
        })),
      author: {
        masked,
        user: author ? { id: author.id, full_name: author.full_name, handle: author.handle } : null,
        member_since: author?.created_at ?? null,
        ...authorHistory(type, t ?? { id }, authorId),
      },
      escalation: escalation ? { at: escalation.escalated_at, by: nameOf(escalation.escalated_by), note: escalation.escalation_note || null } : null,
      history,
      permissions: { can_act: !blocked, blocked, is_admin: admin },
    }
  })
}

/* ---------------- Mutations ---------------- */
function guardAct(v, type, id) {
  const t = findTarget(type, id)
  if (!t) throw new ApiError('This content no longer exists.', { code: 'not_found' })
  if (authorIdOf(type, t) === v.id) {
    throw new ApiError('You can’t moderate your own content. Another moderator will review it.', { code: 'forbidden' })
  }
  if (t.status === 'removed') throw new ApiError('This content was already removed by an admin.', { code: 'conflict' })
  const active = reportsFor(type, id).filter((r) => ACTIVE.has(r.status))
  if (!isAdmin(v) && active.some((r) => r.status === 'escalated')) {
    throw new ApiError('This was escalated to admins, so they’ll make the call.', { code: 'forbidden' })
  }
  return { t, active }
}

const snapshotContent = (t) => ({ status: t.status, hidden_reason: t.hidden_reason ?? null, hidden_at: t.hidden_at ?? null, hidden_by: t.hidden_by ?? null })
const snapshotReports = (reports) =>
  reports.map((r) => ({ id: r.id, status: r.status, resolved_by: r.resolved_by ?? null, resolved_at: r.resolved_at ?? null, resolution: r.resolution ?? null, escalated_by: r.escalated_by ?? null, escalated_at: r.escalated_at ?? null, escalation_note: r.escalation_note ?? null }))

function closeReports(reports, v, status, resolution) {
  const at = nowIso()
  reports.forEach((r) => Object.assign(r, { status, resolved_by: v.id, resolved_at: at, resolution }))
}

const visibleStatus = (type) => (type === 'comment' ? 'visible' : 'published')

function restoreVisibility(type, t) {
  if (t.status !== 'hidden' || type === 'profile') return false
  t.status = visibleStatus(type)
  t.hidden_reason = null
  t.hidden_at = null
  t.hidden_by = null
  return true
}

/** Exported for admin.js so admin actions land in the same history. */
export function recordAction(v, action, type, id, extra = {}) {
  const a = { id: newId('ma'), actor_id: v.id, action, target_type: type, target_id: id, created_at: nowIso(), undone_at: null, ...extra }
  db.moderation_actions.push(a)
  return a
}

/** Dismiss: closes reports, restores the content if it was auto-hidden. */
function mock_dismissReports(key, { note = '' } = {}) {
  return request(
    () => {
      const v = requireRole('moderator')
      const { type, id } = parseKey(key)
      const { t, active } = guardAct(v, type, id)
      if (!active.length) throw new ApiError('There are no open reports to dismiss.', { code: 'conflict' })
      const before = { content: snapshotContent(t), reports: snapshotReports(active) }
      closeReports(active, v, 'dismissed', 'dismissed')
      const restored = restoreVisibility(type, t)
      const a = recordAction(v, 'dismiss', type, id, { note: note.trim(), before })
      audit(v.id, 'report.dismiss', type, id, { reports: active.map((r) => r.id), restored, note: note.trim() || undefined, before: before.content.status, after: t.status })
      return { action_id: a.id, restored }
    },
    { write: true },
  )
}

/** Hide: reason required, author is notified with the moderator's message. */
function mock_hideContent(key, { reason, message }) {
  return request(
    () => {
      const v = requireRole('moderator')
      const { type, id } = parseKey(key)
      if (type === 'profile') throw new ApiError('Profiles can’t be hidden. Escalate to an admin instead.', { code: 'validation' })
      const fields = {}
      if (!REASON_LABEL[reason]) fields.reason = 'Choose why this is being hidden.'
      if (!message || message.trim().length < 20) fields.message = 'Write at least 20 characters so the author knows what to fix.'
      else if (message.trim().length > 600) fields.message = 'Keep the message under 600 characters.'
      if (Object.keys(fields).length) throw new ApiError('Check the highlighted fields.', { code: 'validation', fields })
      const { t, active } = guardAct(v, type, id)
      const before = { content: snapshotContent(t), reports: snapshotReports(active) }
      const now = nowIso()
      t.status = 'hidden'
      t.hidden_reason = `Hidden by moderators: ${REASON_LABEL[reason]}`
      t.hidden_at = now
      t.hidden_by = v.id
      closeReports(active, v, 'actioned', 'hidden')
      const notification = { id: newId('n'), user_id: t.author_id, type: 'content_hidden', target_type: type, target_id: id, title: `Your ${type} was hidden`, body: message.trim(), created_at: now, read_at: null }
      db.notifications.push(notification)
      const a = recordAction(v, 'hide', type, id, { reason, reason_label: REASON_LABEL[reason], message: message.trim(), notification_id: notification.id, before })
      audit(v.id, `${type}.hide`, type, id, { reason, reports: active.map((r) => r.id), before: before.content.status, after: 'hidden' })
      return { action_id: a.id }
    },
    { write: true },
  )
}

/** Restore hidden content (Hidden tab). Any still-open reports are closed. */
function mock_restoreContent(key, { note = '' } = {}) {
  return request(
    () => {
      const v = requireRole('moderator')
      const { type, id } = parseKey(key)
      const { t, active } = guardAct(v, type, id)
      if (t.status !== 'hidden') throw new ApiError('This content isn’t hidden.', { code: 'conflict' })
      const before = { content: snapshotContent(t), reports: snapshotReports(active) }
      restoreVisibility(type, t)
      closeReports(active, v, 'dismissed', 'restored')
      const a = recordAction(v, 'restore', type, id, { note: note.trim(), before })
      audit(v.id, `${type}.restore`, type, id, { reports: active.map((r) => r.id), before: 'hidden', after: t.status })
      return { action_id: a.id }
    },
    { write: true },
  )
}

/** Hand the decision to admins (removal, suspension). */
function mock_escalateReports(key, { note = '' } = {}) {
  return request(
    () => {
      const v = requireRole('moderator')
      const { type, id } = parseKey(key)
      const { t, active } = guardAct(v, type, id)
      const open = active.filter((r) => r.status === 'open')
      if (!open.length) throw new ApiError('There are no open reports to escalate.', { code: 'conflict' })
      if (note.length > 500) throw new ApiError('Keep the note under 500 characters.', { code: 'validation', fields: { note: 'Keep the note under 500 characters.' } })
      const before = { content: snapshotContent(t), reports: snapshotReports(open) }
      const now = nowIso()
      open.forEach((r) => Object.assign(r, { status: 'escalated', escalated_by: v.id, escalated_at: now, escalation_note: note.trim() }))
      const a = recordAction(v, 'escalate', type, id, { note: note.trim(), before })
      audit(v.id, 'report.escalate', type, id, { reports: open.map((r) => r.id), note: note.trim() || undefined })
      return { action_id: a.id }
    },
    { write: true },
  )
}

/** Reverts a dismiss / hide / restore / escalate made moments ago (Undo toast). */
function mock_undoModerationAction(actionId) {
  return request(
    () => {
      const v = requireRole('moderator')
      const a = db.moderation_actions.find((x) => x.id === actionId)
      if (!a || !a.before) throw new ApiError('That action can’t be undone.', { code: 'not_found' })
      if (a.actor_id !== v.id && !isAdmin(v)) throw new ApiError('You can only undo your own actions.', { code: 'forbidden' })
      if (a.undone_at) return true
      const t = findTarget(a.target_type, a.target_id)
      if (t) Object.assign(t, a.before.content)
      a.before.reports.forEach((snap) => {
        const r = db.reports.find((x) => x.id === snap.id)
        if (r) Object.assign(r, snap)
      })
      if (a.notification_id) db.notifications = db.notifications.filter((n) => n.id !== a.notification_id)
      a.undone_at = nowIso()
      audit(v.id, 'moderation.undo', a.target_type, a.target_id, { undone: a.action, action_id: a.id })
      return true
    },
    { write: true },
  )
}

/* ---- Data-source switch: real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_mod from './sb/moderation'
export const listModerationQueue = __USE_SB ? __sb_mod.listModerationQueue : mock_listModerationQueue
export const getModerationItem = __USE_SB ? __sb_mod.getModerationItem : mock_getModerationItem
export const dismissReports = __USE_SB ? __sb_mod.dismissReports : mock_dismissReports
export const hideContent = __USE_SB ? __sb_mod.hideContent : mock_hideContent
export const restoreContent = __USE_SB ? __sb_mod.restoreContent : mock_restoreContent
export const escalateReports = __USE_SB ? __sb_mod.escalateReports : mock_escalateReports
export const undoModerationAction = __USE_SB ? __sb_mod.undoModerationAction : mock_undoModerationAction
