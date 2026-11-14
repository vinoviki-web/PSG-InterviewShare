/**
 * Comments and reports on the real database (Phase 8). Same signatures and
 * shapes as the prototype's src/api/community.js. Rules live in the
 * database: guard triggers (reply depth, 15-minute edits, delete/undo,
 * comments flag, hourly limit) and create_report (dedupe, daily limit,
 * auto-hide at the threshold). Authors of anonymous experiences stay
 * anonymous in their replies (comment_feed view).
 */
import { supabase } from '@/lib/supabase'
import { ApiError } from '../client'
import { unwrap, fromPostgrest } from './errors'

const COLUMNS = 'id, experience_id, parent_id, body, status, created_at, edited_at, is_owner, is_experience_author, author_name, author_handle, can_edit'

const toComment = (c) => ({
  id: c.id,
  parent_id: c.parent_id,
  body: c.body,
  status: c.status,
  created_at: c.created_at,
  edited_at: c.edited_at,
  is_owner: c.is_owner,
  is_experience_author: c.is_experience_author,
  can_edit: c.can_edit,
  author: c.author_name ? { full_name: c.author_name, handle: c.author_handle } : null,
})

function commentError(error) {
  if (error?.code === '23514') return new ApiError('Comments need 2–2,000 characters.', { code: 'validation' })
  if (error?.code === '42501') return new ApiError('You can’t comment here.', { code: 'forbidden' })
  return fromPostgrest(error)
}

export async function listComments(experienceId) {
  const rows = unwrap(await supabase.from('comment_feed').select(COLUMNS).eq('experience_id', experienceId).order('created_at', { ascending: true }))
  return rows.map(toComment)
}

export async function addComment(experienceId, body, parentId = null) {
  const text = body.trim()
  if (text.length < 2) throw new ApiError('Write a little more.', { code: 'validation' })
  const { data, error } = await supabase.from('comments').insert({ experience_id: experienceId, parent_id: parentId, body: text }).select('id').single()
  if (error) throw commentError(error)
  const row = unwrap(await supabase.from('comment_feed').select(COLUMNS).eq('id', data.id).single())
  return toComment(row)
}

async function updateOwn(id, patch, deniedMessage) {
  const { data, error } = await supabase.from('comments').update(patch).eq('id', id).select('id')
  if (error) throw commentError(error)
  if (!data?.length) throw new ApiError(deniedMessage, { code: 'forbidden' })
  return true
}

export const editComment = (id, body) => updateOwn(id, { body: body.trim() }, 'You can only edit your own comments.')
export const deleteComment = (id) => updateOwn(id, { status: 'deleted' }, 'You can only delete your own comments.')
export const restoreComment = (id) => updateOwn(id, { status: 'visible' }, 'You can only restore your own comments.')

/** target_type: experience | comment | profile */
export async function createReport({ target_type, target_id, reason, details = '' }) {
  unwrap(await supabase.rpc('create_report', { p_target_type: target_type, p_target_id: target_id, p_reason: reason, p_details: details }))
  return true
}
