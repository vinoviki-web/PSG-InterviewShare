import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight, EyeOff, Eye, ExternalLink, MoreHorizontal, Trash2, Ban, Lock, ShieldAlert, UserRound,
} from 'lucide-react'
import {
  Avatar, Badge, Button, Dialog, ErrorState, Field, Select, Skeleton, Textarea, CharCount, Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, useToast,
} from '@/components/ui'
import { ExperienceArticle } from '@/components/experience/ExperienceArticle'
import { getModerationItem, dismissReports, hideContent, restoreContent, escalateReports, undoModerationAction } from '@/api/moderation'
import { removeContent, suspendAuthorOf, revealAuthor } from '@/api/admin'
import { REPORT_REASONS } from '@/lib/constants'
import { timeAgo, pluralize, batchLabel, cn } from '@/lib/utils'
import { Callout, DrawerSection, FormDialog, MiniStat, StateBadge, TypeIcon, TYPE_LABEL, errorText, focusFirstError, useInvalidateAll } from './AdminUi'
import { SuspendDialog } from './SuspendDialog'
import { formatDateTime } from './format'

const REPORT_STATUS = { open: 'Open', escalated: 'Escalated', dismissed: 'Dismissed', actioned: 'Actioned' }

/* ---------------- Actions ---------------- */
function useModerationRunner(onClose) {
  const qc = useQueryClient()
  const toast = useToast()
  const invalidateAll = useInvalidateAll()

  /** Optimistically drop the row from every queue list; returns a rollback. */
  const dropFromQueues = (key) => {
    const filters = [{ queryKey: ['mod', 'queue'] }, { queryKey: ['admin', 'reports'] }]
    const snaps = filters.flatMap((f) => qc.getQueriesData(f))
    const strip = (old) => (old?.items ? { ...old, items: old.items.filter((i) => i.key !== key) } : old)
    filters.forEach((f) => qc.setQueriesData(f, strip))
    return () => snaps.forEach(([k, d]) => qc.setQueryData(k, d))
  }

  const undo = async (actionId) => {
    try {
      await undoModerationAction(actionId)
      toast.info('Undone. The item is back where it was.')
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      invalidateAll()
    }
  }

  /** optimistic: close + update lists first, roll back on failure. */
  return async function run({ key, fn, success, optimistic = false, close = true }) {
    const rollback = optimistic ? dropFromQueues(key) : null
    if (optimistic && close) onClose()
    try {
      const res = await fn()
      if (!optimistic && close) onClose()
      toast.success(success, res?.action_id ? { duration: 10000, action: { label: 'Undo', onClick: () => undo(res.action_id) } } : undefined)
      return res
    } catch (e) {
      rollback?.()
      toast.error(errorText(e))
      throw e
    } finally {
      invalidateAll()
    }
  }
}

/* ---------------- Dialogs ---------------- */
const HIDE_PHRASES = {
  spam: 'it reads as promotion or advertising rather than an interview experience',
  misleading: 'readers reported that parts of it don’t match what happened in this drive',
  confidential: 'it includes test content the company asked candidates not to share',
  abusive: 'it includes language that attacks a person',
  privacy: 'it includes someone’s private information',
  other: 'it goes against the community guidelines',
}
const hideTemplate = (noun, reason) =>
  `We’ve hidden your ${noun} because ${HIDE_PHRASES[reason] ?? HIDE_PHRASES.other}. Edit it to fix this and a moderator will review it again.`

