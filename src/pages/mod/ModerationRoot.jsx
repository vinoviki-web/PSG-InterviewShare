import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, EyeOff, CheckCheck, Info, Gauge } from 'lucide-react'
import { Button, EmptyState, ErrorState, FetchingBar, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui'
import { listModerationQueue } from '@/api/moderation'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, errorText } from '@/components/admin/AdminUi'
import { QueueTable } from '@/components/admin/QueueTable'
import { ModerationDrawer } from '@/components/admin/ModerationDrawer'

const TABS = [
  { value: 'open', label: 'Open reports' },
  { value: 'hidden', label: 'Hidden content' },
  { value: 'resolved', label: 'Resolved' },
]

const EMPTY = {
  open: {
    icon: ShieldCheck,
    title: 'The queue is clear',
    body: 'No open reports right now. New reports appear here, and anything reported by 3 people is hidden until someone reviews it.',
  },
  hidden: { icon: EyeOff, title: 'Nothing is hidden', body: 'Experiences and comments hidden by reports or by moderators appear here, so you can restore them.' },
  resolved: { icon: CheckCheck, title: 'No resolved reports yet', body: 'Reports you dismiss or act on move here, with who resolved them and when.' },
}

function QueuePanel({ tab, query, selectedKey, onOpen }) {
  const { data, isPending, isFetching, error, refetch } = query
  if (error) return <ErrorState title="Couldn’t load the queue" message={errorText(error)} onRetry={refetch} />
  const e = EMPTY[tab]
  return (
    <>
      <FetchingBar active={isFetching && !isPending} />
      <QueueTable
        variant={tab}
        label={TABS.find((t) => t.value === tab).label}
        items={data?.items}
        loading={isPending}
        dim={isFetching && !isPending}
        selectedKey={selectedKey}
        onOpen={onOpen}
        resetKey={tab}
        empty={
          <EmptyState icon={e.icon} title={e.title}>
            {e.body}
          </EmptyState>
        }
      />
    </>
  )
}

export default function ModerationRoot() {
  const [params, setParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'open'
  const itemKey = params.get('item')

  const query = useQuery({ queryKey: ['mod', 'queue', tab], queryFn: () => listModerationQueue(tab) })
  /* Keep tab counts steady while another tab loads. */
  const lastCounts = useRef(null)
  if (query.data?.counts) lastCounts.current = query.data.counts
  const counts = lastCounts.current

  useEffect(() => {
    document.title = 'Moderation · Roundwise'
  }, [])

  const update = (patch) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v)))
        return next
      },
      { replace: true },
    )

  return (
    <div className="container-page py-6 md:py-8">
      <PageHeader
        title="Moderation"
        description="Review what students reported. Every decision is logged, and authors are told when their content is hidden."
        actions={
          isAdmin && (
            <Button variant="secondary" asChild>
              <Link to="/admin/reports">
                <Gauge aria-hidden /> Admin reports
              </Link>
            </Button>
          )
        }
      />

      <p className="mb-4 flex items-start gap-2 text-small text-ink-500">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Content reported by 3 different students is hidden automatically until reviewed. Dismiss restores it; hide keeps it down and tells the author why.
        </span>
      </p>

      <Tabs value={tab} onValueChange={(v) => update({ tab: v === 'open' ? null : v, item: null })}>
        <TabsList className="mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} count={t.value !== 'resolved' && counts ? counts[t.value] : undefined}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="outline-none">
            {t.value === tab && <QueuePanel tab={tab} query={query} selectedKey={itemKey} onOpen={(key) => update({ item: key })} />}
          </TabsContent>
        ))}
      </Tabs>

      <ModerationDrawer itemKey={itemKey} onClose={() => update({ item: null })} />
    </div>
  )
}
