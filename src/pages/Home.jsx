import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, ArrowRight, FileText, Bookmark, History, Sparkles, Compass } from 'lucide-react'
import { searchExperiences, getRecentlyViewed, getSaved } from '@/api/experiences'
import { trendingCompanies } from '@/api/companies'
import { getMyStats } from '@/api/profile'
import { useAuth } from '@/hooks/useAuth'
import { Button, Card, SectionHeader, ErrorState, EmptyState, ProgressBar, Skeleton } from '@/components/ui'
import { ExperienceRow, ExperienceRowSkeleton, ExperienceCompact, ExperienceCompactSkeleton } from '@/components/experience/ExperienceRow'
import { CompanyCard, CompanyCardSkeleton } from '@/components/company/CompanyCard'
import { greeting, timeAgo, compact } from '@/lib/utils'
import { DEPARTMENT } from '@/mocks/lookups'
import { listMyDrafts } from '@/api/drafts'

async function latestDraft() {
  const [d] = await listMyDrafts()
  return d ? { id: d.id, company: d.company_name || 'Untitled draft', role_title: d.role_title, step: d.draft_step ?? 1, total: d.total_steps ?? 5, updated_at: d.updated_at } : null
}

function DraftCard({ userId }) {
  const { data } = useQuery({ queryKey: ['drafts', 'latest', userId], queryFn: latestDraft })
  if (!data) return null
  return (
    <Card className="mt-6 flex flex-col gap-4 border-warning-200 bg-warning-50/60 p-4 sm:flex-row sm:items-center">
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg border border-warning-200 bg-white text-warning-600 sm:inline-flex">
        <FileText className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-ink-900">
          Continue your draft: {data.company}{data.role_title ? ` · ${data.role_title}` : ''}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <ProgressBar value={data.step} max={5} className="max-w-[160px]" label="Draft progress" />
          <span className="text-small text-ink-600">Step {data.step} of 5 · edited {timeAgo(data.updated_at)}</span>
        </div>
      </div>
      <Button asChild variant="secondary">
        <Link to={`/share/${data.id}`}>Resume</Link>
      </Button>
    </Card>
  )
}

function Section({ query, title, description, action, children, skeleton, empty, className }) {
  return (
    <section className={className}>
      <SectionHeader title={title} description={description} action={action} />
      {query.isPending ? skeleton : query.isError ? <ErrorState onRetry={() => query.refetch()} error={query.error} /> : children}
      {!query.isPending && !query.isError && empty}
    </section>
  )
}