function HideDialog({ open, onOpenChange, item, onConfirm }) {
  const noun = item.target_type
  const [reason, setReason] = useState(item.top_reason ?? 'other')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const ref = useRef(null)

  useEffect(() => {
    if (open) {
      const r = REPORT_REASONS.some((x) => x.value === item.top_reason) ? item.top_reason : 'other'
      setReason(r)
      setMessage(hideTemplate(noun, r))
      setErrors({})
    }
  }, [open, item.top_reason, noun])

  const changeReason = (r) => {
    /* Only replace the message if the moderator hasn't edited the template. */
    if (message === hideTemplate(noun, reason)) setMessage(hideTemplate(noun, r))
    setReason(r)
  }

  const submit = () => {
    const e = {}
    if (message.trim().length < 20) e.message = 'Write at least 20 characters so the author knows what to fix.'
    else if (message.trim().length > 600) e.message = 'Keep the message under 600 characters.'
    setErrors(e)
    if (Object.keys(e).length) return focusFirstError(ref.current)
    onConfirm({ reason, message: message.trim() })
  }

  const already = item.content_status === 'hidden'
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={already ? `Keep this ${noun} hidden?` : `Hide this ${noun}?`}
      description={
        already
          ? 'It stays hidden from readers and the open reports are closed. The author gets your message.'
          : 'Readers stop seeing it right away and the open reports are closed. The author gets your message.'
      }
      confirmLabel={already ? 'Keep hidden' : `Hide ${noun}`}
      tone="danger"
      onSubmit={submit}
    >
      <div ref={ref} className="space-y-5">
        <Field label="Reason" required hint="Recorded in the moderation log.">
          <Select value={reason} onValueChange={changeReason} options={REPORT_REASONS} />
        </Field>
        <Field label="Message to the author" required error={errors.message} hint="Sent as a notification. Reporters are never named." counter={<CharCount value={message} max={600} />}>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} minRows={4} maxRows={10} />
        </Field>
      </div>
    </FormDialog>
  )
}

function NoteDialog({ open, onOpenChange, title, description, label, hint, confirmLabel, tone, required, min = 10, max = 500, placeholder, onConfirm, children }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (open) {
      setNote('')
      setError(null)
    }
  }, [open])
  const submit = async () => {
    const n = note.trim()
    let e = null
    if (required && n.length < min) e = `Give a reason of at least ${min} characters.`
    else if (n.length > max) e = `Keep it under ${max} characters.`
    setError(e)
    if (e) return focusFirstError(ref.current)
    setLoading(true)
    try {
      await onConfirm(n)
      onOpenChange(false)
    } catch (err) {
      if (err?.fields) setError(Object.values(err.fields)[0])
    } finally {
      setLoading(false)
    }
  }
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={title} description={description} confirmLabel={confirmLabel} tone={tone} loading={loading} onSubmit={submit}>
      <div ref={ref} className="space-y-4">
        {children}
        <Field label={label} required={required} optional={!required} error={error} hint={hint} counter={<CharCount value={note} max={max} />}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} minRows={3} maxRows={8} placeholder={placeholder} />
        </Field>
      </div>
    </FormDialog>
  )
}

