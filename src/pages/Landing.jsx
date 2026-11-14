import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Accordion, Tabs as TabsPrimitive } from 'radix-ui'
import { Mail, BadgeCheck, EyeOff, ShieldCheck, ChevronDown, ArrowRight, ThumbsUp, Clock3 } from 'lucide-react'
import { getPublicStats } from '@/api/public'
import { Button, CompanyLogo, OutcomePill, Tag, DifficultyMeter, Skeleton } from '@/components/ui'
import { RoundPipeline } from '@/components/experience/Pipeline'
import { cn, pluralize } from '@/lib/utils'
import { ROUND } from '@/lib/constants'
import { DOMAINS, DOMAIN } from '@/lib/taxonomy'

/* Clearly-labelled FICTIONAL examples (not real student content) show what's
   inside without exposing gated data to visitors (D11). One per field, because
   placements span every branch, not just software (MD1). */
const EXAMPLES = [
  {
    domain: 'software', company: 'Acme Systems', role: 'SDE Intern', meta: 'Internship · On-campus · Aug 2026 · CSE ’28',
    outcome: 'selected', difficulty: 4, steps: ['online_assessment', 'technical', 'technical', 'hr'],
    rounds: [
      ['online_assessment', 'Online assessment', '2 coding questions · 90 min'],
      ['technical', 'Technical 1', 'Sliding window, then a graph follow-up'],
      ['technical', 'Technical 2', 'Project deep-dive · OS and DBMS'],
      ['hr', 'HR', 'Relocation, joining timeline'],
    ],
    tags: ['Sliding window', 'Graphs', 'OS'], helpful: 42, minutes: 6,
    question: ['Technical 1', 'Longest substring without repeating characters', 4],
  },
  {
    domain: 'electronics', company: 'Siliconridge Semiconductors', role: 'Analog Design Intern', meta: 'Internship · On-campus · Jul 2026 · ECE ’28',
    outcome: 'selected', difficulty: 4, steps: ['online_assessment', 'technical', 'technical', 'hr'],
    rounds: [
      ['online_assessment', 'Online assessment', 'Aptitude and 30 MCQs on analog and digital · 60 min'],
      ['technical', 'Technical 1', 'Op-amp basics, then design a low-pass filter'],
      ['technical', 'Technical 2', 'CMOS inverter sizing · final-year project'],
      ['hr', 'HR', 'Relocation to Bengaluru, joining timeline'],
    ],
    tags: ['Analog circuits', 'VLSI design', 'Signals & systems'], helpful: 31, minutes: 7,
    question: ['Technical 1', 'Derive the gain of a non-inverting amplifier', 3],
  },
  {
    domain: 'electrical', company: 'Gridline Power', role: 'Graduate Engineer Trainee', meta: 'Full-time · On-campus · Sep 2026 · EEE ’27',
    outcome: 'selected', difficulty: 3, steps: ['written_test', 'technical', 'practical', 'hr'],
    rounds: [
      ['written_test', 'Written technical test', '40 MCQs on machines and power systems · 60 min'],
      ['technical', 'Technical', 'Transformer losses, then a per-unit fault calculation'],
      ['practical', 'Practical', 'Wire a star-delta starter on the trainer kit'],
      ['hr', 'HR', 'Plant shifts, bond terms'],
    ],
    tags: ['Electrical machines', 'Power systems', 'Protection'], helpful: 27, minutes: 5,
    question: ['Technical', 'Why is a transformer rated in kVA, not kW?', 6],
  },
  {
    domain: 'mechanical', company: 'Torqueworks Automotive', role: 'Design Engineer', meta: 'Full-time · On-campus · Oct 2026 · MECH ’27',
    outcome: 'not_selected', difficulty: 3, steps: ['aptitude', 'written_test', 'technical', 'hr'],
    rounds: [
      ['aptitude', 'Aptitude', 'Quant and logical reasoning · 45 min'],
      ['written_test', 'Written technical test', 'Thermodynamics and strength of materials · 60 min'],
      ['technical', 'Technical', 'Bending-moment diagram on paper, then GD&T on a drawing'],
      ['hr', 'HR', 'Plant location, why core over IT'],
    ],
    tags: ['Strength of materials', 'GD&T', 'Thermodynamics'], helpful: 19, minutes: 6,
    question: ['Technical', 'Sketch the bending-moment diagram for a cantilever with a point load', 2],
  },
  {
    domain: 'civil', company: 'Stonebridge Infra', role: 'Graduate Engineer Trainee', meta: 'Full-time · On-campus · Aug 2026 · CIVIL ’27',
    outcome: 'selected', difficulty: 3, steps: ['written_test', 'group_discussion', 'technical', 'hr'],
    rounds: [
      ['written_test', 'Written technical test', 'RCC, geotechnics and surveying MCQs · 60 min'],
      ['group_discussion', 'Group discussion', 'Smart cities for Tier-2 towns? · 15 min'],
      ['technical', 'Technical', 'Reading a soil report, then RCC slab basics'],
      ['hr', 'HR', 'Site postings and travel'],
    ],
    tags: ['RCC design', 'Geotechnics', 'Construction'], helpful: 23, minutes: 5,
    question: ['Technical', 'When would you choose a pile foundation over a raft?', 3],
  },
]

