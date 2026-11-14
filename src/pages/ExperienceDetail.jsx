import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, Link2, Flag, Pencil, Trash2, ChevronRight, EyeOff, Share2 } from 'lucide-react'
import { getExperience, getRelated, recordView, deleteExperience } from '@/api/experiences'
import { getCompanyInsights } from '@/api/companies'
import { ExperienceArticle, sectionsFor } from '@/components/experience/ExperienceArticle'
import { ExperienceCompact, ExperienceCompactSkeleton } from '@/components/experience/ExperienceRow'
import { HelpfulButton, SaveButton } from '@/components/experience/Actions'
import { RoundPipeline } from '@/components/experience/Pipeline'
import { Comments } from '@/components/experience/Comments'
import { ReportDialog } from '@/components/experience/ReportDialog'
import { Button, Card, CompanyLogo, ConfirmDialog, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Select, Skeleton, Tag, useToast } from '@/components/ui'
import { NotFoundPage } from '@/pages/SystemPages'
import { ErrorState } from '@/components/ui'
import { useScrollSpy } from '@/hooks/useScrollSpy'
import { useAuth } from '@/hooks/useAuth'
import { pluralize, cn } from '@/lib/utils'

function useCopyLink() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked */ }
  }
  return [copied, copy]
}

function Toc({ sections, active }) {
  return (
    <nav aria-label="On this page" className="sticky top-24">
      <p className="mb-2 text-caption font-medium uppercase tracking-wider text-ink-500">On this page</p>
      <ul className="space-y-0.5 border-l border-ink-200">
        {[...sections, { id: 'comments', label: 'Comments' }].map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                '-ml-px block border-l-2 py-1 text-small transition-colors',
                s.sub ? 'pl-5' : 'pl-3',
                active === s.id ? 'border-ink-900 font-medium text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function CompanySnapshot({ company }) {
  const { data, isPending } = useQuery({ queryKey: ['company', company.slug, 'insights'], queryFn: () => getCompanyInsights(company.slug) })
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <CompanyLogo name={company.name} size={40} />
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-ink-900">{company.name}</p>
          {isPending ? <Skeleton className="mt-1 h-3 w-24" /> : data ? <p className="text-small text-ink-500">{pluralize(data.n, 'experience')}</p> : null}
        </div>
      </div>
      {data?.sufficient && (
        <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
          <div>
            <p className="mb-1.5 text-caption text-ink-500">Usual process</p>
            <RoundPipeline steps={data.sequences[0].steps} />
          </div>
          <div>
            <p className="mb-1.5 text-caption text-ink-500">Most reported topics</p>
            <div className="flex flex-wrap gap-1.5">{data.topics.slice(0, 4).map((t) => <Tag key={t.topic.value}>{t.topic.label}</Tag>)}</div>
          </div>
          <p className="text-caption text-ink-500">Student-reported · from {pluralize(data.n, 'experience')}</p>
        </div>
      )}
      <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
        <Link to={`/companies/${company.slug}`}>View company <ChevronRight /></Link>
      </Button>
    </Card>
  )
}

function Related({ id }) {
  const { data, isPending } = useQuery({ queryKey: ['experiences', 'related', id], queryFn: () => getRelated(id) })
  if (!isPending && !data?.length) return null
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-body-lg font-semibold text-ink-900">Related experiences</h2>
      {isPending ? [0, 1, 2].map((i) => <ExperienceCompactSkeleton key={i} />) : data.map((e) => <ExperienceCompact key={e.id} exp={e} />)}
    </Card>
  )
}

