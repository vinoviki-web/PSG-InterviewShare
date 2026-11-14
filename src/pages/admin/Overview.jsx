import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap, UserPlus, FileText, FilePlus2, Flag, Timer, ChevronRight, ArrowUpRight, Building2, Ban, Inbox } from 'lucide-react'
import { Card, CompanyLogo, ErrorState, Skeleton, FetchingBar } from '@/components/ui'
import { getAdminOverview } from '@/api/admin'
import { pluralize, cn } from '@/lib/utils'
import { PageHeader, errorText } from '@/components/admin/AdminUi'
import { formatDayMonth, formatDuration } from '@/components/admin/format'

const nf = new Intl.NumberFormat('en-IN')

function delta(now, prev) {
  if (!prev && !now) return 'Same as the week before'
  const d = now - prev
  if (d === 0) return 'Same as the week before'
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} vs the week before`
}

function Kpi({ icon: Icon, label, value, sub, to }) {
  const body = (
    <>
      <p className="flex items-start gap-1.5 text-small text-ink-600">
        <Icon className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
        <span className="min-w-0">{label}</span>
        {to && <ChevronRight className="ml-auto mt-0.5 size-4 shrink-0 text-ink-300 transition-colors group-hover:text-ink-600" aria-hidden />}
      </p>
      <p className="mt-2 text-h1 tabular text-ink-900">{value}</p>
      <p className="mt-0.5 text-small text-ink-500">{sub}</p>
    </>
  )
  const cls = 'block rounded-lg border border-ink-200 bg-white p-4 shadow-xs sm:p-5'
  return to ? (
    <Link to={to} className={cn(cls, 'group transition-[border-color,box-shadow] duration-[120ms] hover:border-ink-300 hover:shadow-sm')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** CSS bar chart (spec §9.14: no chart library in MVP). */
function WeeklyBars({ title, unit, data }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((n, d) => n + d.value, 0)
  const summary = `${title}: ${data.map((d) => `week of ${formatDayMonth(d.start)} ${d.value}`).join(', ')}`
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-body font-medium text-ink-800">{title}</h2>
        <span className="text-small text-ink-500">Last 8 weeks</span>
      </div>
      <p className="mt-1 text-h2 tabular text-ink-900">
        {nf.format(total)} <span className="text-body font-normal text-ink-500">{unit}</span>
      </p>
      <div className="relative mt-4" role="img" aria-label={summary}>
        <div className="flex h-36 items-end gap-1.5 border-b border-ink-200 pt-5 sm:gap-2.5">
          {data.map((d) => (
            <div key={d.start} className="flex h-full flex-1 items-end justify-center">
              <div
                className={cn('relative w-full max-w-10 rounded-t-[4px] transition-[height] duration-[260ms] ease-out-soft', d.value ? (d.current ? 'bg-teal-200' : 'bg-teal-600') : 'bg-ink-200')}
                style={{ height: d.value ? `${Math.max(4, (d.value / max) * 100)}%` : 2 }}
              >
                <span className={cn('absolute inset-x-0 -top-5 text-center text-caption tabular', d.value ? 'text-ink-700' : 'text-ink-500')}>{d.value}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 sm:gap-2.5" aria-hidden>
          {data.map((d, i) => {
            const [day, month] = formatDayMonth(d.start).split(' ')
            const showMonth = i === 0 || month !== formatDayMonth(data[i - 1].start).split(' ')[1]
            return (
              <span key={d.start} className={cn('flex flex-1 flex-col items-center text-[11px] leading-4 tabular', d.current ? 'font-medium text-ink-800' : 'text-ink-500')}>
                <span>{d.current ? 'Now' : day}</span>
                <span className="text-ink-500">{!d.current && showMonth ? month : ' '}</span>
              </span>
            )
          })}
        </div>
        {total === 0 && (
          <p className="absolute inset-x-0 top-10 text-center text-small text-ink-500">Nothing in the last 8 weeks</p>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-500">
        <span className="inline-block size-2 rounded-[2px] bg-teal-200" aria-hidden /> This week so far
      </p>
    </Card>
  )
}

function TopCompanies({ items }) {
  const max = Math.max(1, ...items.map((c) => c.count))
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-body font-medium text-ink-800">Top companies</h2>
        <span className="text-small text-ink-500">Published, last 30 days</span>
      </div>
      {items.length ? (
        <ol className="mt-4 space-y-3">
          {items.map((c) => (
            <li key={c.slug} className="flex items-center gap-3">
              <CompanyLogo name={c.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link to={`/companies/${c.slug}`} className="truncate text-body font-medium text-ink-900 hover:text-teal-700 hover:underline">
                    {c.name}
                  </Link>
                  <span className="tabular shrink-0 text-small text-ink-600">{c.count}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 pb-4 text-center text-small text-ink-500">No experiences were published in the last 30 days.</p>
      )}
    </Card>
  )
}

function Attention({ a }) {
  const rows = [
    { icon: ArrowUpRight, label: 'Escalated reports', n: a.escalated, to: '/admin/reports' },
    { icon: Inbox, label: 'Items in the moderation queue', n: a.open, to: '/mod' },
    { icon: Building2, label: 'Unverified companies', n: a.unverified_companies, to: '/admin/companies?status=unverified' },
    { icon: Ban, label: 'Suspended accounts', n: a.suspended_users, to: '/admin/users?status=suspended' },
  ]
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-body font-medium text-ink-800">Needs attention</h2>
      <ul className="-mx-2 mt-3">
        {rows.map((r) => (
          <li key={r.label}>
            <Link to={r.to} className="group flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-ink-50">
              <r.icon className="size-4 shrink-0 text-ink-500" aria-hidden />
              <span className="flex-1 text-body text-ink-700">{r.label}</span>
              <span className={cn('tabular text-body font-medium', r.n ? 'text-ink-900' : 'text-ink-500')}>{r.n}</span>
              <ChevronRight className="size-4 text-ink-300 group-hover:text-ink-600" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading overview">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-ink-200 bg-white p-4 shadow-xs sm:p-5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[270px] rounded-lg" />
        <Skeleton className="h-[270px] rounded-lg" />
      </div>
    </div>
  )
}

export default function Overview() {
  const { data, isPending, isFetching, error, refetch } = useQuery({ queryKey: ['admin', 'overview'], queryFn: getAdminOverview })

  return (
    <>
      <PageHeader title="Overview" description="How Roundwise is doing. Every number is counted from live data." />
      <FetchingBar active={isFetching && !isPending} />
      {isPending ? (
        <OverviewSkeleton />
      ) : error ? (
        <ErrorState title="Couldn’t load the overview" message={errorText(error)} onRetry={refetch} />
      ) : (
        <div className="space-y-6">
          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi icon={GraduationCap} label="Verified students" value={nf.format(data.kpis.students)} sub="Signed in and onboarded" to="/admin/users" />
            <Kpi icon={UserPlus} label="New students (7d)" value={nf.format(data.kpis.students_new_7d)} sub={delta(data.kpis.students_new_7d, data.kpis.students_new_prev_7d)} />
            <Kpi icon={FileText} label="Published experiences" value={nf.format(data.kpis.published)} sub="Visible to students now" />
            <Kpi icon={FilePlus2} label="Published (7d)" value={nf.format(data.kpis.published_new_7d)} sub={delta(data.kpis.published_new_7d, data.kpis.published_new_prev_7d)} />
            <Kpi
              icon={Flag}
              label="Open reports"
              value={nf.format(data.kpis.open_reports)}
              sub={data.kpis.open_items ? `On ${pluralize(data.kpis.open_items, 'item')}${data.kpis.escalated_items ? ` · ${data.kpis.escalated_items} escalated` : ''}` : 'Queue is clear'}
              to="/admin/reports"
            />
            <Kpi
              icon={Timer}
              label="Median resolution"
              value={formatDuration(data.kpis.median_resolution_ms)}
              sub={data.kpis.resolved_90d ? `From ${pluralize(data.kpis.resolved_90d, 'resolved report')} (90d)` : 'No reports resolved in 90 days'}
            />
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <WeeklyBars title="Sign-ups" unit="new accounts" data={data.signups} />
            <WeeklyBars title="Experiences published" unit="published" data={data.publishes} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TopCompanies items={data.top_companies} />
            <Attention a={data.attention} />
          </div>
        </div>
      )}
    </>
  )
}
