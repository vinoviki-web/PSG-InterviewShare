import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Users as UsersIcon, SearchX, Ban, RotateCcw, ExternalLink, Flag, Lock } from 'lucide-react'
import {
  Avatar, Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, FetchingBar, Segmented, Skeleton, Tooltip, useToast,
} from '@/components/ui'
import { listUsers, getUserFacets, getUserDetail, setUserRole, suspendUser, unsuspendUser } from '@/api/admin'
import { REASON_LABEL } from '@/api/moderation'
import { useDebounced } from '@/hooks/useDebounced'
import { batchLabel, formatDate, timeAgo, pluralize } from '@/lib/utils'
import { DataTable } from '@/components/admin/DataTable'
import {
  PageHeader, Toolbar, SearchInput, FilterSelect, RoleBadge, UserStatusBadge, Callout, DrawerSection, DetailList, MiniStat, errorText, useInvalidateAll,
} from '@/components/admin/AdminUi'
import { SuspendDialog } from '@/components/admin/SuspendDialog'
import { ROLE_LABEL, auditLabel, auditSummary, formatDateTime } from '@/components/admin/format'

const ROLE_OPTIONS = [
  { value: 'student', label: 'Students' },
  { value: 'moderator', label: 'Moderators' },
  { value: 'admin', label: 'Admins' },
]
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'onboarding', label: 'Onboarding' },
]
const ROLE_HELP = {
  student: 'Reads, shares and reports experiences.',
  moderator: 'Also reviews reports, hides and restores content.',
  admin: 'Also manages users, roles, companies, settings and the audit log.',
}

const batchText = (u) => [u.department, batchLabel(u.graduation_year)].filter(Boolean).join(' ') || '—'
const displayName = (u) => u.full_name || 'Unnamed account'

const COLUMNS = [
  {
    id: 'user',
    header: 'User',
    sort: (u) => displayName(u).toLowerCase(),
    cell: (u) => (
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={displayName(u)} size={32} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink-900">{displayName(u)}</span>
          <span className="block truncate font-mono text-small text-ink-500">{u.email}</span>
        </span>
      </span>
    ),
  },
  { id: 'role', header: 'Role', className: 'w-32', cell: (u) => <RoleBadge role={u.role} />, sort: (u) => ['student', 'moderator', 'admin'].indexOf(u.role), defaultDir: 'desc' },
  { id: 'batch', header: 'Batch', className: 'hidden w-28 lg:table-cell', cell: (u) => <span className="text-ink-700">{batchText(u)}</span>, sort: (u) => u.graduation_year },
  {
    id: 'published',
    header: 'Experiences',
    align: 'right',
    className: 'hidden w-28 lg:table-cell',
    cell: (u) => <span className="tabular text-ink-900">{u.published_count}</span>,
    sort: (u) => u.published_count,
    defaultDir: 'desc',
  },
  { id: 'status', header: 'Status', className: 'w-32', cell: (u) => <UserStatusBadge status={u.status} /> },
  {
    id: 'joined',
    header: 'Joined',
    className: 'hidden w-28 xl:table-cell',
    cell: (u) => (u.created_at ? <time title={formatDateTime(u.created_at)} className="text-ink-600">{timeAgo(u.created_at)}</time> : '—'),
    sort: (u) => u.created_at,
    defaultDir: 'desc',
  },
]

