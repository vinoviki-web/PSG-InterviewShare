import { useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ExternalLink, Plus, ChevronRight, MessageCircleQuestion, FileText, ArrowRight } from 'lucide-react'
import { getCompany, getCompanyInsights, getCompanyQuestions } from '@/api/companies'
import { searchExperiences } from '@/api/experiences'
import { Button, Card, CompanyLogo, EmptyState, ErrorState, Segmented, Select, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent, Badge, Tag } from '@/components/ui'
import { ExperienceRow, ExperienceRowSkeleton } from '@/components/experience/ExperienceRow'
import { Markdown } from '@/components/Markdown'
import { CompanyInsights } from '@/components/company/Insights'
import { VerifiedTick } from '@/components/company/CompanyCard'
import { NotFoundPage } from '@/pages/SystemPages'
import { ROUND, QUESTION_KINDS, QKIND, SORTS } from '@/lib/constants'
import { batchLabel, pluralize } from '@/lib/utils'

function Overview({ slug, onTab }) {
  const q = useQuery({ queryKey: ['company', slug, 'insights'], queryFn: () => getCompanyInsights(slug) })
  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-56 w-full" /></div>
  if (q.isError) return <ErrorState title="Couldn’t load insights" onRetry={() => q.refetch()} error={q.error} />
  const d = q.data
  return (
    <div className="space-y-10">
      {d.sufficient ? (
        <CompanyInsights data={d} />
      ) : (
        <Card className="p-5">
          <p className="text-body-lg font-medium text-ink-900">Not enough experiences for insights yet: {d.n} so far.</p>
          <p className="mt-1 text-body text-ink-600">We show patterns once at least {d.threshold} students have shared, so a single interview isn’t presented as “typical”.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => onTab('experiences')}>Read the {pluralize(d.n, 'experience')}</Button>
        </Card>
      )}
      {d.sufficient && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-h2">Latest experiences</h2>
            <button onClick={() => onTab('experiences')} className="inline-flex items-center gap-1 text-body font-medium text-teal-700 hover:underline">See all {d.n} <ArrowRight className="size-4" /></button>
          </div>
          <div className="space-y-3">{d.latest.map((e) => <ExperienceRow key={e.id} exp={e} />)}</div>
        </section>
      )}
    </div>
  )
}

function ExperiencesTab({ slug }) {
  const [sort, setSort] = useState('latest')
  const q = useInfiniteQuery({
    queryKey: ['experiences', 'company', slug, sort],
    queryFn: ({ pageParam }) => searchExperiences({ company: [slug], sort, cursor: pageParam, limit: 10 }),
    initialPageParam: 0,
    getNextPageParam: (l) => l.nextCursor,
  })
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body font-medium text-ink-800">{q.isPending ? 'Loading…' : pluralize(q.data.pages[0].total, 'experience')}</p>
        <Select value={sort} onValueChange={setSort} options={SORTS} size="sm" className="w-[170px]" aria-label="Sort experiences" />
      </div>
      {q.isPending ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <ExperienceRowSkeleton key={i} />)}</div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} error={q.error} />
      ) : items.length === 0 ? (
        <Card><EmptyState icon={FileText} title="No experiences yet" action={<Button asChild><Link to="/share"><Plus /> Share yours</Link></Button>}>Interviewed here? Yours would be the first.</EmptyState></Card>
      ) : (
        <>
          <div className="space-y-3">{items.map((e) => <ExperienceRow key={e.id} exp={e} />)}</div>
          {q.hasNextPage && (
            <div className="mt-6 flex justify-center"><Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button></div>
          )}
        </>
      )}
    </div>
  )
}

