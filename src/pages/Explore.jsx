import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router'
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query'
import { Search, SlidersHorizontal, X, SearchX, Plus } from 'lucide-react'
import { searchExperiences, getFacets } from '@/api/experiences'
import { listAllCompanies } from '@/api/companies'
import { Button, Chip, Dialog, EmptyState, ErrorState, FetchingBar, Input, Segmented, Select, Card } from '@/components/ui'
import { ExperienceRow, ExperienceRowSkeleton } from '@/components/experience/ExperienceRow'
import { FilterPanel, FILTER_KEYS, readFilters, countActive, chipLabel, DomainBar } from '@/components/explore/Filters'
import { useDebounced } from '@/hooks/useDebounced'
import { useIsLarge } from '@/hooks/useMediaQuery'
import { SORTS } from '@/lib/constants'
import { cn, pluralize } from '@/lib/utils'

const PAGE = 20

export default function Explore() {
  const [sp, setSp] = useSearchParams()
  const isLarge = useIsLarge()
  const filters = useMemo(() => readFilters(sp), [sp])
  const sort = sp.get('sort') ?? 'latest'
  const urlQ = sp.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const dq = useDebounced(q.trim(), 300)
  const [sheetOpen, setSheetOpen] = useState(false)
  const firstNewRef = useRef(null)
  const prevCount = useRef(0)

  /* Keep the search box and URL in sync (URL is the source of truth). */
  useEffect(() => setQ(urlQ), [urlQ])
  useEffect(() => {
    if ((dq.length >= 2 ? dq : '') === urlQ) return
    setSp((p) => {
      const n = new URLSearchParams(p)
      if (dq.length >= 2) n.set('q', dq)
      else n.delete('q')
      return n
    }, { replace: true })
  }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps

  const params = useMemo(() => {
    const p = { sort, q: urlQ }
    FILTER_KEYS.forEach((k) => filters[k].length && (p[k] = filters[k]))
    return p
  }, [filters, sort, urlQ])

  const query = useInfiniteQuery({
    queryKey: ['experiences', 'search', params],
    queryFn: ({ pageParam }) => searchExperiences({ ...params, cursor: pageParam, limit: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  })
  const { data: companies = [] } = useQuery({ queryKey: ['companies', 'all'], queryFn: listAllCompanies, staleTime: 60_000 })
  const { data: facets } = useQuery({ queryKey: ['experiences', 'facets'], queryFn: getFacets, staleTime: 60_000 })

  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const total = query.data?.pages[0]?.total ?? 0
  const active = countActive(filters)

  /* Move focus to the first newly loaded row (keyboard users). */
  useEffect(() => {
    if (items.length > prevCount.current && prevCount.current > 0) firstNewRef.current?.querySelector('a')?.focus()
    prevCount.current = items.length
  }, [items.length])

  const toggle = (key, value) =>
    setSp((p) => {
      const n = new URLSearchParams(p)
      const cur = n.get(key)?.split(',').filter(Boolean) ?? []
      const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]
      if (next.length) n.set(key, next.join(','))
      else n.delete(key)
      return n
    }, { replace: true })

  const clearAll = () =>
    setSp((p) => {
      const n = new URLSearchParams()
      if (p.get('sort')) n.set('sort', p.get('sort'))
      return n
    }, { replace: true })

  const setSort = (v) => setSp((p) => { const n = new URLSearchParams(p); n.set('sort', v); return n }, { replace: true })

  const panel = <FilterPanel filters={filters} onToggle={toggle} companies={companies} facets={facets} />
  const isRefetching = query.isFetching && !query.isFetchingNextPage && !query.isPending

  return (
    <div className="container-page py-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">Explore experiences</h1>
          <p className="mt-1 text-body text-ink-600">Every branch, every domain: search companies, roles, topics and the questions students were asked.</p>
        </div>
      </div>

      <div className="sticky top-16 z-10 -mx-4 mt-6 border-b border-ink-200 bg-ink-50/95 px-4 pb-3 pt-3 backdrop-blur-md sm:mx-0 sm:px-0 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              size="lg"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search company, role or topic"
              prefix={<Search />}
              aria-label="Search experiences"
              className="bg-white"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-700" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="hidden w-[180px] sm:block">
            <Select value={sort} onValueChange={setSort} options={SORTS} aria-label="Sort by" className="h-12" />
          </div>
          <Button variant="secondary" size="lg" className="relative px-3.5 lg:hidden" onClick={() => setSheetOpen(true)} aria-label={`Filters${active ? `, ${active} active` : ''}`}>
            <SlidersHorizontal />
            <span className="hidden sm:inline">Filters</span>
            {active > 0 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-teal-600 text-caption text-white tabular">{active}</span>}
          </Button>
        </div>
        <div className="mt-3">
          <DomainBar
            selected={filters.domain}
            onToggle={toggle}
            facets={facets?.domain}
            onClear={() => setSp((p) => { const n = new URLSearchParams(p); n.delete('domain'); return n }, { replace: true })}
          />
        </div>
        <div className="mt-2.5 sm:hidden">
          <Segmented size="sm" options={SORTS} value={sort} onValueChange={setSort} className="w-full [&>button]:flex-1" aria-label="Sort by" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[264px_minmax(0,1fr)]">
        {isLarge && (
          <aside aria-label="Filters" className="self-start lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-body font-semibold text-ink-900">Filters</h2>
                {active > 0 && <button onClick={clearAll} className="text-small font-medium text-teal-700 hover:underline">Clear all</button>}
              </div>
              {panel}
            </Card>
          </aside>
        )}

        <section aria-label="Results" className="min-w-0">
          <FetchingBar active={isRefetching} />
          <div className="mb-3 flex min-h-8 flex-wrap items-center gap-2">
            <p className="mr-1 text-body font-medium text-ink-800" aria-live="polite">
              {query.isPending ? 'Searching…' : `${pluralize(total, 'experience')}`}
            </p>
            {FILTER_KEYS.flatMap((k) => filters[k].map((v) => (
              <Chip key={`${k}-${v}`} onRemove={() => toggle(k, v)}>{chipLabel(k, v, companies)}</Chip>
            )))}
            {active > 1 && <button onClick={clearAll} className="text-small font-medium text-ink-600 hover:text-ink-900 hover:underline">Clear all</button>}
          </div>

          {query.isPending ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <ExperienceRowSkeleton key={i} />)}</div>
          ) : query.isError ? (
            <ErrorState title="Couldn’t load experiences" onRetry={() => query.refetch()} error={query.error} />
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={SearchX}
                title={active || urlQ ? 'No experiences match' : 'No experiences yet'}
                action={
                  active || urlQ ? (
                    <Button variant="secondary" onClick={() => { setQ(''); clearAll() }}>Clear search and filters</Button>
                  ) : (
                    <Button asChild><Link to="/share"><Plus /> Share the first one</Link></Button>
                  )
                }
              >
                {active || urlQ
                  ? `Try ${urlQ ? 'a shorter search' : ''}${urlQ && active ? ' or ' : ''}${active ? `removing “${chipLabel(FILTER_KEYS.find((k) => filters[k].length), filters[FILTER_KEYS.find((k) => filters[k].length)]?.[0], companies)}”` : ''}.`
                  : 'Interviewed recently? Your experience would help a lot of juniors.'}
              </EmptyState>
            </Card>
          ) : (
            <>
              <ul className={cn('space-y-3 transition-opacity duration-[180ms]', isRefetching && 'opacity-60')}>
                {items.map((e, i) => (
                  <li key={e.id} ref={i === prevCount.current ? firstNewRef : undefined} className={i >= PAGE ? 'animate-rise' : undefined}>
                    <ExperienceRow exp={e} />
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col items-center gap-2">
                {query.hasNextPage && (
                  <Button variant="secondary" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
                    Load {Math.min(PAGE, total - items.length)} more
                  </Button>
                )}
                <p className="text-small text-ink-500">Showing {items.length} of {total}</p>
              </div>
            </>
          )}
        </section>
      </div>

      {!isLarge && (
        <Dialog
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Filters"
          footer={
            <>
              <Button variant="ghost" onClick={clearAll} disabled={!active}>Clear all</Button>
              <Button onClick={() => setSheetOpen(false)}>Show {pluralize(total, 'result')}</Button>
            </>
          }
        >
          {panel}
        </Dialog>
      )}
    </div>
  )
}
