import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Download, Lock, ScrollText, SearchX, ArrowRight, ExternalLink } from 'lucide-react'
import { Avatar, Button, Dialog, EmptyState, ErrorState, FetchingBar, Input, useToast } from '@/components/ui'
import { listAuditLog, recordAuditExport } from '@/api/admin'
import { timeAgo } from '@/lib/utils'
import { DataTable } from '@/components/admin/DataTable'
import { PageHeader, Toolbar, FilterSelect, DrawerSection, DetailList, Callout, errorText, useInvalidateAll } from '@/components/admin/AdminUi'
import { auditLabel, auditSummary, formatDateTime, downloadCsv, todayInput } from '@/components/admin/format'

const ENTITY_LABEL = { user: 'User', company: 'Company', experience: 'Experience', comment: 'Comment', report: 'Report', settings: 'Settings', audit: 'Audit log', profile: 'Profile' }

function ActorCell({ a, size = 24 }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {a.actor_id === 'system' ? (
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-ink-50 text-[10px] font-semibold text-ink-600" aria-hidden>
          SYS
        </span>
      ) : (
        <Avatar name={a.actor_name} size={size} />
      )}
      <span className="truncate text-ink-800">{a.actor_name}</span>
    </span>
  )
}

const COLUMNS = [
  {
    id: 'action',
    header: 'Action',
    sort: (a) => a.action,
    cell: (a) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-ink-900">{auditLabel(a.action)}</span>
        <span className="block truncate text-small text-ink-500">{auditSummary(a) || <span className="font-mono">{a.action}</span>}</span>
      </span>
    ),
  },
  { id: 'actor', header: 'Actor', className: 'w-44', cell: (a) => <ActorCell a={a} />, sort: (a) => a.actor_name },
  {
    id: 'entity',
    header: 'Entity',
    className: 'hidden w-52 xl:table-cell',
    cell: (a) => (
      <span className="block truncate text-small">
        <span className="text-ink-700">{ENTITY_LABEL[a.entity] ?? a.entity}</span>
        <span className="font-mono text-ink-500"> {a.entity_id}</span>
      </span>
    ),
    sort: (a) => a.entity,
  },
  {
    id: 'when',
    header: 'When',
    className: 'w-40',
    cell: (a) => (
      <time dateTime={a.created_at} className="tabular text-small text-ink-600">
        {formatDateTime(a.created_at)}
      </time>
    ),
    sort: (a) => a.created_at,
    defaultDir: 'desc',
  },
]

function AuditCard({ a }) {
  return (
    <span className="block">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-medium text-ink-900">{auditLabel(a.action)}</span>
        <span className="shrink-0 text-small text-ink-500">{timeAgo(a.created_at)}</span>
      </span>
      {auditSummary(a) && <span className="mt-0.5 line-clamp-2 block text-small text-ink-600">{auditSummary(a)}</span>}
      <span className="mt-2.5 flex items-center justify-between gap-3 text-small">
        <ActorCell a={a} />
        <span className="truncate font-mono text-ink-500">
          {a.entity}:{a.entity_id}
        </span>
      </span>
    </span>
  )
}

