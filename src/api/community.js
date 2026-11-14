import { request, requireViewer, ApiError, db } from './client'
import { userById, newId, nowIso, audit } from '@/mocks/db'

const EDIT_WINDOW_MS = 15 * 60 * 1000

function serializeComment(c, v, exp) {
  const u = userById(c.author_id)
  const isExpAuthorAnon = exp?.is_anonymous && c.author_id === exp.author_id
  return {
    id: c.id,
    parent_id: c.parent_id,
    body: c.status === 'visible' ? c.body : null,
    status: c.status,
    created_at: c.created_at,
    edited_at: c.edited_at ?? null,
    is_owner: v?.id === c.author_id,
    is_experience_author: c.author_id === exp?.author_id,
    can_edit: v?.id === c.author_id && Date.now() - new Date(c.created_at).getTime() < EDIT_WINDOW_MS,
    /* Replies by an anonymous experience's author stay anonymous. */
    author: isExpAuthorAnon || !u ? null : { full_name: u.full_name, handle: u.handle },
  }
}

function mock_listComments(experienceId) {
  return request(
    () => {
      const v = requireViewer()
      const exp = db.experiences.find((e) => e.id === experienceId)
      return db.comments
        .filter((c) => c.experience_id === experienceId && c.status !== 'removed')
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => serializeComment(c, v, exp))
    },
    { list: [] },
  )
}

function mock_addComment(experienceId, body, parentId = null) {
  return request(
    () => {
      const v = requireViewer()
      if (!db.settings.flags.comments) throw new ApiError('Comments are turned off right now.')
      const text = body.trim()
      if (text.length < 2) throw new ApiError('Write a little more.', { code: 'validation' })
      if (text.length > 2000) throw new ApiError('Comments are limited to 2,000 characters.', { code: 'validation' })
      const hourAgo = Date.now() - 3600000
      const recent = db.comments.filter((c) => c.author_id === v.id && new Date(c.created_at).getTime() > hourAgo).length
      if (recent >= db.settings.limits.comments_per_hour) throw new ApiError('You’re commenting too fast. Try again later.', { code: 'rate_limited' })
      const c = { id: newId('c'), experience_id: experienceId, author_id: v.id, parent_id: parentId, body: text, status: 'visible', created_at: nowIso() }
      db.comments.push(c)
      return serializeComment(c, v, db.experiences.find((e) => e.id === experienceId))
    },
    { write: true },
  )
}

function mock_editComment(id, body) {
  return request(
    () => {
      const v = requireViewer()
      const c = db.comments.find((x) => x.id === id)
      if (!c || c.author_id !== v.id) throw new ApiError('You can only edit your own comments.', { code: 'forbidden' })
      if (Date.now() - new Date(c.created_at).getTime() > EDIT_WINDOW_MS) throw new ApiError('Comments can only be edited for 15 minutes.')
      c.body = body.trim()
      c.edited_at = nowIso()
      return true
    },
    { write: true },
  )
}

function mock_deleteComment(id) {
  return request(
    () => {
      const v = requireViewer()
      const c = db.comments.find((x) => x.id === id)
      if (!c || c.author_id !== v.id) throw new ApiError('You can only delete your own comments.', { code: 'forbidden' })
      c.status = 'deleted'
      return true
    },
    { write: true },
  )
}

function mock_restoreComment(id) {
  return request(
    () => {
      const v = requireViewer()
      const c = db.comments.find((x) => x.id === id)
      if (c && c.author_id === v.id) c.status = 'visible'
      return true
    },
    { write: true },
  )
}

/** target_type: experience | comment | profile */
function mock_createReport({ target_type, target_id, reason, details = '' }) {
  return request(
    () => {
      const v = requireViewer()
      const dayAgo = Date.now() - 86400000
      const today = db.reports.filter((r) => r.reporter_id === v.id && new Date(r.created_at).getTime() > dayAgo).length
      if (today >= db.settings.limits.reports_per_day) throw new ApiError('You’ve reached today’s report limit. Try again tomorrow.', { code: 'rate_limited' })
      const target =
        target_type === 'experience' ? db.experiences.find((e) => e.id === target_id)
        : target_type === 'comment' ? db.comments.find((c) => c.id === target_id)
        : db.users.find((u) => u.id === target_id)
      if (!target || target.status === 'removed' || target.status === 'deleted') throw new ApiError('This content is no longer available.', { code: 'not_found' })
      if (db.reports.some((r) => r.reporter_id === v.id && r.target_type === target_type && r.target_id === target_id)) {
        throw new ApiError('You’ve already reported this. Moderators will review it.', { code: 'duplicate' })
      }
      const r = { id: newId('rep'), reporter_id: v.id, target_type, target_id, reason, details: details.slice(0, 1000), status: 'open', created_at: nowIso() }
      db.reports.push(r)
      /* Auto-hide at threshold distinct open reports (D6). */
      const open = db.reports.filter((x) => x.target_type === target_type && x.target_id === target_id && x.status === 'open')
      if (target_type === 'experience' && open.length >= db.settings.limits.auto_hide_threshold) {
        const e = db.experiences.find((x) => x.id === target_id)
        if (e?.status === 'published') {
          e.status = 'hidden'
          e.hidden_reason = `Auto-hidden after ${open.length} reports`
          audit('system', 'experience.auto_hide', 'experience', e.id, { reports: open.length })
        }
      }
      return true
    },
    { write: true },
  )
}

/* ---- Data-source switch: real database for these, mock otherwise ---- */
import { USE_SUPABASE as __USE_SB } from '@/lib/supabase'
import * as __sb_community from './sb/community'
export const listComments = __USE_SB ? __sb_community.listComments : mock_listComments
export const addComment = __USE_SB ? __sb_community.addComment : mock_addComment
export const editComment = __USE_SB ? __sb_community.editComment : mock_editComment
export const deleteComment = __USE_SB ? __sb_community.deleteComment : mock_deleteComment
export const restoreComment = __USE_SB ? __sb_community.restoreComment : mock_restoreComment
export const createReport = __USE_SB ? __sb_community.createReport : mock_createReport
