import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Search, Building2 } from 'lucide-react'
import { listCompanies, listIndustries } from '@/api/companies'
import { Chip, EmptyState, ErrorState, Input, Select, Card, FetchingBar } from '@/components/ui'
import { CompanyCard, CompanyCardSkeleton } from '@/components/company/CompanyCard'
import { useDebounced } from '@/hooks/useDebounced'
import { pluralize } from '@/lib/utils'

const SORT = [
  { value: 'experiences', label: 'Most experiences' },
  { value: 'recent', label: 'Recently active' },
  { value: 'az', label: 'A–Z' },
]

export default function Companies() {
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const dq = useDebounced(q, 200)
  const industry = sp.get('industry') ?? ''
  const sort = sp.get('sort') ?? 'experiences'
  const set = (k, v) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); return n }, { replace: true })

  const query = useQuery({ queryKey: ['companies', 'list', dq, industry, sort], queryFn: () => listCompanies({ q: dq, industry, sort }), placeholderData: keepPreviousData })
  const { data: industries = [] } = useQuery({ queryKey: ['companies', 'industries'], queryFn: listIndustries, staleTime: 300_000 })

  return (
    <div className="container-page py-8 md:py-10">
      <h1 className="text-h1">Companies</h1>
      <p className="mt-1 text-body text-ink-600">Every company PSG students have written about, with the patterns across their interviews.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies (try “TCS”)" prefix={<Search />} aria-label="Search companies" type="search" className="flex-1 bg-white" />
        <Select value={sort} onValueChange={(v) => set('sort', v)} options={SORT} aria-label="Sort companies" className="sm:w-[200px]" />
      </div>
      <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by industry">
        <Chip selected={!industry} onClick={() => set('industry', '')}>All</Chip>
        {industries.map((i) => (
          <Chip key={i} selected={industry === i} onClick={() => set('industry', industry === i ? '' : i)}>{i}</Chip>
        ))}
      </div>

      <FetchingBar active={query.isFetching && !query.isPending} />
      <p className="mb-3 mt-5 text-body font-medium text-ink-800" aria-live="polite">
        {query.isPending ? 'Loading…' : pluralize(query.data?.length ?? 0, 'company', 'companies')}
      </p>
      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <CompanyCardSkeleton key={i} />)}</div>
      ) : query.isError ? (
        <ErrorState title="Couldn’t load companies" onRetry={() => query.refetch()} error={query.error} />
      ) : query.data.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title={dq || industry ? 'No companies match' : 'No companies yet'}>
            {dq || industry ? 'Try a different spelling or clear the industry filter. Companies appear here once someone shares an experience.' : 'Companies appear here once someone shares an experience.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {query.data.map((c) => <CompanyCard key={c.slug} company={c} />)}
        </div>
      )}
    </div>
  )
}
