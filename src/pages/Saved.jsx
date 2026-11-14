import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Search, CircleSlash, X } from 'lucide-react'
import { getSaved, toggleBookmark } from '@/api/experiences'
import { Button, Card, EmptyState, ErrorState, Input, Select } from '@/components/ui'
import { ExperienceRow, ExperienceRowSkeleton } from '@/components/experience/ExperienceRow'
import { formatDate, pluralize } from '@/lib/utils'

export default function Saved() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['experiences', 'saved'], queryFn: getSaved })
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('saved')
  const remove = useMutation({ mutationFn: (id) => toggleBookmark(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['experiences', 'saved'] }) })

  const items = useMemo(() => {
    let list = q.data ?? []
    const f = filter.trim().toLowerCase()
    if (f) list = list.filter((e) => e.unavailable || `${e.company.name} ${e.role_title} ${e.topics.map((t) => t.label).join(' ')}`.toLowerCase().includes(f))
    if (sort === 'company') list = [...list].sort((a, b) => (a.company?.name ?? '').localeCompare(b.company?.name ?? ''))
    return list
  }, [q.data, filter, sort])

  return (
    <div className="container-page py-8 md:py-10">
      <div className="max-w-[860px]">
        <h1 className="text-h1">Saved</h1>
        <p className="mt-1 text-body text-ink-600">Your revision list. Only you can see it.</p>

        {q.data?.length > 0 && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search saved" prefix={<Search />} className="flex-1 bg-white" aria-label="Search saved experiences" type="search" />
            <Select value={sort} onValueChange={setSort} className="sm:w-[180px]" aria-label="Sort saved" options={[{ value: 'saved', label: 'Recently saved' }, { value: 'company', label: 'Company A–Z' }]} />
          </div>
        )}

        <div className="mt-6">
          {q.isPending ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <ExperienceRowSkeleton key={i} />)}</div>
          ) : q.isError ? (
            <ErrorState title="Couldn’t load your saved list" onRetry={() => q.refetch()} error={q.error} />
          ) : !q.data.length ? (
            <Card>
              <EmptyState icon={Bookmark} title="Nothing saved yet" action={<Button asChild><Link to="/experiences">Explore experiences</Link></Button>}>
                Tap the bookmark on any experience to keep it here for revision.
              </EmptyState>
            </Card>
          ) : (
            <>
              <p className="mb-3 text-small text-ink-500" aria-live="polite">{pluralize(items.length, 'experience')}</p>
              <ul className="space-y-3">
                {items.map((e) =>
                  e.unavailable ? (
                    <li key={e.id} className="flex items-center gap-3 rounded-lg border border-dashed border-ink-300 bg-ink-25 p-4">
                      <CircleSlash className="size-5 shrink-0 text-ink-500" aria-hidden />
                      <div className="flex-1">
                        <p className="text-body font-medium text-ink-700">No longer available</p>
                        <p className="text-small text-ink-500">This experience was hidden or removed after you saved it on {formatDate(e.saved_at)}.</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(e.id)}><X /> Remove</Button>
                    </li>
                  ) : (
                    <li key={e.id}><ExperienceRow exp={e} /></li>
                  ),
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
