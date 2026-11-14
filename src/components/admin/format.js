import { REPORT_REASONS } from '@/lib/constants'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "13 Nov 2026, 14:05" */
export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "13 Nov" */
export const formatDayMonth = (iso) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** 1.5 days → "1.5 days", 5h → "5 hours", 20m → "20 min" */
export function formatDuration(ms) {
  if (ms == null) return '—'
  const fmt = (n) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n)))
  const unit = (n, one) => `${fmt(n)} ${fmt(n) === '1' ? one : `${one}s`}`
  const h = ms / 3600000
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min`
  if (h < 36) return unit(h, 'hour')
  return unit(h / 24, 'day')
}

/** Local YYYY-MM-DD for <input type="date">. */
export const toDateInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayInput = () => toDateInput(new Date().toISOString())

/** RFC 4180 CSV with a BOM so Excel opens UTF-8 correctly. */
export function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    /* Neutralise spreadsheet formula injection. */
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Human labels for audit actions. Unknown actions fall back to the raw key. */
export const AUDIT_ACTIONS = {
  'role.grant': 'Granted a role',
  'role.change': 'Changed role',
  'user.suspend': 'Suspended user',
  'user.unsuspend': 'Lifted suspension',
  'company.create': 'Created company',
  'company.update': 'Edited company',
  'company.verify': 'Verified company',
  'company.unverify': 'Unverified company',
  'company.merge': 'Merged companies',
  'report.dismiss': 'Dismissed reports',
  'report.escalate': 'Escalated reports',
  'experience.auto_hide': 'Auto-hid experience',
  'experience.hide': 'Hid experience',
  'experience.restore': 'Restored experience',
  'experience.remove': 'Removed experience',
  'experience.unmask': 'Revealed anonymous author',
  'comment.hide': 'Hid comment',
  'comment.restore': 'Restored comment',
  'comment.remove': 'Removed comment',
  'comment.unmask': 'Revealed anonymous author',
  'moderation.undo': 'Undid a moderation action',
  'settings.update': 'Changed settings',
  'audit.export': 'Exported audit log',
}
export const auditLabel = (action) => AUDIT_ACTIONS[action] ?? action

export const ROLE_LABEL = { student: 'Student', moderator: 'Moderator', admin: 'Admin' }

const MONTHS_SHORT = MONTHS
const shortDate = (iso) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}
const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`

/** One-line, human summary of an audit entry's metadata. */
export function auditSummary(a) {
  const m = a.metadata ?? {}
  switch (a.action) {
    case 'role.change':
      return `${ROLE_LABEL[m.before] ?? m.before} → ${ROLE_LABEL[m.after] ?? m.after}`
    case 'role.grant':
      return ROLE_LABEL[m.role] ?? m.role ?? ''
    case 'user.suspend':
      return [m.until ? `Until ${shortDate(m.until)}` : 'Until lifted', m.reason].filter(Boolean).join(' · ')
    case 'company.merge':
      return `Into ${m.into} · ${plural(m.moved?.length ?? 0, 'experience')} moved`
    case 'company.update':
      return `Changed ${Object.keys(m.after ?? {}).join(', ')}`
    case 'company.create':
      return m.after?.name ?? ''
    case 'settings.update':
      return `Changed ${Object.keys(m.changes ?? {}).join(', ')}`
    case 'audit.export':
      return `${plural(m.rows ?? 0, 'row')} exported`
    case 'experience.auto_hide':
      return `${plural(m.reports ?? 0, 'report')} reached the threshold`
    case 'moderation.undo':
      return `Undid ${m.undone}`
    case 'experience.hide':
    case 'comment.hide':
      return REPORT_REASONS.find((r) => r.value === m.reason)?.label ?? m.reason ?? ''
    default:
      if (m.reason) return m.reason
      if (m.note) return m.note
      if (Array.isArray(m.reports) && m.reports.length) return plural(m.reports.length, 'report')
      return ''
  }
}
