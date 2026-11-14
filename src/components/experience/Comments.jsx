import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Ellipsis, Flag, Pencil, Trash2, CornerDownRight } from 'lucide-react'
import { listComments, addComment, editComment, deleteComment, restoreComment } from '@/api/community'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, Button, Textarea, CharCount, Skeleton, ErrorState, Badge, Menu, MenuTrigger, MenuContent, MenuItem, IconButton, useToast } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { ReportDialog } from './ReportDialog'
import { timeAgo, pluralize, cn } from '@/lib/utils'

const COLLAPSE_AFTER = 5

function Composer({ experienceId, parentId, onDone, autoFocus, placeholder = 'Ask a question or add something useful…' }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [body, setBody] = useState('')
  const m = useMutation({
    mutationFn: () => addComment(experienceId, body, parentId),
    onSuccess: () => {
      setBody('')
      qc.invalidateQueries({ queryKey: ['comments', experienceId] })
      onDone?.()
    },
    onError: (e) => toast.error(e.code === 'network' ? 'Couldn’t post your comment. Try again.' : e.message),
  })
  return (
    <form
      className="flex gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (body.trim().length >= 2) m.mutate()
      }}
    >
      <Avatar name={user.full_name} src={user.avatar_url} size={32} className="mt-1 hidden sm:inline-flex" />
      <div className="flex-1">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          aria-label={parentId ? 'Write a reply' : 'Write a comment'}
          minRows={parentId ? 2 : 3}
          maxLength={2000}
          autoFocus={autoFocus}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.currentTarget.form.requestSubmit() }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-caption text-ink-500">Markdown supported <CharCount value={body} max={2000} /></span>
          <div className="flex gap-2">
            {onDone && <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
            <Button type="submit" size="sm" disabled={body.trim().length < 2} loading={m.isPending}>{parentId ? 'Reply' : 'Comment'}</Button>
          </div>
        </div>
      </div>
    </form>
  )
}

function Comment({ c, experienceId, replies = [], onReport, depth = 0 }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body ?? '')
  const invalidate = () => qc.invalidateQueries({ queryKey: ['comments', experienceId] })
  const del = useMutation({
    mutationFn: () => deleteComment(c.id),
    onSuccess: () => {
      invalidate()
      toast.info('Comment deleted', { action: { label: 'Undo', onClick: () => restoreComment(c.id).then(invalidate) } })
    },
  })
  const save = useMutation({
    mutationFn: () => editComment(c.id, draft),
    onSuccess: () => { setEditing(false); invalidate() },
    onError: (e) => toast.error(e.message),
  })
  const name = c.author?.full_name ?? (c.is_experience_author ? 'Author' : 'Former PSG student')

  return (
    <li className={cn(depth && 'mt-4')}>
      <div className="flex gap-3">
        {c.author ? <Avatar name={c.author.full_name} size={32} /> : <Avatar anonymous size={32} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-body font-medium text-ink-900">{name}</p>
            {c.is_experience_author && <Badge tone="teal" className="h-5">Author</Badge>}
            <span className="text-small text-ink-500">{timeAgo(c.created_at)}{c.edited_at && ' · edited'}</span>
            {c.status === 'visible' && (
              <Menu>
                <MenuTrigger asChild>
                  <IconButton label="Comment actions" size="sm" className="ml-auto -mr-1.5"><Ellipsis /></IconButton>
                </MenuTrigger>
                <MenuContent>
                  {c.can_edit && <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>Edit</MenuItem>}
                  {c.is_owner && <MenuItem icon={Trash2} tone="danger" onSelect={() => del.mutate()}>Delete</MenuItem>}
                  {!c.is_owner && <MenuItem icon={Flag} onSelect={() => onReport({ type: 'comment', id: c.id })}>Report</MenuItem>}
                </MenuContent>
              </Menu>
            )}
          </div>
          {c.status !== 'visible' ? (
            <p className="mt-1 text-body italic text-ink-500">{c.status === 'deleted' ? 'Comment deleted by its author.' : 'Comment hidden by moderators.'}</p>
          ) : editing ? (
            <div className="mt-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} minRows={2} aria-label="Edit comment" />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
              </div>
            </div>
          ) : (
            <Markdown size="sm" className="mt-1 [&_p]:text-body">{c.body}</Markdown>
          )}
          {depth === 0 && c.status === 'visible' && !editing && (
            <button onClick={() => setReplying((r) => !r)} className="mt-1.5 inline-flex items-center gap-1 text-small font-medium text-ink-600 hover:text-ink-900">
              <CornerDownRight className="size-3.5" aria-hidden /> Reply
            </button>
          )}
          {replies.length > 0 && (
            <ul className="mt-1 border-l-2 border-ink-100 pl-4">
              {replies.map((r) => <Comment key={r.id} c={r} experienceId={experienceId} onReport={onReport} depth={1} />)}
            </ul>
          )}
          {replying && (
            <div className="mt-3">
              <Composer experienceId={experienceId} parentId={c.id} autoFocus onDone={() => setReplying(false)} placeholder="Write a reply…" />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function Comments({ experienceId }) {
  const q = useQuery({ queryKey: ['comments', experienceId], queryFn: () => listComments(experienceId) })
  const [order, setOrder] = useState('oldest')
  const [showAll, setShowAll] = useState(false)
  const [reportTarget, setReportTarget] = useState(null)
  const all = q.data ?? []
  let top = all.filter((c) => !c.parent_id)
  if (order === 'newest') top = [...top].reverse()
  const visible = showAll ? top : top.slice(0, COLLAPSE_AFTER)
  const count = all.filter((c) => c.status === 'visible').length

  return (
    <section id="comments" className="scroll-mt-24" aria-labelledby="comments-h">
      <div className="mb-5 flex items-center justify-between">
        <h2 id="comments-h" className="flex items-center gap-2 text-h2">
          Comments {count > 0 && <span className="text-ink-500 tabular">{count}</span>}
        </h2>
        {top.length > 1 && (
          <button onClick={() => setOrder((o) => (o === 'oldest' ? 'newest' : 'oldest'))} className="text-small font-medium text-ink-600 hover:text-ink-900">
            {order === 'oldest' ? 'Oldest first' : 'Newest first'}
          </button>
        )}
      </div>
      <Composer experienceId={experienceId} />
      <div className="mt-8">
        {q.isPending ? (
          <div className="space-y-5">{[0, 1].map((i) => <div key={i} className="flex gap-3"><Skeleton className="size-8 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-full" /></div></div>)}</div>
        ) : q.isError ? (
          <ErrorState title="Couldn’t load comments" onRetry={() => q.refetch()} error={q.error} />
        ) : top.length === 0 ? (
          <p className="flex items-center gap-2 text-body text-ink-500"><MessageSquare className="size-4" aria-hidden /> No comments yet. Ask the author something.</p>
        ) : (
          <>
            <ul className="space-y-6">
              {visible.map((c) => (
                <Comment key={c.id} c={c} experienceId={experienceId} replies={all.filter((r) => r.parent_id === c.id)} onReport={setReportTarget} />
              ))}
            </ul>
            {top.length > COLLAPSE_AFTER && !showAll && (
              <Button variant="secondary" size="sm" className="mt-6" onClick={() => setShowAll(true)}>
                Show all {pluralize(top.length, 'comment')}
              </Button>
            )}
          </>
        )}
      </div>
      {reportTarget && <ReportDialog open onOpenChange={(o) => !o && setReportTarget(null)} target={reportTarget} />}
    </section>
  )
}