function UserCard({ u }) {
  return (
    <span className="flex items-start gap-3">
      <Avatar name={displayName(u)} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink-900">{displayName(u)}</span>
        <span className="block truncate font-mono text-small text-ink-500">{u.email}</span>
        <span className="mt-2.5 flex flex-wrap items-center gap-2 text-small text-ink-600">
          <UserStatusBadge status={u.status} />
          {u.role !== 'student' && <RoleBadge role={u.role} />}
          <span>{[u.graduation_year && batchText(u), pluralize(u.published_count, 'experience')].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
    </span>
  )
}

export default function UsersPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const dq = useDebounced(q.trim(), 250)
  const filters = {
    q: dq,
    role: params.get('role') ?? 'all',
    status: params.get('status') ?? 'all',
    dept: params.get('dept') ?? 'all',
    batch: params.get('batch') ?? 'all',
  }
  const userId = params.get('user')

  const update = (patch) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        Object.entries(patch).forEach(([k, v]) => (v == null || v === '' || v === 'all' ? next.delete(k) : next.set(k, v)))
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    if ((params.get('q') ?? '') !== dq) update({ q: dq })
  }, [dq])

  const query = useQuery({ queryKey: ['admin', 'users', filters], queryFn: () => listUsers(filters), placeholderData: (prev) => prev })
  const facets = useQuery({ queryKey: ['admin', 'user-facets'], queryFn: getUserFacets, staleTime: 300_000 })
  const active = ['role', 'status', 'dept', 'batch'].filter((k) => filters[k] !== 'all').length + (dq ? 1 : 0)
  const clear = () => {
    setQ('')
    update({ q: null, role: null, status: null, dept: null, batch: null })
  }

  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = query

  return (
    <>
      <PageHeader title="Users" description="Find students and manage roles and suspensions. Email addresses are shown to admins only." />
      <Toolbar search={<SearchInput value={q} onChange={setQ} placeholder="Search name, handle or email" label="Search users" />}>
        <FilterSelect label="Role" allLabel="All roles" value={filters.role} onValueChange={(v) => update({ role: v })} options={ROLE_OPTIONS} />
        <FilterSelect label="Status" allLabel="Any status" value={filters.status} onValueChange={(v) => update({ status: v })} options={STATUS_OPTIONS} />
        <FilterSelect label="Department" allLabel="All departments" value={filters.dept} onValueChange={(v) => update({ dept: v })} options={facets.data?.departments ?? []} />
        <FilterSelect label="Batch" allLabel="All batches" value={filters.batch} onValueChange={(v) => update({ batch: v })} options={facets.data?.batches ?? []} />
      </Toolbar>

      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <p className="text-small text-ink-500" aria-live="polite">
          {data ? `${pluralize(data.total ?? data.items.length, 'user')}${active ? ((data.total ?? data.items.length) === 1 ? ' matches' : ' match') : ''}` : ' '}
        </p>
        {active > 0 && (
          <Button variant="link" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      <FetchingBar active={isFetching && !isPending} />

      {error ? (
        <ErrorState title="Couldn’t load users" message={errorText(error)} onRetry={refetch} />
      ) : (
        <DataTable
          label="Users"
          columns={COLUMNS}
          rows={data?.items}
          rowKey={(u) => u.id}
          onRowClick={(u) => update({ user: u.id })}
          rowLabel={(u) => `Open ${displayName(u)}`}
          card={(u) => <UserCard u={u} />}
          selectedKey={userId}
          loading={isPending}
          dim={isPlaceholderData}
          resetKey={JSON.stringify(filters)}
          empty={
            active ? (
              <EmptyState icon={SearchX} title="No users match" action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}>
                Try a shorter search, or remove a filter.
              </EmptyState>
            ) : (
              <EmptyState icon={UsersIcon} title="No users yet">
                Students appear here after they sign in with their PSG account.
              </EmptyState>
            )
          }
        />
      )}

      <UserDrawer userId={userId} onClose={() => update({ user: null })} />
    </>
  )
}

