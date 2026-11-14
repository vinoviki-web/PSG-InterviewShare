import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Accordion } from 'radix-ui'
import { Mail, BadgeCheck, EyeOff, ShieldCheck, ChevronDown, ArrowRight, ThumbsUp, Clock3, Cpu, Code2, HeartHandshake, MonitorCheck } from 'lucide-react'
import { getPublicStats } from '@/api/public'
import { Button, CompanyLogo, OutcomePill, Tag, DifficultyMeter, Skeleton } from '@/components/ui'
import { RoundPipeline } from '@/components/experience/Pipeline'
import { cn } from '@/lib/utils'

/* A clearly-labelled EXAMPLE (not real student content) shows what's inside
   without exposing gated data to visitors (D11). */
function ProductPreview() {
  return (
    <div className="relative md:mb-12" aria-label="Example of an experience on Roundwise">
      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-caption font-medium uppercase tracking-wider text-ink-500">Example</span>
          <OutcomePill outcome="selected" />
        </div>
        <div className="flex gap-3.5">
          <CompanyLogo name="Acme Systems" size={40} />
          <div className="min-w-0">
            <p className="text-body-lg font-semibold text-ink-900">Acme Systems · SDE Intern</p>
            <p className="text-small text-ink-600">Internship · On-campus · Aug 2026 · CSE ’28</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <RoundPipeline steps={['online_assessment', 'technical', 'technical', 'hr']} withTooltips={false} />
          <DifficultyMeter value={4} />
        </div>
        <ol className="mt-5 space-y-0">
          {[
            { icon: MonitorCheck, t: 'Online assessment', d: '2 coding questions · 90 min' },
            { icon: Code2, t: 'Technical 1', d: 'Sliding window, then a graph follow-up' },
            { icon: Cpu, t: 'Technical 2', d: 'Project deep-dive · OS and DBMS' },
            { icon: HeartHandshake, t: 'HR', d: 'Relocation, joining timeline' },
          ].map((r, i, a) => (
            <li key={r.t} className="relative flex gap-3 pb-4 last:pb-0">
              {i < a.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-ink-200" aria-hidden />}
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600">
                <r.icon className="size-3.5" aria-hidden />
              </span>
              <div className="pt-0.5">
                <p className="text-body font-medium text-ink-900">{r.t}</p>
                <p className="text-small text-ink-500">{r.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3.5">
          <div className="flex gap-1.5">
            <Tag>Sliding window</Tag>
            <Tag>Graphs</Tag>
            <Tag>OS</Tag>
          </div>
          <span className="flex items-center gap-3 text-small text-ink-500">
            <span className="flex items-center gap-1 tabular"><ThumbsUp className="size-3.5" aria-hidden />42</span>
            <span className="flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden />6 min</span>
          </span>
        </div>
      </div>
      <div className="absolute -bottom-16 -left-4 hidden w-[250px] rounded-lg border border-ink-200 bg-white p-3.5 shadow-md md:block lg:-left-12">
        <p className="text-caption font-medium text-ink-500">Question · Technical 1</p>
        <p className="mt-1 text-small font-medium text-ink-900">Longest substring without repeating characters</p>
        <p className="mt-1.5 text-caption font-medium text-teal-700">Also in 4 other experiences →</p>
      </div>
    </div>
  )
}

function CompaniesStrip({ stats, loading }) {
  if (loading) return <div className="flex gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-36" />)}</div>
  if (!stats?.top_companies?.length) return null
  return (
    <section aria-labelledby="companies-h" className="border-y border-ink-200 bg-white py-10">
      <div className="container-page">
        <h2 id="companies-h" className="text-small font-medium text-ink-500">Companies PSG students have written about</h2>
        <ul className="mt-4 flex flex-wrap gap-2.5">
          {stats.top_companies.map((c) => (
            <li key={c.name} className="flex h-11 items-center gap-2.5 rounded-lg border border-ink-200 bg-ink-25 pl-1.5 pr-3.5">
              <CompanyLogo name={c.name} size={32} className="shadow-none" />
              <span className="text-body font-medium text-ink-800">{c.name}</span>
              <span className="text-small tabular text-ink-500">{c.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const FAQ = [
  ['Who can use Roundwise?', 'Only current PSG College of Technology students with a verified @psgtech.ac.in account. Alumni access through a linked personal email is planned.'],
  ['Is it official?', 'No. It’s built and moderated by PSG students. It isn’t run by the placement cell, and nothing here is official company information unless it’s labelled that way.'],
  ['Can I share anonymously?', 'Yes. Readers won’t see your name or profile. The system still knows it was a verified student, and only admins can see the author, solely to handle abuse. Every time they do is logged.'],
  ['What shouldn’t I share?', 'Confidential test content you agreed not to share, personal details about interviewers, or anything you didn’t experience yourself. See the guidelines.'],
  ['Why do I need to sign in to read?', 'Experiences are written for PSG juniors, not the open internet. Keeping them inside the community protects contributors and keeps the content honest.'],
]

export default function Landing() {
  const { data: stats, isPending } = useQuery({ queryKey: ['public-stats'], queryFn: getPublicStats, staleTime: 300_000 })
  const [openFaq, setOpenFaq] = useState('')

  return (
    <>
      <section className="container-page grid grid-cols-[minmax(0,1fr)] items-center gap-14 pb-20 pt-12 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-small font-medium text-ink-700 shadow-xs">
            <BadgeCheck className="size-4 text-teal-600" aria-hidden />
            For verified PSG Tech students
          </p>
          <h1 className="mt-6 text-[2rem] font-semibold leading-[1.15] tracking-[-0.03em] text-ink-900 sm:text-display lg:text-[3.25rem] lg:leading-[1.08]">
            Real interview experiences from PSG students.
            <span className="block text-ink-500">Company by company, round by round.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-body-lg text-ink-600">
            See how your seniors’ interviews actually went: every round, the questions asked, how they prepared, and what they’d do differently.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link to="/login">
                <Mail />
                Sign in with your college email
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/about">How it works <ArrowRight /></Link>
            </Button>
          </div>
          <p className="mt-4 text-small text-ink-500">Only @psgtech.ac.in addresses · We email you a sign-in code · Anonymous sharing available</p>

          {stats?.show_counts && (
            <dl className="mt-10 grid max-w-[480px] grid-cols-3 gap-6 border-t border-ink-200 pt-6">
              {[
                ['Experiences', stats.experiences],
                ['Companies', stats.companies],
                ['Questions', stats.questions],
              ].map(([k, v]) => (
                <div key={k}>
                  <dd className="text-h1 tabular text-ink-900">{v}</dd>
                  <dt className="text-small text-ink-500">{k}</dt>
                </div>
              ))}
            </dl>
          )}
        </div>
        <ProductPreview />
      </section>

      <CompaniesStrip stats={stats} loading={isPending} />

      <section className="container-page py-20" aria-labelledby="how-h">
        <h2 id="how-h" className="max-w-[560px] text-h1">From a senior’s interview to your preparation plan</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            ['Read the rounds', 'Every experience is broken into rounds: format, duration, difficulty, and the exact questions asked.'],
            ['Prepare by topic', 'Questions are tagged by topic, so you can see what a company really focuses on across many interviews.'],
            ['Give back', 'After your interview, share yours in about ten minutes. Drafts save automatically, and you can post anonymously.'],
          ].map(([t, d], i) => (
            <li key={t} className="border-t-2 border-ink-900 pt-5">
              <span className="font-mono text-small text-ink-500">0{i + 1}</span>
              <h3 className="mt-2 text-h3">{t}</h3>
              <p className="mt-2 text-body text-ink-600">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-ink-200 bg-white py-20" aria-labelledby="trust-h">
        <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="trust-h" className="text-h1">Built for honesty</h2>
            <p className="mt-3 text-body-lg text-ink-600">Useful experiences include the rejections and the hard parts. Roundwise is designed so students can share them safely.</p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-3">
            {[
              [ShieldCheck, 'Verified PSG only', 'Every account is a confirmed @psgtech.ac.in address, checked on our servers, not just in the browser.'],
              [EyeOff, 'Truly anonymous option', 'Anonymity is enforced in the database. Your name never reaches other readers.'],
              [BadgeCheck, 'Student moderated', 'Reports are reviewed by student moderators. Every moderation action is logged.'],
            ].map(([Icon, t, d]) => (
              <li key={t}>
                <Icon className="size-6 text-teal-600" aria-hidden />
                <h3 className="mt-3 text-body-lg font-semibold text-ink-900">{t}</h3>
                <p className="mt-1.5 text-body text-ink-600">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-page py-20" aria-labelledby="faq-h">
        <div className="mx-auto max-w-[720px]">
          <h2 id="faq-h" className="text-h1">Questions</h2>
          <Accordion.Root type="single" collapsible value={openFaq} onValueChange={setOpenFaq} className="mt-6 divide-y divide-ink-200 border-y border-ink-200">
            {FAQ.map(([q, a]) => (
              <Accordion.Item key={q} value={q}>
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 py-4 text-left text-body-lg font-medium text-ink-900">
                    {q}
                    <ChevronDown className="size-5 shrink-0 text-ink-500 transition-transform duration-[180ms] group-data-[state=open]:rotate-180" aria-hidden />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className={cn('overflow-hidden pb-4 text-body text-ink-600')}>{a}</Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
          <div className="mt-12 flex flex-col items-start gap-4 rounded-xl bg-ink-900 p-8 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-h2 font-semibold text-white">Preparing for placements?</p>
              <p className="mt-1 text-body text-ink-300">Start with the companies visiting this season.</p>
            </div>
            <Button asChild size="lg" className="bg-white text-ink-900 hover:bg-ink-100 active:bg-ink-200">
              <Link to="/login">Sign in with your college email</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