function QuestionsTab({ slug }) {
  const [group, setGroup] = useState('topic')
  const [kind, setKind] = useState('all')
  const q = useQuery({ queryKey: ['company', slug, 'questions', kind], queryFn: () => getCompanyQuestions(slug, { kind: kind === 'all' ? '' : kind }) })

  const groups = useMemo(() => {
    const out = new Map()
    for (const item of q.data ?? []) {
      const keys = group === 'topic' ? (item.topics.length ? item.topics.map((t) => t.label) : ['Other']) : item.round_types.map((r) => ROUND[r]?.label ?? r)
      const k = keys[0]
      if (!out.has(k)) out.set(k, [])
      out.get(k).push(item)
    }
    return [...out.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [q.data, group])

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented size="sm" options={[{ value: 'topic', label: 'By topic' }, { value: 'round', label: 'By round' }]} value={group} onValueChange={setGroup} aria-label="Group questions" />
        <Select value={kind} onValueChange={setKind} size="sm" className="sm:w-[180px]" aria-label="Question type" options={[{ value: 'all', label: 'All question types' }, ...QUESTION_KINDS]} />
      </div>
      {q.isPending ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} error={q.error} />
      ) : !q.data.length ? (
        <Card><EmptyState icon={MessageCircleQuestion} title="No questions reported">{kind === 'all' ? 'Questions appear once students add them to their experiences.' : 'Try a different question type.'}</EmptyState></Card>
      ) : (
        <div className="space-y-8">
          <p className="text-small text-ink-500">{pluralize(q.data.length, 'distinct question')} · student-reported, wording may differ from the original</p>
          {groups.map(([name, list]) => (
            <section key={name} aria-labelledby={`g-${name}`}>
              <h3 id={`g-${name}`} className="mb-2 flex items-center gap-2 text-h3">
                {name} <span className="text-body font-normal text-ink-500 tabular">{list.length}</span>
              </h3>
              <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200 bg-white">
                {list.map((item) => (
                  <li key={item.id} className="p-4">
                    <Markdown size="sm" className="[&_p]:text-body-lg [&_p]:text-ink-900">{item.body}</Markdown>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline">{QKIND[item.kind]?.label}</Badge>
                      {item.round_types.map((r) => <Tag key={r}>{ROUND[r]?.label}</Tag>)}
                      <span className="ml-1 text-small text-ink-500">
                        Asked in {pluralize(item.experiences.length, 'experience')} · {item.batches.map(batchLabel).join(', ')}
                      </span>
                      <Link to={`/experiences/${item.experiences[0].id}`} className="ml-auto inline-flex items-center gap-0.5 text-small font-medium text-teal-700 hover:underline">
                        Read experience <ChevronRight className="size-3.5" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CompanyPage() {
  const { slug } = useParams()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') ?? 'overview'
  const setTab = (t) => {
    setSp((p) => { const n = new URLSearchParams(p); t === 'overview' ? n.delete('tab') : n.set('tab', t); return n }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const { data: c, isPending, isError, error, refetch } = useQuery({ queryKey: ['company', slug], queryFn: () => getCompany(slug) })
  const [expanded, setExpanded] = useState(false)

  if (isPending) return <div className="container-page py-10"><div className="flex gap-4"><Skeleton className="size-16" /><div className="space-y-2"><Skeleton className="h-8 w-60" /><Skeleton className="h-4 w-40" /></div></div></div>
  if (isError) return error.code === 'not_found' ? <NotFoundPage title="Company not found" message={error.message} /> : <div className="container-page py-10"><ErrorState onRetry={refetch} error={error} /></div>
  if (c.redirect) return <Navigate to={`/companies/${c.redirect}`} replace />

  return (
    <div className="container-page py-8 md:py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-small text-ink-500">
        <Link to="/companies" className="hover:text-ink-900">Companies</Link>
        <ChevronRight className="mx-1 inline size-3.5" aria-hidden />
        <span className="text-ink-700">{c.name}</span>
      </nav>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <CompanyLogo name={c.name} size={64} />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-h1">{c.name}{c.is_verified && <VerifiedTick className="size-5" />}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-body text-ink-600">
              {c.industry}
              {c.website && (
                <>
                  <span className="text-ink-300">·</span>
                  <a href={`https://${c.website}`} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                    {c.website} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" className="shrink-0">
          <Link to="/share"><Plus /> Share a {c.name.split(' ')[0]} experience</Link>
        </Button>
      </header>

      {c.description ? (
        <div className="mt-5 max-w-[720px]">
          <p className={expanded ? 'text-body text-ink-700' : 'line-clamp-2 text-body text-ink-700'}>{c.description}</p>
          <p className="mt-1 flex items-center gap-3 text-caption text-ink-500">
            <span>Source: {c.description_source === 'official_site' ? 'company website' : c.description_source === 'student_submitted' ? 'submitted by a student' : 'written by Roundwise admins'}</span>
            {c.description.length > 160 && <button onClick={() => setExpanded((e) => !e)} className="font-medium text-ink-700 hover:underline">{expanded ? 'Less' : 'More'}</button>}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-small text-ink-500">This company was added by a student and hasn’t been verified by admins yet.</p>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="experiences" count={c.experience_count}>Experiences</TabsTrigger>
          <TabsTrigger value="questions" count={c.question_count}>Questions</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-8 outline-none"><Overview slug={slug} onTab={setTab} /></TabsContent>
        <TabsContent value="experiences" className="pt-8 outline-none"><ExperiencesTab slug={slug} /></TabsContent>
        <TabsContent value="questions" className="pt-8 outline-none"><QuestionsTab slug={slug} /></TabsContent>
      </Tabs>
    </div>
  )
}