export default function Home() {
  const { user } = useAuth()
  const dept = DEPARTMENT[user.department_id]
  const latest = useQuery({ queryKey: ['experiences', 'home-latest'], queryFn: () => searchExperiences({ sort: 'latest', limit: 4 }) })
  const fromDept = useQuery({ queryKey: ['experiences', 'home-dept', user.department_id], queryFn: () => searchExperiences({ dept: user.department_id, sort: 'helpful', limit: 3 }) })
  const trending = useQuery({ queryKey: ['companies', 'trending'], queryFn: () => trendingCompanies(6) })
  const recent = useQuery({ queryKey: ['experiences', 'recent'], queryFn: () => getRecentlyViewed(4) })
  const saved = useQuery({ queryKey: ['experiences', 'saved'], queryFn: getSaved })
  const stats = useQuery({ queryKey: ['me', 'stats'], queryFn: getMyStats })
  const firstName = user.full_name.split(' ')[0]
  const year = new Date().getFullYear()
  const isSenior = user.graduation_year <= year + 1

  return (
    <div className="container-page py-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">{greeting()}, {firstName}</h1>
          <p className="mt-1 text-body text-ink-600">
            {latest.data?.total ? `${latest.data.total} experiences from PSG students so far.` : 'Here’s what’s new from PSG students.'}
          </p>
        </div>
      </div>

      <DraftCard userId={user.id} />

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="min-w-0 space-y-10">
          <Section
            query={latest}
            title="New on Roundwise"
            action={<Link to="/experiences" className="inline-flex items-center gap-1 text-body font-medium text-teal-700 hover:underline">See all <ArrowRight className="size-4" /></Link>}
            skeleton={<div className="space-y-3">{[0, 1, 2].map((i) => <ExperienceRowSkeleton key={i} />)}</div>}
            empty={latest.data?.items.length === 0 && (
              <Card><EmptyState icon={Compass} title="No experiences yet" action={<Button asChild><Link to="/share">Share the first one</Link></Button>}>Be the first to help your juniors.</EmptyState></Card>
            )}
          >
            <div className="space-y-3">{latest.data?.items.map((e) => <ExperienceRow key={e.id} exp={e} />)}</div>
          </Section>

          <Section
            query={trending}
            title="Trending companies"
            description="Most new and most-read experiences recently"
            action={<Link to="/companies" className="inline-flex items-center gap-1 text-body font-medium text-teal-700 hover:underline">All companies <ArrowRight className="size-4" /></Link>}
            skeleton={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <CompanyCardSkeleton key={i} />)}</div>}
          >
            {trending.data?.length ? (
              <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
                {trending.data.map((c) => <CompanyCard key={c.slug} company={c} className="w-[240px] shrink-0 snap-start sm:w-auto" />)}
              </div>
            ) : (
              <p className="text-body text-ink-500">Not enough recent activity to show trends yet.</p>
            )}
          </Section>

          {dept && (
            <Section
              query={fromDept}
              title={`From ${dept.code} students`}
              description="Most helpful experiences shared by your department"
              action={<Link to={`/experiences?dept=${dept.id}&sort=helpful`} className="inline-flex items-center gap-1 text-body font-medium text-teal-700 hover:underline">See all <ArrowRight className="size-4" /></Link>}
              skeleton={<div className="space-y-3">{[0, 1].map((i) => <ExperienceRowSkeleton key={i} />)}</div>}
            >
              {fromDept.data?.items.length ? (
                <div className="space-y-3">{fromDept.data.items.map((e) => <ExperienceRow key={e.id} exp={e} />)}</div>
              ) : (
                <p className="text-body text-ink-500">No experiences from {dept.code} yet. Yours could be the first.</p>
              )}
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <SectionHeader as="h2" title={<span className="flex items-center gap-2 text-body-lg"><Sparkles className="size-4 text-teal-600" /> Your impact</span>} className="mb-2" />
            {stats.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : stats.data?.published ? (
              <dl className="grid grid-cols-3 gap-2 pt-1">
                {[['Shared', stats.data.published], ['Helpful', stats.data.helpful_received], ['Reads', compact(stats.data.views)]].map(([k, v]) => (
                  <div key={k}>
                    <dd className="text-h2 tabular text-ink-900">{v}</dd>
                    <dt className="text-small text-ink-500">{k}</dt>
                  </div>
                ))}
              </dl>
            ) : (
              <div>
                <p className="text-body text-ink-600">
                  {isSenior ? 'Interviewed recently? Ten minutes of your time can save a junior weeks of guessing.' : 'When you interview for internships, share how it went. Drafts save automatically.'}
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-3"><Link to="/share"><Plus /> Share experience</Link></Button>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeader as="h2" title={<span className="flex items-center gap-2 text-body-lg"><History className="size-4 text-ink-500" /> Recently viewed</span>} className="mb-1" />
            {recent.isPending ? (
              [0, 1, 2].map((i) => <ExperienceCompactSkeleton key={i} />)
            ) : recent.data?.length ? (
              <div>{recent.data.map((e) => <ExperienceCompact key={e.id} exp={e} />)}</div>
            ) : (
              <p className="py-2 text-body text-ink-500">Experiences you open will show up here.</p>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeader
              as="h2"
              title={<span className="flex items-center gap-2 text-body-lg"><Bookmark className="size-4 text-ink-500" /> Saved</span>}
              action={saved.data?.length > 3 && <Link to="/saved" className="text-small font-medium text-teal-700 hover:underline">See all {saved.data.length}</Link>}
              className="mb-1"
            />
            {saved.isPending ? (
              [0, 1, 2].map((i) => <ExperienceCompactSkeleton key={i} />)
            ) : saved.data?.filter((s) => !s.unavailable).length ? (
              <div>{saved.data.filter((s) => !s.unavailable).slice(0, 3).map((e) => <ExperienceCompact key={e.id} exp={e} />)}</div>
            ) : (
              <p className="py-2 text-body text-ink-500">Save experiences to build your revision list.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
