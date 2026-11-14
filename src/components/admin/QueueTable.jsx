import { timeAgo, pluralize } from '@/lib/utils'
import { DataTable } from './DataTable'
import { StateBadge, TypeIcon } from './AdminUi'
import { formatDateTime } from './format'

const OWN_TAG = <span className="ml-1.5 inline-flex h-5 items-center rounded-sm bg-warning-50 px-1.5 align-middle text-caption font-medium text-warning-600">Yours</span>

function ContentCell({ row }) {
  return (
    <span className="flex min-w-0 items-start gap-3">
      <TypeIcon type={row.target_type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink-900">
          {row.preview.title}
          {row.is_own && OWN_TAG}
        </span>
        <span className="mt-0.5 block truncate text-small text-ink-500">{row.preview.excerpt || ' '}</span>
      </span>
    </span>
  )
}

const When = ({ iso }) =>
  iso ? (
    <time dateTime={iso} title={formatDateTime(iso)} className="text-ink-600">
      {timeAgo(iso)}
    </time>
  ) : (
    <span className="text-ink-500">—</span>
  )

function ReasonCell({ row }) {
  if (!row.top_reason_label) return <span className="text-ink-500">—</span>
  const more = row.reasons.length - 1
  return (
    <span className="block truncate text-ink-700">
      {row.top_reason_label}
      {more > 0 && <span className="text-ink-500"> +{more}</span>}
    </span>
  )
}

function ReportersCell({ row }) {
  const r = row.reporters ?? []
  if (!r.length) return <span className="text-ink-500">—</span>
  return (
    <span className="block truncate text-ink-700" title={r.map((u) => u.full_name).join(', ')}>
      {r[0].full_name}
      {r.length > 1 && <span className="text-ink-500"> +{r.length - 1}</span>}
    </span>
  )
}

const contentCol = { id: 'content', header: 'Content', cell: (r) => <ContentCell row={r} />, sort: (r) => r.preview.title.toLowerCase() }
const countCol = { id: 'count', header: 'Reports', align: 'right', className: 'w-24', cell: (r) => <span className="tabular text-ink-900">{r.report_count}</span>, sort: (r) => r.report_count, defaultDir: 'desc' }
const statusCol = { id: 'status', header: 'Status', className: 'w-36', cell: (r) => <StateBadge state={r.state} /> }

const COLUMNS = {
  open: [
    contentCol,
    { id: 'reason', header: 'Top reason', className: 'hidden w-[22%] lg:table-cell', cell: (r) => <ReasonCell row={r} />, sort: (r) => r.top_reason_label },
    countCol,
    { id: 'first', header: 'First reported', className: 'w-36', cell: (r) => <When iso={r.first_reported_at} />, sort: (r) => r.first_reported_at },
    statusCol,
  ],
  hidden: [
    contentCol,
    { id: 'why', header: 'Hidden because', className: 'hidden w-[26%] lg:table-cell', cell: (r) => <span className="block truncate text-ink-700">{r.hidden_reason ?? '—'}</span> },
    countCol,
    { id: 'hidden_at', header: 'Hidden', className: 'w-32', cell: (r) => <When iso={r.hidden_at} />, sort: (r) => r.hidden_at, defaultDir: 'desc' },
    statusCol,
  ],
  resolved: [
    contentCol,
    { id: 'reason', header: 'Top reason', className: 'hidden w-[20%] lg:table-cell', cell: (r) => <ReasonCell row={r} />, sort: (r) => r.top_reason_label },
    countCol,
    {
      id: 'resolved',
      header: 'Resolved',
      className: 'w-40',
      cell: (r) => (
        <span className="block truncate">
          <When iso={r.resolved_at} />
          {r.resolved_by && <span className="text-ink-500"> · {r.resolved_by.split(' ')[0]}</span>}
        </span>
      ),
      sort: (r) => r.resolved_at,
      defaultDir: 'desc',
    },
    { ...statusCol, header: 'Outcome' },
  ],
  admin: [
    contentCol,
    { id: 'reporters', header: 'Reported by', className: 'hidden w-[18%] xl:table-cell', cell: (r) => <ReportersCell row={r} />, sort: (r) => r.reporters?.[0]?.full_name },
    countCol,
    { id: 'last', header: 'Last reported', className: 'w-32', cell: (r) => <When iso={r.last_reported_at} />, sort: (r) => r.last_reported_at, defaultDir: 'desc' },
    statusCol,
  ],
}

function MobileCard({ row, variant }) {
  const when =
    variant === 'hidden' ? row.hidden_at : variant === 'resolved' ? row.resolved_at : variant === 'admin' ? row.last_reported_at : row.first_reported_at
  const meta = [
    variant === 'hidden' ? null : row.top_reason_label,
    row.report_count ? pluralize(row.report_count, 'report') : 'No reports',
    when && timeAgo(when),
  ].filter(Boolean)
  return (
    <span className="flex items-start gap-3">
      <TypeIcon type={row.target_type} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-medium text-ink-900">
          {row.preview.title}
          {row.is_own && OWN_TAG}
        </span>
        <span className="mt-0.5 block truncate text-small text-ink-500">{variant === 'hidden' ? row.hidden_reason : row.preview.excerpt}</span>
        <span className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-small text-ink-600">
          <StateBadge state={row.state} />
          <span>{meta.join(' · ')}</span>
        </span>
        {variant === 'admin' && row.reporters?.length > 0 && (
          <span className="mt-1.5 block truncate text-small text-ink-500">Reported by {row.reporters.map((u) => u.full_name).join(', ')}</span>
        )}
      </span>
    </span>
  )
}

/** variant: open | hidden | resolved | admin */
export function QueueTable({ variant, items, loading, selectedKey, onOpen, empty, dim, resetKey, label }) {
  return (
    <DataTable
      label={label}
      columns={COLUMNS[variant]}
      rows={items}
      rowKey={(r) => r.key}
      onRowClick={(r) => onOpen(r.key)}
      rowLabel={(r) => `Review ${r.target_type}: ${r.preview.title}`}
      card={(r) => <MobileCard row={r} variant={variant} />}
      selectedKey={selectedKey}
      loading={loading}
      empty={empty}
      dim={dim}
      resetKey={resetKey}
    />
  )
}
