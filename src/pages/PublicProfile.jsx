import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Lock, FileText } from 'lucide-react'
import { getPublicProfile } from '@/api/profile'
import { Avatar, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { ExperienceRow } from '@/components/experience/ExperienceRow'
import { NotFoundPage } from '@/pages/SystemPages'
import { batchLabel, pluralize } from '@/lib/utils'

export default function PublicProfile() {
  const { handle } = useParams()
  const { data: p, isPending, isError, error, refetch } = useQuery({ queryKey: ['profile', handle], queryFn: () => getPublicProfile(handle) })

  if (isPending) return <div className="container-page py-10"><div className="flex gap-5"><Skeleton className="size-24 rounded-full" /><div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-40" /></div></div></div>
  if (isError) return error.code === 'not_found' ? <NotFoundPage title="Profile not found" message={error.message} /> : <div className="container-page py-10"><ErrorState onRetry={refetch} error={error} /></div>

  return (
    <div className="container-page py-8 md:py-10">
      <div className="max-w-[860px]">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={p.full_name} size={96} />
          <div>
            <h1 className="text-h1">{p.full_name}</h1>
            <p className="mt-1 text-body text-ink-600">{p.department?.name} · Batch {batchLabel(p.graduation_year)}</p>
            {!p.private && p.helpful_received > 0 && (
              <p className="mt-1 text-small text-ink-500">{pluralize(p.helpful_received, 'helpful vote')} received</p>
            )}
          </div>
        </header>
        {p.bio && <p className="mt-5 max-w-[600px] text-body text-ink-700">{p.bio}</p>}

        <div className="mt-10">
          {p.private ? (
            <Card><EmptyState icon={Lock} title="This profile is private">{p.full_name.split(' ')[0]} has chosen not to show their experiences on their profile.</EmptyState></Card>
          ) : (
            <>
              <h2 className="mb-3 text-h2">Experiences <span className="text-ink-500 tabular">{p.experiences.length}</span></h2>
              {p.experiences.length ? (
                <ul className="space-y-3">{p.experiences.map((e) => <li key={e.id}><ExperienceRow exp={e} /></li>)}</ul>
              ) : (
                <Card><EmptyState icon={FileText} title="No experiences shared under their name">{p.is_self ? 'Experiences you post anonymously never appear here.' : 'Some students share anonymously, so their posts don’t appear on profiles.'}</EmptyState></Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