/* ---------------- Drawer ---------------- */
export function ModerationDrawer({ itemKey, onClose }) {
  const lastKey = useRef(itemKey)
  if (itemKey) lastKey.current = itemKey
  const key = lastKey.current
  const open = !!itemKey
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['mod', 'item', key],
    queryFn: () => getModerationItem(key),
    enabled: !!key,
  })
  const [dialog, setDialog] = useState(null)
  const [revealed, setRevealed] = useState(null)
  const run = useModerationRunner(onClose)
  const toast = useToast()
  const invalidateAll = useInvalidateAll()

  useEffect(() => {
    setRevealed(null)
    setDialog(null)
  }, [key])

  const type = data?.target_type
  const title = data ? `${data.content_status === 'hidden' && !data.report_count ? 'Hidden' : 'Reported'} ${TYPE_LABEL[type]?.toLowerCase()}` : 'Review'
  const description = data
    ? data.report_count
      ? `${pluralize(data.report_count, 'report')} · first reported ${timeAgo(data.first_reported_at)}`
      : 'No reports. Hidden by the moderation team.'
    : undefined

  const act = {
    dismiss: () =>
      run({ key, optimistic: true, fn: () => dismissReports(key), success: data.content_status === 'hidden' ? 'Reports dismissed and the content is visible again.' : 'Reports dismissed.' }).catch(() => {}),
    restore: () => run({ key, optimistic: true, fn: () => restoreContent(key), success: `${TYPE_LABEL[type]} restored. Readers can see it again.` }).catch(() => {}),
    hide: (payload) => {
      setDialog(null)
      run({ key, optimistic: true, fn: () => hideContent(key, payload), success: `${TYPE_LABEL[type]} hidden. The author has been told why.` }).catch(() => {})
    },
    escalate: (note) => run({ key, fn: () => escalateReports(key, { note }), success: 'Escalated. Admins will make the final call.' }),
    remove: (reason) => run({ key, optimistic: true, close: false, fn: () => removeContent(key, { reason }), success: `${TYPE_LABEL[type]} removed for everyone.` }).then(onClose),
    suspend: (payload) => run({ key, close: false, fn: () => suspendAuthorOf(key, payload), success: 'Author suspended.' }),
    reveal: async (reason) => {
      try {
        const who = await revealAuthor(key, { reason })
        setRevealed(who)
        invalidateAll()
      } catch (e) {
        toast.error(errorText(e))
        throw e
      }
    },
  }

  return (
    <>
      <Dialog
        side="right"
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={title}
        description={description}
        footer={data && !error ? <DrawerFooter item={data} onClose={onClose} setDialog={setDialog} act={act} revealed={revealed} /> : null}
      >
        {isPending ? (
          <DrawerSkeleton />
        ) : error ? (
          <ErrorState title="Couldn’t load this item" message={errorText(error)} onRetry={refetch} className="mt-2" />
        ) : (
          <DrawerBody item={data} revealed={revealed} onReveal={() => setDialog('reveal')} />
        )}
      </Dialog>

      {data && (
        <>
          <HideDialog open={dialog === 'hide'} onOpenChange={(o) => setDialog(o ? 'hide' : null)} item={data} onConfirm={act.hide} />
          <NoteDialog
            open={dialog === 'escalate'}
            onOpenChange={(o) => setDialog(o ? 'escalate' : null)}
            title="Escalate to admins?"
            description="Admins can remove content and suspend accounts. You won’t be able to act on this item after escalating."
            label="Note for admins"
            hint="What should they look at? They see your name on the escalation."
            placeholder="e.g. Third report about this author this month"
            confirmLabel="Escalate"
            onConfirm={act.escalate}
          />
          <NoteDialog
            open={dialog === 'remove'}
            onOpenChange={(o) => setDialog(o ? 'remove' : null)}
            title={`Remove this ${type}?`}
            description="It disappears for everyone, including the author, and can’t be restored from here. Open reports are closed."
            label="Reason"
            required
            hint="Sent to the author and kept in the audit log."
            confirmLabel={`Remove ${type}`}
            tone="danger"
            onConfirm={act.remove}
          />
          <NoteDialog
            open={dialog === 'reveal'}
            onOpenChange={(o) => setDialog(o ? 'reveal' : null)}
            title="Reveal the anonymous author?"
            description="Anonymity is a promise to contributors. Reveal only when you need to act on the account."
            label="Reason"
            required
            hint="Logged with your name in the audit log. Other moderators can’t see who it is."
            placeholder="e.g. Checking for repeat abuse before suspending"
            confirmLabel="Reveal author"
            onConfirm={act.reveal}
          >
            <Callout tone="warning" icon={ShieldAlert}>
              Every reveal is audited (decision D7). Don’t share the identity outside the admin team.
            </Callout>
          </NoteDialog>
          <SuspendDialog
            open={dialog === 'suspend'}
            onOpenChange={(o) => setDialog(o ? 'suspend' : null)}
            subject={type === 'profile' ? data.preview.title : 'the author'}
            masked={data.author.masked && !revealed}
            onConfirm={act.suspend}
          />
        </>
      )}
    </>
  )
}

function DrawerFooter({ item, onClose, setDialog, act, revealed }) {
  const p = item.permissions
  if (!p.can_act) {
    return (
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
    )
  }
  const hasActive = item.active_count > 0
  const hidden = item.content_status === 'hidden'
  const isProfile = item.target_type === 'profile'
  const canEscalate = !p.is_admin && hasActive && item.state !== 'escalated'
  return (
    <>
      <div className="flex flex-col gap-2 sm:mr-auto sm:flex-row">
        {canEscalate && (
          <Button variant="ghost" onClick={() => setDialog('escalate')}>
            <ArrowUpRight aria-hidden /> Escalate to admin
          </Button>
        )}
        {p.is_admin && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost">
                <MoreHorizontal aria-hidden /> Admin actions
              </Button>
            </MenuTrigger>
            <MenuContent align="start" className="z-[55]! w-60">
              {item.author.masked && !revealed && (
                <MenuItem icon={Eye} onSelect={() => setDialog('reveal')}>
                  Reveal author…
                </MenuItem>
              )}
              <MenuItem icon={Ban} onSelect={() => setDialog('suspend')}>
                {isProfile ? 'Suspend user…' : 'Suspend author…'}
              </MenuItem>
              {!isProfile && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} tone="danger" onSelect={() => setDialog('remove')}>
                    Remove {item.target_type}…
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        )}
      </div>
      {hasActive && (
        <Button variant="secondary" onClick={act.dismiss}>
          {hidden ? 'Dismiss and restore' : 'Dismiss reports'}
        </Button>
      )}
      {!hasActive && hidden && (
        <Button variant="secondary" onClick={act.restore}>
          <Eye aria-hidden /> Restore
        </Button>
      )}
      {!isProfile && (hasActive || !hidden) && (
        <Button onClick={() => setDialog('hide')}>
          <EyeOff aria-hidden /> {hidden ? 'Keep hidden…' : 'Hide…'}
        </Button>
      )}
    </>
  )
}

