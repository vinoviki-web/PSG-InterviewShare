import { Link } from 'react-router'
import { Layers, Gauge, MessageCircleQuestion, Clock3, ExternalLink, Lightbulb, BadgeCheck } from 'lucide-react'
import { Avatar, Badge, CompanyLogo, OutcomePill, Tag, DifficultyMeter } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { MetaLine } from './ExperienceRow'
import { ROUND, QKIND, DIFFICULTY_LABELS, RESOURCE_KINDS } from '@/lib/constants'
import { DEPARTMENT } from '@/mocks/lookups'
import { cn, formatDate, pluralize } from '@/lib/utils'

const hostOf = (url) => {
  try { return new URL(url).hostname } catch { return '' }
}
const RESOURCE_LABEL = Object.fromEntries(RESOURCE_KINDS.map((r) => [r.value, r.label]))

export const sectionsFor = (exp) =>
  [
    { id: 'overview', label: 'Overview' },
    exp.eligibility && { id: 'eligibility', label: 'Eligibility' },
    exp.application_process && { id: 'application', label: 'Application' },
    ...exp.rounds.map((r) => ({ id: `round-${r.position}`, label: `Round ${r.position} · ${ROUND[r.round_type]?.short}`, sub: true })),
    (exp.preparation || exp.topics.length || exp.resources?.length) && { id: 'preparation', label: 'Preparation' },
    exp.advice && { id: 'advice', label: 'Advice' },
  ].filter(Boolean)

