import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Pencil, FileText, Plus, PenLine, Bookmark, EyeOff, Trash2 } from 'lucide-react'
import { getMyExperiences, getSaved } from '@/api/experiences'
import { getMyStats } from '@/api/profile'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, Button, Card, EmptyState, ErrorState, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent, Badge, ProgressBar } from '@/components/ui'
import { ExperienceRow, ExperienceRowSkeleton } from '@/components/experience/ExperienceRow'
import { DEPARTMENT } from '@/mocks/lookups'
import { listMyDrafts } from '@/api/drafts'
import { batchLabel, compact, timeAgo } from '@/lib/utils'

async function myDrafts() {
  const list = await listMyDrafts()
  return list.map((d) => ({ id: d.id, company: d.company_name || 'Untitled draft', role_title: d.role_title, step: d.draft_step ?? 1, updated_at: d.updated_at }))
}

function Drafts({ userId }) {
  const q = useQuery({ queryKey: ['drafts', 'mine', userId], queryFn: myDrafts })
  if (q.isPending) return <Skeleton className="h-20 w-full" />
  if (!q.data.length)
    return <Card><EmptyState icon={FileText} title="No drafts" action={<Button asChild><Link to="/share"><Plus /> Start an experience</Link></Button>}>Drafts save automatically while you write.</EmptyState></Card>
  return (
    <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200 bg-white">
      {q.data.map((d) => (
        <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink-900">{d.company}{d.role_title ? ` · ${d.role_title}` : ''}</p>
            <div className="mt-1.5 flex items-center gap-3">
              <ProgressBar value={d.step} max={5} className="max-w-[120px]" label="Draft progress" />
              <span className="text-small text-ink-500">Step {d.step} of 5 · edited {timeAgo(d.updated_at)}</span>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm"><Link to={`/share/${d.id}`}><PenLine /> Continue</Link></Button>
        </li>
      ))}
    </ul>
  )
}

export default function Me() {
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') ?? 'published'
  const stats = useQuery({ queryKey: ['me', 'stats'], queryFn: getMyStats })
  const mine = useQuery({ queryKey: ['experiences', 'mine'], queryFn: getMyExperiences })
  const saved = useQuery({ queryKey: ['experiences', 'saved'], queryFn: getSaved })
  const dept = DEPARTMENT[user.department_id]

  return (
    <div className="container-page py-8 md:py-10">
      <div className="max-w-[860px]">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={user.full_name} src={user.avatar_url} size={96} />
          <div className="min-w-0 flex-1">
            <h1 className="text-h1">{user.full_name}</h1>
            <p className="mt-1 text-body text-ink-600">{dept?.name} · Batch {batchLabel(user.graduation_year)}</p>
            {user.bio && <p className="mt-3 max-w-[560px] text-body text-ink-700">{user.bio}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm"><Link to="/settings"><Pencil /> Edit profile</Link></Button>
              {user.handle && <Button asChild variant="ghost" size="sm"><Link to={`/u/${user.handle}`}>View public profile</Link></Button>}
            </div>
          </div>
        </header>

        <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200">
          {[['Experiences', stats.data?.published], ['Helpful received', stats.data?.helpful_received], ['Times read', stats.data && compact(stats.data.views)]].map(([k, v]) => (
            <div key={k} className="bg-white px-4 py-3.5">
              <dt className="text-caption text-ink-500">{k}</dt>
              <dd className="mt-0.5 text-h2 tabular text-ink-900">{stats.isPending ? <Skeleton className="h-7 w-10" /> : v ?? 0}</dd>
            </div>
          ))}
        </dl>

        <Tabs value={tab} onValueChange={(t) => setSp(t === 'published' ? {} : { tab: t }, { replace: true })} className="mt-8">
          <TabsList>
            <TabsTrigger value="published" count={mine.data?.length}>Published</TabsTrigger>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
            <TabsTrigger value="saved" count={saved.data?.length}>Saved</TabsTrigger>
          </TabsList>
          <TabsContent value="published" className="pt-6 outline-none">
            {mine.isPending ? (
              <div className="space-y-3">{[0, 1].map((i) => <ExperienceRowSkeleton key={i} />)}</div>
            ) : mine.isError ? (
              <ErrorState onRetry={() => mine.refetch()} error={mine.error} />
            ) : !mine.data.length ? (
              <Card><EmptyState icon={PenLine} title="You haven’t shared an experience yet" action={<Button asChild><Link to="/share"><Plus /> Share experience</Link></Button>}>Interviewed for an internship or a job? Juniors would love to read it.</EmptyState></Card>
            ) : (
              <ul className="space-y-3">
                {mine.data.map((e) => (
                  <li key={e.id} className="relative">
                    {(e.is_anonymous || e.status === 'hidden') && (
                      <div className="mb-1.5 flex gap-1.5">
                        {e.is_anonymous && <Badge tone="neutral"><EyeOff /> Posted anonymously</Badge>}
                        {e.status === 'hidden' && <Badge tone="warning">Hidden pending review</Badge>}
                      </div>
                    )}
                    <ExperienceRow exp={e} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="drafts" className="pt-6 outline-none"><Drafts userId={user.id} /></TabsContent>
          <TabsContent value="saved" className="pt-6 outline-none">
            {saved.isPending ? (
              <div className="space-y-3">{[0, 1].map((i) => <ExperienceRowSkeleton key={i} />)}</div>
            ) : !saved.data?.filter((s) => !s.unavailable).length ? (
              <Card><EmptyState icon={Bookmark} title="Nothing saved yet">Saved experiences appear here and on the Saved page.</EmptyState></Card>
            ) : (
              <ul className="space-y-3">{saved.data.filter((s) => !s.unavailable).map((e) => <li key={e.id}><ExperienceRow exp={e} /></li>)}</ul>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