/* ---------------- Drawer ---------------- */
function UserDrawer({ userId, onClose }) {
  const last = useRef(userId)
  if (userId) last.current = userId
  const id = last.current
  const { data: u, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => getUserDetail(id), enabled: !!id })
  const [pendingRole, setPendingRole] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null)
  const toast = useToast()
  const invalidateAll = useInvalidateAll()

  useEffect(() => {
    setPendingRole(null)
    setDialog(null)
  }, [id])

  const changeRole = async () => {
    setBusy(true)
    try {
      await setUserRole(u.id, pendingRole)
      toast.success(pendingRole === 'student' ? `${displayName(u)} is now a student.` : `${displayName(u)} is now ${pendingRole === 'admin' ? 'an admin' : 'a moderator'}.`)
      setPendingRole(null)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
      invalidateAll()
    }
  }

  const doSuspend = async (payload) => {
    try {
      const res = await suspendUser(u.id, payload)
      toast.success(res.until ? `${displayName(u)} is suspended until ${formatDate(res.until)}.` : `${displayName(u)} is suspended until an admin lifts it.`)
    } catch (e) {
      if (!e.fields) toast.error(errorText(e))
      throw e
    } finally {
      invalidateAll()
    }
  }

  const doUnsuspend = async () => {
    setBusy(true)
    try {
      await unsuspendUser(u.id)
      toast.success(`Suspension lifted. ${displayName(u)} can sign in again.`)
      setDialog(null)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
      invalidateAll()
    }
  }

  const roleLocked = u && (u.is_self || u.is_last_admin)
  const roleHint = !u ? null : u.is_self ? 'You can’t change your own role. Ask another admin.' : u.is_last_admin ? 'This is the only admin. Make someone else an admin first.' : ROLE_HELP[u.role]

  const footer = u && !error && (
    <>
      {u.is_self ? (
        <p className="flex items-center gap-1.5 text-small text-ink-500 sm:mr-auto">
          <Lock className="size-3.5" aria-hidden /> This is your account.
        </p>
      ) : u.status === 'suspended' ? (
        <Button variant="secondary" onClick={() => setDialog('unsuspend')}>
          <RotateCcw aria-hidden /> Lift suspension
        </Button>
      ) : u.role === 'admin' ? (
        <Tooltip content="Admins can’t be suspended. Change their role first.">
          <span tabIndex={0} className="rounded-md">
            <Button variant="secondary" disabled className="w-full">
              <Ban aria-hidden /> Suspend…
            </Button>
          </span>
        </Tooltip>
      ) : (
        <Button variant="secondary" onClick={() => setDialog('suspend')}>
          <Ban aria-hidden /> Suspend…
        </Button>
      )}
    </>
  )

  return (
    <>
      <Dialog
        side="right"
        open={!!userId}
        onOpenChange={(o) => !o && onClose()}
        title={u ? displayName(u) : 'User'}
        description={u ? [u.handle && `@${u.handle}`, u.created_at && `Joined ${formatDate(u.created_at)}`].filter(Boolean).join(' · ') : undefined}
        footer={footer}
      >
        {isPending ? (
          <DrawerSkeleton />
        ) : error ? (
          <ErrorState title="Couldn’t load this user" message={errorText(error)} onRetry={refetch} className="mt-2" />
        ) : (
          <div className="space-y-6 pb-2 pt-2">
            <div className="flex items-center gap-4">
              <Avatar name={displayName(u)} size={64} />
              <div className="min-w-0">
                <p className="truncate font-mono text-small text-ink-600">{u.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <UserStatusBadge status={u.status} />
                  <RoleBadge role={u.role} />
                </div>
              </div>
            </div>

            {u.suspension && (
              <Callout tone="danger" title={u.suspension.until ? `Suspended until ${formatDate(u.suspension.until)}` : 'Suspended until an admin lifts it'}>
                {u.suspension.reason ?? 'No reason recorded.'}
                {u.suspension.by && ` · by ${u.suspension.by}`}
                {u.suspension.at && ` · ${timeAgo(u.suspension.at)}`}
              </Callout>
            )}

            <DrawerSection title="Role">
              <Segmented
                value={u.role}
                onValueChange={(v) => v !== u.role && setPendingRole(v)}
                options={[
                  { value: 'student', label: 'Student' },
                  { value: 'moderator', label: 'Moderator' },
                  { value: 'admin', label: 'Admin' },
                ]}
                disabled={roleLocked}
                aria-label="Role"
                className={roleLocked ? 'opacity-60' : undefined}
              />
              <p className="mt-2 text-small text-ink-500">{roleHint}</p>
            </DrawerSection>

            <DrawerSection title="Profile">
              <DetailList
                items={[
                  { label: 'Department', value: u.department ?? '—' },
                  { label: 'Batch', value: u.graduation_year ? `${batchLabel(u.graduation_year)} (${u.graduation_year})` : '—' },
                  { label: 'Joined', value: u.created_at ? formatDate(u.created_at) : '—' },
                  { label: 'Onboarded', value: u.onboarded_at ? formatDate(u.onboarded_at) : 'Not yet' },
                  { label: 'Profile', value: u.profile_visibility === 'private' ? 'Private' : 'Visible to PSG students' },
                  { label: 'User ID', value: u.id, mono: true },
                  u.bio && { label: 'Bio', value: <span className="whitespace-normal">{u.bio}</span>, wide: true },
                ]}
              />
            </DrawerSection>

            <DrawerSection title="Contributions">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Published" value={u.published_count} />
                <MiniStat label="Comments" value={u.comment_count} />
                <MiniStat label="Helpful votes" value={u.helpful_received} />
              </div>
              {u.experiences.length > 0 && (
                <ul className="mt-3 divide-y divide-ink-200 rounded-lg border border-ink-200">
                  {u.experiences.slice(0, 6).map((e) => (
                    <li key={e.id}>
                      <Link to={`/experiences/${e.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-ink-25">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-ink-900">{e.title}</span>
                          <span className="block text-small text-ink-500">
                            {e.status === 'published' ? `Published ${timeAgo(e.published_at)} · ${pluralize(e.helpful_count, 'helpful vote')}` : e.status === 'hidden' ? 'Hidden' : e.status}
                          </span>
                        </span>
                        <ExternalLink className="size-3.5 shrink-0 text-ink-500" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {u.anonymous_count > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-small text-ink-500">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Plus {pluralize(u.anonymous_count, 'anonymous experience')}, not listed so they stay anonymous.
                </p>
              )}
              {!u.experiences.length && !u.anonymous_count && <p className="mt-3 text-small text-ink-500">Hasn’t shared an experience yet.</p>}
            </DrawerSection>

            <DrawerSection title="Reports against" count={u.reports_against.length}>
              {u.reports_against.length ? (
                <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
                  {u.reports_against.map((r) => (
                    <li key={r.id}>
                      <Link to={`/mod?item=${encodeURIComponent(r.key)}`} className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-ink-25">
                        <Flag className="mt-1 size-3.5 shrink-0 text-ink-500" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-ink-900">{r.title}</span>
                          <span className="block text-small text-ink-500">
                            {REASON_LABEL[r.reason] ?? r.reason} · {timeAgo(r.created_at)}
                          </span>
                        </span>
                        <Badge tone={r.status === 'open' || r.status === 'escalated' ? 'warning' : 'neutral'} className="capitalize">
                          {r.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-500">No reports against this student’s named content.</p>
              )}
            </DrawerSection>

            {u.activity.length > 0 && (
              <DrawerSection title="Admin activity">
                <ol className="space-y-3">
                  {u.activity.map((a) => (
                    <li key={a.id} className="flex gap-3 text-small">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-ink-800">
                          <span className="font-medium">{auditLabel(a.action)}</span>
                          {auditSummary(a) && <span className="text-ink-600"> · {auditSummary(a)}</span>}
                        </p>
                        <p className="text-ink-500">
                          {a.actor} · <time title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</time>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </DrawerSection>
            )}
          </div>
        )}
      </Dialog>

      {u && (
        <>
          <ConfirmDialog
            open={!!pendingRole}
            onOpenChange={(o) => !o && !busy && setPendingRole(null)}
            title={
              pendingRole === 'student'
                ? `Remove ${displayName(u)}’s ${ROLE_LABEL[u.role]?.toLowerCase()} role?`
                : `Make ${displayName(u)} ${pendingRole === 'admin' ? 'an admin' : 'a moderator'}?`
            }
            body={
              pendingRole === 'student'
                ? `They lose access to ${u.role === 'admin' ? 'the admin area and the moderation queue' : 'the moderation queue'} right away. Their content isn’t affected.`
                : pendingRole === 'admin'
                  ? 'Admins can manage users and roles, reveal anonymous authors, remove content and change settings. Only grant this to people you trust fully.'
                  : 'Moderators see the report queue and can hide or restore content. They can’t see who reported something.'
            }
            confirmLabel={pendingRole === 'student' ? 'Remove role' : pendingRole === 'admin' ? 'Make admin' : 'Make moderator'}
            tone={pendingRole === 'student' ? 'danger' : 'primary'}
            loading={busy}
            onConfirm={changeRole}
          />
          <SuspendDialog open={dialog === 'suspend'} onOpenChange={(o) => setDialog(o ? 'suspend' : null)} subject={displayName(u)} onConfirm={doSuspend} />
          <ConfirmDialog
            open={dialog === 'unsuspend'}
            onOpenChange={(o) => !o && !busy && setDialog(null)}
            title={`Lift ${displayName(u)}’s suspension?`}
            body="They can sign in, read and post again straight away."
            confirmLabel="Lift suspension"
            tone="primary"
            loading={busy}
            onConfirm={doUnsuspend}
          />
        </>
      )}
    </>
  )
}

function DrawerSkeleton() {
  return (
    <div className="space-y-6 pt-2" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-5 w-32 rounded-sm" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 border-t border-ink-200 pt-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}