const searchSnippet = (body) => body.replace(/[`*_.,?:;()“”"']/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join(' ')

export function QuestionItem({ q, index, showRound, className }) {
  const kind = QKIND[q.kind]
  const others = q.also_in?.length ?? 0
  return (
    <li className={cn('flex gap-3', className)}>
      {index != null && <span className="mt-[3px] w-5 shrink-0 text-right font-mono text-small text-ink-500 tabular">{index}.</span>}
      <div className="min-w-0 flex-1">
        <Markdown size="sm" className="text-ink-900 [&_p]:text-body-lg">{q.body}</Markdown>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {kind && <Badge tone="outline">{kind.label}</Badge>}
          {q.topics?.filter((t) => t.label !== kind?.label).map((t) => <Tag key={t.value}>{t.label}</Tag>)}
          {showRound}
          {others > 0 && (
            <Link to={`/experiences?q=${encodeURIComponent(searchSnippet(q.body))}`} className="ml-1 text-small font-medium text-teal-700 hover:underline">
              Also in {pluralize(others, 'other experience')} →
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}

function Section({ id, title, children, className }) {
  return (
    <section id={id} className={cn('scroll-mt-24', className)} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="mb-3 text-h2">{title}</h2>
      {children}
    </section>
  )
}

function RoundCard({ round, isLast }) {
  const r = ROUND[round.round_type]
  const Icon = r?.icon
  return (
    <li id={`round-${round.position}`} className="relative scroll-mt-24 pl-12">
      {!isLast && <span className="absolute bottom-[-28px] left-[17px] top-10 w-px bg-ink-200" aria-hidden />}
      <span className="absolute left-0 top-0 inline-flex size-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-xs">
        {Icon && <Icon className="size-[18px]" aria-hidden />}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-h3">
          Round {round.position} · {r?.label}
        </h3>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-600">
        <span>{round.mode === 'online' ? 'Online' : 'Offline'}</span>
        {round.duration_minutes && (
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden />
            {round.duration_minutes} min
          </span>
        )}
        {round.difficulty && <DifficultyMeter value={round.difficulty} />}
      </p>
      {round.description && <Markdown className="mt-3">{round.description}</Markdown>}
      {round.questions?.length > 0 && (
        <div className="mt-4 rounded-lg border border-ink-200 bg-ink-25 p-4">
          <p className="mb-3 text-caption font-medium uppercase tracking-wider text-ink-500">
            {pluralize(round.questions.length, 'question')} asked
          </p>
          <ol className="space-y-4">
            {round.questions.map((q, i) => (
              <QuestionItem key={q.id} q={q} index={i + 1} />
            ))}
          </ol>
        </div>
      )}
    </li>
  )
}

export function AuthorLine({ exp }) {
  if (!exp.author) {
    return (
      <div className="flex items-center gap-2.5">
        <Avatar anonymous size={32} />
        <div className="text-small leading-tight">
          <p className="font-medium text-ink-800">{exp.author === null && exp.is_anonymous ? 'Anonymous PSG student' : 'Former PSG student'}</p>
          <p className="text-ink-500">Verified PSG account</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={exp.author.full_name} size={32} />
      <div className="text-small leading-tight">
        {exp.author.handle ? (
          <Link to={`/u/${exp.author.handle}`} className="font-medium text-ink-800 hover:text-teal-700 hover:underline">
            {exp.author.full_name}
          </Link>
        ) : (
          <p className="font-medium text-ink-800">{exp.author.full_name}</p>
        )}
        <p className="flex items-center gap-1 text-ink-500">
          <BadgeCheck className="size-3.5 text-teal-600" aria-hidden /> Verified PSG student
          {exp.is_anonymous && exp.is_owner && <span className="ml-1 text-warning-600">· shown anonymously to others</span>}
        </p>
      </div>
    </div>
  )
}

export function ArticleHeader({ exp, actions }) {
  return (
    <header id="overview" className="scroll-mt-24">
      <div className="flex items-start gap-4">
        <CompanyLogo name={exp.company.name} size={64} className="hidden sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink-600">
            {exp.company.slug ? (
              <Link to={`/companies/${exp.company.slug}`} className="hover:text-teal-700 hover:underline">
                {exp.company.name}
              </Link>
            ) : (
              exp.company.name
            )}
          </p>
          <h1 className="mt-0.5 text-h1">{exp.role_title}</h1>
          <MetaLine exp={exp} className="mt-2" />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <AuthorLine exp={exp} />
          <OutcomePill outcome={exp.outcome} />
        </div>
        {actions}
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-4">
        {[
          { icon: Layers, label: 'Rounds', value: exp.rounds.length },
          { icon: Gauge, label: 'Difficulty', value: exp.difficulty ? `${DIFFICULTY_LABELS[exp.difficulty]}` : '—' },
          { icon: MessageCircleQuestion, label: 'Questions', value: exp.rounds.reduce((n, r) => n + (r.questions?.length ?? 0), 0) },
          { icon: Clock3, label: 'Read time', value: `${exp.reading_minutes ?? 1} min` },
        ].map((s) => (
          <div key={s.label} className="bg-white px-4 py-3">
            <dt className="flex items-center gap-1.5 text-caption text-ink-500">
              <s.icon className="size-3.5" aria-hidden /> {s.label}
            </dt>
            <dd className="mt-0.5 text-h3 tabular text-ink-900">{s.value}</dd>
          </div>
        ))}
      </dl>
      {exp.edited && exp.updated_at && <p className="mt-3 text-caption text-ink-500">Edited {formatDate(exp.updated_at)}</p>}
    </header>
  )
}

export function ArticleBody({ exp }) {
  const el = exp.eligibility
  return (
    <div className="mt-10 space-y-12">
      {el && (
        <Section id="eligibility" title="Eligibility">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            {el.cgpa != null && (
              <div>
                <dt className="text-caption text-ink-500">CGPA cutoff</dt>
                <dd className="text-body-lg font-medium text-ink-900">{el.cgpa}+</dd>
              </div>
            )}
            {el.backlogs && el.backlogs !== 'unknown' && (
              <div>
                <dt className="text-caption text-ink-500">Active backlogs</dt>
                <dd className="text-body-lg font-medium text-ink-900">{el.backlogs === 'no' ? 'Not allowed' : 'Allowed'}</dd>
              </div>
            )}
            {el.branches?.length > 0 && (
              <div className="sm:col-span-3">
                <dt className="mb-1.5 text-caption text-ink-500">Eligible departments</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {el.branches.map((b) => <Tag key={b}>{DEPARTMENT[b]?.code ?? b}</Tag>)}
                </dd>
              </div>
            )}
            {el.other && <p className="text-body text-ink-700 sm:col-span-3">{el.other}</p>}
          </dl>
        </Section>
      )}

      {exp.application_process && (
        <Section id="application" title="How they applied">
          <Markdown>{exp.application_process}</Markdown>
        </Section>
      )}

      <Section id="process" title="Interview rounds">
        <ol className="space-y-10">
          {exp.rounds.map((r, i) => (
            <RoundCard key={r.id ?? i} round={r} isLast={i === exp.rounds.length - 1} />
          ))}
        </ol>
      </Section>

      {(exp.preparation || exp.topics.length > 0 || exp.resources?.length > 0) && (
        <Section id="preparation" title="Preparation">
          {exp.topics.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {exp.topics.map((t) => <Tag key={t.value}>{t.label}</Tag>)}
            </div>
          )}
          <Markdown>{exp.preparation}</Markdown>
          {exp.resources?.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-body font-semibold text-ink-900">Resources they used</h3>
              <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200 bg-white">
                {exp.resources.map((r) => (
                  <li key={r.url}>
                    <a href={r.url} target="_blank" rel="nofollow noopener noreferrer" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50">
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-ink-900">{r.title}</span>
                        <span className="block truncate text-caption text-ink-500">{[RESOURCE_LABEL[r.kind], hostOf(r.url)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <ExternalLink className="size-4 shrink-0 text-ink-500" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {exp.advice && (
        <section id="advice" className="scroll-mt-24 rounded-lg border border-teal-200 bg-teal-50 p-5 sm:p-6" aria-labelledby="advice-h">
          <h2 id="advice-h" className="mb-2 flex items-center gap-2 text-h3 text-teal-800">
            <Lightbulb className="size-5" aria-hidden /> Advice for juniors
          </h2>
          <Markdown className="text-ink-800">{exp.advice}</Markdown>
        </section>
      )}
    </div>
  )
}

/** Header + body. Used by the detail page and the wizard's Review step. */
export function ExperienceArticle({ exp, actions }) {
  return (
    <article>
      <ArticleHeader exp={exp} actions={actions} />
      <ArticleBody exp={exp} />
    </article>
  )
}