function StatusCallouts({ item }) {
  const p = item.permissions
  return (
    <div className="space-y-2">
      {p.blocked === 'own' && (
        <Callout tone="warning" title={`This is your ${item.target_type}`}>
          You can’t moderate your own content or reports about you. Another moderator will review it.
        </Callout>
      )}
      {item.escalation && (
        <Callout tone="info" icon={ArrowUpRight} title={`Escalated by ${item.escalation.by} ${timeAgo(item.escalation.at)}`}>
          {item.escalation.note ? `“${item.escalation.note}”` : 'No note added.'}
          {p.blocked === 'escalated' && ' Admins will make the final call.'}
        </Callout>
      )}
      {item.content_status === 'hidden' && (
        <Callout tone="info" icon={EyeOff} title="Hidden from readers">
          {item.hidden_reason ?? 'Hidden by the moderation team.'}
          {item.hidden_at && ` · ${timeAgo(item.hidden_at)}`}
        </Callout>
      )}
      {item.state === 'removed' && (
        <Callout tone="info" icon={Trash2} title="Removed by an admin">
          This content is gone for everyone. Reports on it are closed.
        </Callout>
      )}
      {p.blocked === 'missing' && <Callout tone="info" title="This content no longer exists">The author deleted it, or it was removed.</Callout>}
    </div>
  )
}