function DetailSkeleton() {
  return (
    <div className="container-page py-8" aria-busy>
      <Skeleton className="h-4 w-56" />
      <div className="mt-8 max-w-[680px] space-y-4">
        <div className="flex gap-4"><Skeleton className="size-16" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-80" /></div></div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}

export default function ExperienceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { isModerator } = useAuth()
  const { data: exp, isPending, isError, error, refetch } = useQuery({ queryKey: ['experience', id], queryFn: () => getExperience(id) })
  const [copied, copy] = useCopyLink()
  const [reportOpen, setReportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showBar, setShowBar] = useState(false)
  const sections = exp ? sectionsFor(exp) : []
  const active = useScrollSpy([...sections.map((s) => s.id), 'comments'])

  useEffect(() => {
    if (exp?.status === 'published') recordView(id)
  }, [id, exp?.status])

  /* Deep links like #round-2 or #comments: scroll once content exists. */
  useEffect(() => {
    if (!exp || !location.hash) return
    const t = setTimeout(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(), 50)
    return () => clearTimeout(t)
  }, [exp?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onScroll = () => setShowBar(window.scrollY > 420)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const del = useMutation({
    mutationFn: () => deleteExperience(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['experiences'] })
      toast.success('Experience deleted.')
      navigate('/me', { replace: true })
    },
    onError: (e) => toast.error(e.message),
  })

  if (isPending) return <DetailSkeleton />
  if (isError) {
    if (error.code === 'not_found') return <NotFoundPage title="Experience not found" message={error.message} />
    return <div className="container-page py-10"><ErrorState title="Couldn’t load this experience" onRetry={refetch} error={error} /></div>
  }

  const actions = (
    <div className="flex items-center gap-2">
      <HelpfulButton exp={exp} />
      <SaveButton exp={exp} />
      <Button variant="secondary" onClick={copy} aria-live="polite" className="hidden sm:inline-flex">
        <Link2 /> {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <IconButton variant="secondary" label="More actions"><Ellipsis /></IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={Link2} onSelect={copy}>Copy link</MenuItem>
          {exp.is_owner ? (
            <>
              <MenuItem icon={Pencil} onSelect={() => navigate(`/share/${exp.id}?edit=1`)}>Edit</MenuItem>
              <MenuSeparator />
              <MenuItem icon={Trash2} tone="danger" onSelect={() => setDeleteOpen(true)}>Delete</MenuItem>
            </>
          ) : (
            <MenuItem icon={Flag} onSelect={() => setReportOpen(true)}>Report</MenuItem>
          )}
          {isModerator && !exp.is_owner && (
            <>
              <MenuSeparator />
              <MenuItem icon={EyeOff} onSelect={() => navigate('/mod')}>Open in moderation</MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  )

  return (
    <div className="container-page py-6 md:py-8">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 text-small text-ink-500">
          <li><Link to="/companies" className="hover:text-ink-900">Companies</Link></li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li><Link to={`/companies/${exp.company.slug}`} className="hover:text-ink-900">{exp.company.name}</Link></li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li aria-current="page" className="text-ink-700">{exp.role_title}</li>
        </ol>
      </nav>

      {exp.status === 'hidden' && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 p-4 text-body text-ink-800" role="status">
          <EyeOff className="mt-0.5 size-5 shrink-0 text-warning-600" aria-hidden />
          <p>
            {exp.is_owner ? 'This experience is hidden pending review after reports. You’ll be notified of the outcome.' : `Hidden from students. ${exp.hidden_reason ?? ''}`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[180px_minmax(0,680px)_280px] xl:justify-between">
        <aside className="hidden xl:block"><Toc sections={sections} active={active} /></aside>

        <div className="min-w-0">
          <div className="mb-6 xl:hidden">
            <Select
              aria-label="Jump to section"
              placeholder="Jump to section"
              value=""
              onValueChange={(v) => document.getElementById(v)?.scrollIntoView({ behavior: 'smooth' })}
              options={[...sections, { id: 'comments', label: 'Comments' }].map((s) => ({ value: s.id, label: s.label }))}
              size="sm"
              className="w-auto min-w-[200px]"
            />
          </div>
          <ExperienceArticle exp={exp} actions={<div className="hidden md:block">{actions}</div>} />
          <div className="mt-8 md:hidden">{actions}</div>

          <div className="mt-12 flex flex-col items-start gap-4 rounded-lg border border-ink-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-body-lg font-semibold text-ink-900">Was this helpful?</p>
              <p className="text-small text-ink-500">Helpful votes push the best experiences to the top for everyone.</p>
            </div>
            <div className="flex gap-2"><HelpfulButton exp={exp} /><SaveButton exp={exp} /></div>
          </div>

          <div className="mt-12 border-t border-ink-200 pt-10">
            <Comments experienceId={exp.id} />
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <CompanySnapshot company={exp.company} />
          <Related id={exp.id} />
        </aside>
      </div>

      {/* Mobile sticky actions (spec §9.6) */}
      <div
        className={cn(
          'pb-safe fixed inset-x-0 bottom-16 z-10 border-t border-ink-200 bg-white/95 px-4 py-2.5 backdrop-blur-md transition-transform duration-[180ms] md:hidden',
          showBar ? 'translate-y-0' : 'translate-y-[calc(100%+64px)]',
        )}
        aria-hidden={!showBar}
      >
        <div className="flex items-center gap-2">
          <HelpfulButton exp={exp} size="sm" className="flex-1 justify-center" />
          <SaveButton exp={exp} className="h-8 flex-1 justify-center px-2.5 text-small" />
          <Button variant="secondary" size="sm" className="flex-1" onClick={async () => {
            if (navigator.share) { try { await navigator.share({ title: `${exp.company.name} · ${exp.role_title}`, url: location.href }) } catch { /* cancelled */ } } else copy()
          }}>
            <Share2 /> {copied ? 'Copied' : 'Share'}
          </Button>
        </div>
      </div>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} target={{ type: 'experience', id: exp.id }} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this experience?"
        body="It will be removed for everyone, including its helpful votes and comments. This can’t be undone from the app."
        confirmLabel="Delete"
        onConfirm={() => del.mutate()}
        loading={del.isPending}
      />
    </div>
  )
}