export default function AuditLogPage() {
  const [params, setParams] = useSearchParams()
  const filters = {
    actor: params.get('actor') ?? 'all',
    action: params.get('action') ?? 'all',
    entity: params.get('entity') ?? 'all',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
  const [selected, setSelected] = useState(null)
  const [exporting, setExporting] = useState(false)
  const toast = useToast()
  const invalidateAll = useInvalidateAll()

  const update = (patch) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        Object.entries(patch).forEach(([k, v]) => (v == null || v === '' || v === 'all' ? next.delete(k) : next.set(k, v)))
        return next
      },
      { replace: true },
    )

  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: () => listAuditLog(filters),
    placeholderData: (prev) => prev,
  })
  const facets = data?.facets
  const active = Object.entries(filters).filter(([, v]) => v && v !== 'all').length
  const rangeError = filters.from && filters.to && filters.from > filters.to ? 'The start date is after the end date.' : null
  const clear = () => update({ actor: null, action: null, entity: null, from: null, to: null })

  const exportCsv = async () => {
    const rows = data?.items ?? []
    if (!rows.length) return
    setExporting(true)
    try {
      downloadCsv(
        `psg-interviewshare-audit-${todayInput()}.csv`,
        ['id', 'created_at', 'actor_id', 'actor_name', 'action', 'action_label', 'entity', 'entity_id', 'summary', 'metadata'],
        rows.map((a) => [a.id, a.created_at, a.actor_id, a.actor_name, a.action, auditLabel(a.action), a.entity, a.entity_id, auditSummary(a), a.metadata]),
      )
      await recordAuditExport(rows.length, Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all')))
      toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}. The export was logged.`)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setExporting(false)
      invalidateAll()
    }
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every admin and moderator action, with who did it and what changed."
        actions={
          <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!data?.items?.length}>
            <Download aria-hidden /> Export CSV
          </Button>
        }
      />
      <p className="-mt-3 mb-5 flex items-center gap-1.5 text-small text-ink-500">
        <Lock className="size-3.5 shrink-0" aria-hidden /> Append-only. Nobody, including admins, can edit or delete entries.
      </p>

      <Toolbar>
        <FilterSelect label="Actor" allLabel="Anyone" value={filters.actor} onValueChange={(v) => update({ actor: v })} options={facets?.actors ?? []} />
        <FilterSelect label="Action" allLabel="All actions" value={filters.action} onValueChange={(v) => update({ action: v })} options={(facets?.actions ?? []).map((a) => ({ value: a, label: auditLabel(a) }))} />
        <FilterSelect label="Entity" allLabel="All entities" value={filters.entity} onValueChange={(v) => update({ entity: v })} options={(facets?.entities ?? []).map((e) => ({ value: e, label: ENTITY_LABEL[e] ?? e }))} />
        <div className="col-span-2 flex items-center gap-2">
          <DateInput label="From" value={filters.from} max={filters.to || todayInput()} onChange={(v) => update({ from: v })} invalid={!!rangeError} />
          <span className="text-small text-ink-500" aria-hidden>
            –
          </span>
          <DateInput label="To" value={filters.to} min={filters.from || undefined} max={todayInput()} onChange={(v) => update({ to: v })} invalid={!!rangeError} />
        </div>
      </Toolbar>
      {rangeError && (
        <p className="-mt-2 mb-3 text-small text-danger-600" role="alert">
          {rangeError}
        </p>
      )}

      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <p className="text-small text-ink-500" aria-live="polite">
          {data ? (active ? `${data.items.length} of ${data.total ?? data.items.length} entries` : `${data.items.length} entries`) : ' '}
        </p>
        {active > 0 && (
          <Button variant="link" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      <FetchingBar active={isFetching && !isPending} />

      {error ? (
        <ErrorState title="Couldn’t load the audit log" message={errorText(error)} onRetry={refetch} />
      ) : (
        <DataTable
          label="Audit log"
          columns={COLUMNS}
          rows={data?.items}
          rowKey={(a) => String(a.id)}
          onRowClick={setSelected}
          rowLabel={(a) => `${auditLabel(a.action)} by ${a.actor_name}, ${formatDateTime(a.created_at)}`}
          card={(a) => <AuditCard a={a} />}
          selectedKey={selected ? String(selected.id) : null}
          loading={isPending}
          dim={isPlaceholderData}
          pageSize={25}
          resetKey={JSON.stringify(filters)}
          empty={
            active ? (
              <EmptyState icon={SearchX} title="No entries match" action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}>
                Try a wider date range or fewer filters.
              </EmptyState>
            ) : (
              <EmptyState icon={ScrollText} title="Nothing logged yet">
                Role changes, moderation decisions and settings changes will be recorded here.
              </EmptyState>
            )
          }
        />
      )}

      <AuditDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function DateInput({ label, value, onChange, min, max, invalid }) {
  return (
    <label className="flex min-w-0 flex-1 items-center sm:flex-none">
      <span className="sr-only">{label}</span>
      <Input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} invalid={invalid} className="min-w-0 sm:w-[150px]" aria-label={`${label} date`} />
    </label>
  )
}

const ENTITY_LINK = {
  user: (id) => `/admin/users?user=${id}`,
  company: (id) => `/admin/companies?company=${id}`,
  experience: (id) => `/experiences/${id}`,
}

function renderValue(v) {
  if (v == null) return <span className="text-ink-500">empty</span>
  if (typeof v === 'object') return <span className="font-mono text-small">{JSON.stringify(v)}</span>
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  return String(v)
}

function changeRows(m) {
  if (m.changes) return Object.entries(m.changes).map(([k, c]) => ({ key: k, before: c.before, after: c.after }))
  if (m.before !== undefined && m.after !== undefined) {
    if (m.before && m.after && typeof m.before === 'object' && typeof m.after === 'object') {
      return [...new Set([...Object.keys(m.before), ...Object.keys(m.after)])].map((k) => ({ key: k, before: m.before[k], after: m.after[k] }))
    }
    return [{ key: 'value', before: m.before, after: m.after }]
  }
  return []
}

function AuditDrawer({ entry, onClose }) {
  const last = useRef(entry)
  if (entry) last.current = entry
  const a = last.current
  if (!a) return null
  const rows = changeRows(a.metadata ?? {})
  const link = ENTITY_LINK[a.entity]?.(a.entity_id)
  return (
    <Dialog side="right" open={!!entry} onOpenChange={(o) => !o && onClose()} title={auditLabel(a.action)} description={formatDateTime(a.created_at)}>
      <div className="space-y-6 pb-2 pt-2">
        <DetailList
          items={[
            { label: 'Actor', value: <ActorCell a={a} /> },
            { label: 'Entry', value: `#${a.id}`, mono: true },
            { label: 'Action', value: a.action, mono: true },
            {
              label: 'Entity',
              value: link ? (
                <Link to={link} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                  {ENTITY_LABEL[a.entity] ?? a.entity} <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              ) : (
                ENTITY_LABEL[a.entity] ?? a.entity
              ),
            },
            { label: 'Entity ID', value: a.entity_id, mono: true, wide: true },
          ]}
        />

        {rows.length > 0 && (
          <DrawerSection title="Changes">
            <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
              {rows.map((r) => (
                <li key={r.key} className="px-3.5 py-3">
                  <p className="font-mono text-caption text-ink-500">{r.key}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body">
                    <span className="text-ink-500 line-through decoration-ink-300">{renderValue(r.before)}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-ink-500" aria-label="changed to" />
                    <span className="font-medium text-ink-900">{renderValue(r.after)}</span>
                  </p>
                </li>
              ))}
            </ul>
          </DrawerSection>
        )}

        <DrawerSection title="Metadata">
          {a.metadata && Object.keys(a.metadata).length ? (
            <pre className="overflow-x-auto rounded-lg border border-ink-200 bg-ink-50 p-3.5 font-mono text-small leading-5 text-ink-800">{JSON.stringify(a.metadata, null, 2)}</pre>
          ) : (
            <p className="text-small text-ink-500">No extra details recorded.</p>
          )}
        </DrawerSection>

        <Callout tone="info" icon={Lock}>
          Audit entries can’t be edited or deleted.
        </Callout>
      </div>
    </Dialog>
  )
}