function DrawerBody({ item, revealed, onReveal }) {
  const p = item.permissions
  return (
    <div className="space-y-6 pb-2 pt-2">
      <div className="flex items-start gap-3">
        <TypeIcon type={item.target_type} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-body-lg font-medium text-ink-900">{item.preview.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StateBadge state={item.state} />
            {item.reasons.slice(0, 3).map((r) => (
              <Badge key={r.reason} tone="outline">
                {r.label}
                {r.count > 1 && <span className="tabular text-ink-500">×{r.count}</span>}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <StatusCallouts item={item} />

      {item.reports.length > 0 && (
        <DrawerSection title="Reports" count={item.reports.length}>
          <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
            {item.reports.map((r) => (
              <li key={r.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-body font-medium text-ink-900">{r.reason_label}</p>
                  <time dateTime={r.created_at} title={formatDateTime(r.created_at)} className="shrink-0 text-small text-ink-500">
                    {timeAgo(r.created_at)}
                  </time>
                </div>
                {r.details ? <p className="mt-1 text-body text-ink-700">“{r.details}”</p> : <p className="mt-1 text-small text-ink-500">No note added.</p>}
                {(r.reporter || r.status !== 'open') && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    {r.reporter ? (
                      <span className="flex min-w-0 items-center gap-2 text-small text-ink-600">
                        <Avatar name={r.reporter.full_name} size={24} />
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-ink-800">{r.reporter.full_name}</span>
                          <span className="font-mono text-ink-500"> · {r.reporter.email}</span>
                        </span>
                      </span>
                    ) : (
                      <span />
                    )}
                    {r.status !== 'open' && <Badge tone="neutral">{REPORT_STATUS[r.status] ?? r.status}</Badge>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!p.is_admin && (
            <p className="mt-2 flex items-center gap-1.5 text-small text-ink-500">
              <Lock className="size-3.5" aria-hidden /> Reporter identities are visible to admins only.
            </p>
          )}
        </DrawerSection>
      )}

      <AuthorSection item={item} revealed={revealed} onReveal={onReveal} />

      {item.content && (
        <DrawerSection
          title="Content"
          action={
            item.preview.href &&
            item.state !== 'removed' && (
              <Link to={item.preview.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-small font-medium text-teal-700 hover:underline">
                Open page <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            )
          }
        >
          <ContentPreview item={item} />
        </DrawerSection>
      )}

      {item.history.length > 0 && (
        <DrawerSection title="History">
          <ol className="space-y-3">
            {item.history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                <div className="min-w-0 text-small">
                  <p className={cn('text-ink-800', h.undone_at && 'text-ink-500 line-through')}>
                    <span className="font-medium">{h.label}</span>
                    {h.reason && ` · ${h.reason}`}
                  </p>
                  {h.note && <p className="mt-0.5 text-ink-600">“{h.note}”</p>}
                  <p className="mt-0.5 text-ink-500">
                    {h.actor} · <time title={formatDateTime(h.created_at)}>{timeAgo(h.created_at)}</time>
                    {h.undone_at && ' · undone'}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </DrawerSection>
      )}
    </div>
  )
}

function AuthorSection({ item, revealed, onReveal }) {
  const a = item.author
  const p = item.permissions
  const name = revealed?.full_name ?? a.user?.full_name
  const showReveal = p.is_admin && a.masked && !revealed && p.blocked !== 'own'
  return (
    <DrawerSection title="Author">
      <div className="flex items-center gap-3">
        {name ? <Avatar name={name} size={40} /> : <Avatar anonymous size={40} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink-900">{name ?? (a.masked ? 'Anonymous author' : 'Unknown author')}</p>
          <p className="truncate text-small text-ink-500">
            {revealed
              ? `${revealed.email} · ${[revealed.department, batchLabel(revealed.graduation_year)].filter(Boolean).join(' ')}`
              : a.masked
                ? p.is_admin
                  ? 'Identity masked. Revealing it requires a reason.'
                  : 'Identity masked. Only admins can reveal it.'
                : a.user?.handle
                  ? `@${a.user.handle}`
                  : 'Verified PSG student'}
          </p>
        </div>
        {showReveal && (
          <Button variant="secondary" size="sm" onClick={onReveal}>
            <Eye aria-hidden /> Reveal
          </Button>
        )}
      </div>
      {revealed && (
        <Callout tone="warning" icon={Eye} className="mt-3">
          Revealed to you just now. This was logged in the audit log with your reason.
        </Callout>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label={a.prior_actions === 1 ? 'Prior action on their content' : 'Prior actions on their content'} value={a.prior_actions} />
        <MiniStat label={a.other_reports === 1 ? 'Other report against them' : 'Other reports against them'} value={a.other_reports} />
      </div>
    </DrawerSection>
  )
}

function ContentPreview({ item }) {
  const c = item.content
  if (item.target_type === 'experience') {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-4 sm:p-5 [&_h1]:text-h2 [&_h2]:text-h3 [&_header_dl]:mt-4">
        <ExperienceArticle exp={c} />
      </div>
    )
  }
  if (item.target_type === 'comment') {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-4">
        {c.experience && (
          <p className="text-small text-ink-500">
            On{' '}
            <Link to={`/experiences/${c.experience.id}`} target="_blank" rel="noopener" className="font-medium text-ink-700 hover:text-teal-700 hover:underline">
              {c.experience.title}
            </Link>
          </p>
        )}
        {c.parent && (
          <div className="mt-3 border-l-2 border-ink-200 pl-3">
            <p className="text-small font-medium text-ink-700">In reply to {c.parent.author}</p>
            <p className="mt-0.5 line-clamp-3 text-small text-ink-600">{c.parent.body}</p>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          {c.author ? <Avatar name={c.author.full_name} size={24} /> : <Avatar anonymous size={24} />}
          <p className="text-small text-ink-600">
            <span className="font-medium text-ink-800">{c.author?.full_name ?? 'Anonymous author'}</span>
            {c.is_experience_author && ' · experience author'} · {timeAgo(c.created_at)}
          </p>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-body-lg text-ink-900">{c.body}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <Avatar name={c.full_name} size={40} />
        <div className="min-w-0">
          <p className="font-medium text-ink-900">{c.full_name}</p>
          <p className="text-small text-ink-500">{[c.handle && `@${c.handle}`, c.department, batchLabel(c.graduation_year)].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {c.bio ? <p className="mt-3 text-body text-ink-700">{c.bio}</p> : <p className="mt-3 flex items-center gap-1.5 text-small text-ink-500"><UserRound className="size-3.5" aria-hidden /> No bio.</p>}
    </div>
  )
}

function DrawerSkeleton() {
  return (
    <div className="space-y-6 pt-2" aria-busy="true" aria-label="Loading">
      <div className="flex gap-3">
        <Skeleton className="size-10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-5 w-40 rounded-sm" />
        </div>
      </div>
      <div className="space-y-2 border-t border-ink-200 pt-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <div className="space-y-2 border-t border-ink-200 pt-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <div className="space-y-2 border-t border-ink-200 pt-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}