function ExampleCard({ ex }) {
  const domain = DOMAIN[ex.domain]
  return (
    <div className="relative md:mb-12">
      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-caption font-medium uppercase tracking-wider text-ink-500">
            Fictional example · <domain.icon className="size-3.5 text-teal-700" aria-hidden /> {domain.short}
          </span>
          <OutcomePill outcome={ex.outcome} />
        </div>
        <div className="flex gap-3.5">
          <CompanyLogo name={ex.company} size={40} />
          <div className="min-w-0">
            <p className="text-body-lg font-semibold text-ink-900">{ex.company} · {ex.role}</p>
            <p className="text-small text-ink-600">{ex.meta}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <RoundPipeline steps={ex.steps} withTooltips={false} />
          <DifficultyMeter value={ex.difficulty} />
        </div>
        <ol className="mt-5 space-y-0">
          {ex.rounds.map(([type, t, d], i, a) => {
            const Icon = ROUND[type]?.icon
            return (
              <li key={t + i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < a.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-ink-200" aria-hidden />}
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600">
                  {Icon && <Icon className="size-3.5" aria-hidden />}
                </span>
                <div className="pt-0.5">
                  <p className="text-body font-medium text-ink-900">{t}</p>
                  <p className="text-small text-ink-500">{d}</p>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {ex.tags.map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
          <span className="flex shrink-0 items-center gap-3 text-small text-ink-500">
            <span className="flex items-center gap-1 tabular"><ThumbsUp className="size-3.5" aria-hidden />{ex.helpful}</span>
            <span className="flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden />{ex.minutes} min</span>
          </span>
        </div>
      </div>
      <div className="absolute -bottom-16 -left-4 hidden w-[260px] rounded-lg border border-ink-200 bg-white p-3.5 shadow-md md:block lg:-left-12">
        <p className="text-caption font-medium text-ink-500">Question · {ex.question[0]}</p>
        <p className="mt-1 text-small font-medium text-ink-900">{ex.question[1]}</p>
        <p className="mt-1.5 text-caption font-medium text-teal-700">Also in {ex.question[2]} other experiences →</p>
      </div>
    </div>
  )
}

/** Switch the example between fields. Real tabs: arrow keys move between them. */
function ProductPreview() {
  const [domain, setDomain] = useState(EXAMPLES[0].domain)
  return (
    <TabsPrimitive.Root value={domain} onValueChange={setDomain} aria-label="Example experiences by domain">
      <TabsPrimitive.List aria-label="Choose a domain" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {EXAMPLES.map((ex) => {
          const d = DOMAIN[ex.domain]
          return (
            <TabsPrimitive.Trigger
              key={ex.domain}
              value={ex.domain}
              className={cn(
                'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-small font-medium transition-colors duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2',
                'border-ink-200 bg-white text-ink-700 hover:border-ink-300 data-[state=active]:border-ink-900 data-[state=active]:bg-ink-900 data-[state=active]:text-white',
              )}
            >
              {d.short}
            </TabsPrimitive.Trigger>
          )
        })}
      </TabsPrimitive.List>
      {EXAMPLES.map((ex) => (
        <TabsPrimitive.Content key={ex.domain} value={ex.domain} className="outline-none" aria-label={`Fictional ${DOMAIN[ex.domain].label} example`}>
          <ExampleCard ex={ex} />
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
}

/** Every field PSG students are hired into (MD1). Visitors are sent to sign in, then land on the filtered list. */
function DomainGrid({ stats }) {
  const counts = stats?.domains ?? {}
  return (
    <section className="container-page py-20" aria-labelledby="domains-h">
      <div className="max-w-[640px]">
        <h2 id="domains-h" className="text-h1">Every branch, every domain</h2>
        <p className="mt-3 text-body-lg text-ink-600">
          Placements at PSG go far beyond software. Each experience is tagged with the field of the role, so an EEE, Mech or Civil student can follow theirs across every company.
        </p>
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DOMAINS.filter((d) => d.value !== 'other').map((d) => (
          <li key={d.value}>
            <Link
              to={`/experiences?domain=${d.value}`}
              className="group flex h-full gap-3 rounded-lg border border-ink-200 bg-white p-4 shadow-xs transition-[border-color,box-shadow] duration-[120ms] hover:border-ink-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <d.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ink-900 group-hover:text-teal-800">{d.label}</span>
                <span className="mt-0.5 block text-small text-ink-500">{d.covers}</span>
                {counts[d.value] > 0 && <span className="mt-1.5 block text-caption font-medium tabular text-ink-700">{pluralize(counts[d.value], 'experience')}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CompaniesStrip({ stats, loading }) {
  if (loading) return <div className="flex gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-36" />)}</div>
  if (!stats?.top_companies?.length) return null
  // Group by each company's main domain, in the usual domain order (MD5)
  const groups = DOMAINS.map((d) => ({ d, items: stats.top_companies.filter((c) => (DOMAIN[c.domain] ? c.domain : 'other') === d.value) })).filter((g) => g.items.length)
  return (
    <section aria-labelledby="companies-h" className="border-y border-ink-200 bg-white py-10">
      <div className="container-page">
        <h2 id="companies-h" className="text-small font-medium text-ink-500">Companies PSG students have written about</h2>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-5">
          {groups.map(({ d, items }) => (
            <div key={d.value}>
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-caption font-medium uppercase tracking-wider text-ink-500">
                <d.icon className="size-3.5" aria-hidden />{d.short}
              </h3>
              <ul className="flex flex-wrap gap-2.5">
                {items.map((c) => (
                  <li key={c.name} className="flex h-11 items-center gap-2.5 rounded-lg border border-ink-200 bg-ink-25 pl-1.5 pr-3.5">
                    <CompanyLogo name={c.name} size={32} className="shadow-none" />
                    <span className="text-body font-medium text-ink-800">{c.name}</span>
                    <span className="text-small tabular text-ink-500">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const FAQ = [
  ['Is it only for software jobs?', 'No. It covers every branch: core electronics, electrical, instrumentation, mechanical, robotics, civil, biomedical, materials, textile, data and business roles, as well as software. Each experience is tagged with the field of the role, and rounds like written technical tests and practicals are first-class.'],
  ['Who can use PSG InterviewShare?', 'Only current PSG College of Technology students with a verified @psgtech.ac.in account. Alumni access through a linked personal email is planned.'],
  ['Is it official?', 'No. It’s an independent project built and moderated by PSG students. It isn’t affiliated with or endorsed by PSG College of Technology or its placement cell, and nothing here is official company information unless it’s labelled that way.'],
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
            <span className="block text-ink-500">Every branch. Round by round.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-body-lg text-ink-600">
            Software, core electronics, electrical, mechanical, civil and more. See how your seniors’ interviews actually went: every round, the questions asked, how they prepared, and what they’d do differently.
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

      <DomainGrid stats={stats} />

      <section className="container-page py-20" aria-labelledby="how-h">
        <h2 id="how-h" className="max-w-[560px] text-h1">From a senior’s interview to your preparation plan</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            ['Read the rounds', 'Every experience is broken into rounds: format, duration, difficulty, and the exact questions asked.'],
            ['Prepare by topic', 'Questions are tagged by topic, from power systems and GD&T to graphs, so you can see what a company really focuses on.'],
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
            <p className="mt-3 text-body-lg text-ink-600">Useful experiences include the rejections and the hard parts. PSG InterviewShare is designed so students can share them safely.</p>
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
