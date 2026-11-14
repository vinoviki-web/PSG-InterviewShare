import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, SearchX, Flag, Inbox, CheckCheck } from 'lucide-react'
import { Button, Chip, EmptyState, ErrorState, FetchingBar } from '@/components/ui'
import { listAllReports } from '@/api/admin'
import { useDebounced } from '@/hooks/useDebounced'
import { PageHeader, Toolbar, SearchInput, errorText } from '@/components/admin/AdminUi'
import { QueueTable } from '@/components/admin/QueueTable'
import { ModerationDrawer } from '@/components/admin/ModerationDrawer'

const FILTERS = [
  { value: 'escalated', label: 'Escalated' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

const EMPTY = {
  escalated: { icon: ArrowUpRight, title: 'Nothing escalated', body: 'When a moderator needs an admin decision, the item lands here first.' },
  open: { icon: Inbox, title: 'No open reports', body: 'The moderation queue is clear.' },
  resolved: { icon: CheckCheck, title: 'No resolved reports yet', body: 'Reports appear here once a moderator or admin acts on them.' },
  all: { icon: Flag, title: 'No reports yet', body: 'Reports from students will appear here with who sent them.' },
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const status = FILTERS.some((f) => f.value === params.get('status')) ? params.get('status') : 'escalated'
  const [q, setQ] = useState(params.get('q') ?? '')
  const dq = useDebounced(q.trim(), 250)
  const itemKey = params.get('item')

  const update = (patch) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        Object.entries(patch).forEach(([k, v]) => (v == null || v === '' ? next.delete(k) : next.set(k, v)))
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    if ((params.get('q') ?? '') !== dq) update({ q: dq })
  }, [dq])

  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['admin', 'reports', status, dq],
    queryFn: () => listAllReports({ status, q: dq }),
    placeholderData: (prev) => prev,
  })
  const counts = data?.counts
  const e = EMPTY[status]

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every report, including escalations, with who sent it. Admins can remove content and suspend authors from here."
      />
      <Toolbar search={<SearchInput value={q} onChange={setQ} placeholder="Search content or reporter" label="Search reports" />}>
        <div className="col-span-2 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Chip key={f.value} selected={status === f.value} onClick={() => update({ status: f.value === 'escalated' ? null : f.value, item: null })} count={counts?.[f.value]}>
              {f.label}
            </Chip>
          ))}
        </div>
      </Toolbar>
      <FetchingBar active={isFetching && !isPending} />

      {error ? (
        <ErrorState title="Couldn’t load reports" message={errorText(error)} onRetry={refetch} />
      ) : (
        <QueueTable
          variant="admin"
          label="Reports"
          items={data?.items}
          loading={isPending}
          dim={isPlaceholderData}
          selectedKey={itemKey}
          onOpen={(key) => update({ item: key })}
          resetKey={`${status}|${dq}`}
          empty={
            dq ? (
              <EmptyState icon={SearchX} title="No reports match" action={<Button variant="secondary" onClick={() => setQ('')}>Clear search</Button>}>
                Try a company name or the reporter’s name.
              </EmptyState>
            ) : (
              <EmptyState icon={e.icon} title={e.title}>
                {e.body}
              </EmptyState>
            )
          }
        />
      )}

      <ModerationDrawer itemKey={itemKey} onClose={() => update({ item: null })} />
    </>
  )
}
