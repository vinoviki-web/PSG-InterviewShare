import { Link } from 'react-router'
import { ThumbsUp, Clock3, MessageSquare } from 'lucide-react'
import { CompanyLogo, OutcomePill, Tag, DifficultyMeter, Skeleton } from '@/components/ui'
import { RoundPipeline } from './Pipeline'
import { SaveButton } from './Actions'
import { OPPORTUNITY, HIRING } from '@/lib/constants'
import { batchLabel, formatMonth, timeAgo, cn } from '@/lib/utils'

/** "CSE ’27" or "’27" (department hidden on some anonymous posts). */
export const batchText = (e) => [e.department?.code, batchLabel(e.graduation_year)].filter(Boolean).join(' ')

export function MetaLine({ exp, className }) {
  const parts = [OPPORTUNITY[exp.opportunity_type]?.label, HIRING[exp.hiring_mode]?.label, formatMonth(exp.interview_month), batchText(exp)].filter(Boolean)
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 text-small text-ink-600', className)}>
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-ink-300" aria-hidden>·</span>}
          {p}
        </span>
      ))}
    </p>
  )
}

/**
 * The most-seen component (spec §3.4). Whole row is one link (stretched
 * from the title); Save is a separate control above the link layer.
 */
export function ExperienceRow({ exp, className }) {
  return (
    <article
      className={cn(
        'group relative rounded-lg border border-ink-200 bg-white p-4 shadow-xs transition-[border-color,box-shadow] duration-[120ms] hover:border-ink-300 hover:shadow-sm focus-within:border-ink-300 sm:p-5',
        className,
      )}
    >
      <div className="flex gap-3.5 sm:gap-4">
        <CompanyLogo name={exp.company.name} size={40} className="mt-0.5 hidden sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-body-lg font-semibold leading-snug text-ink-900">
                <Link
                  to={`/experiences/${exp.id}`}
                  className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-teal-600"
                >
                  {exp.company.name}
                  <span className="font-normal text-ink-500"> · </span>
                  <span className="font-medium text-ink-800">{exp.role_title}</span>
                </Link>
              </h3>
              <MetaLine exp={exp} className="mt-1" />
            </div>
            <div className="-mr-2 -mt-1.5 flex shrink-0 items-center gap-1">
              <OutcomePill outcome={exp.outcome} className="hidden sm:inline-flex" />
              <SaveButton exp={exp} variant="icon" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <RoundPipeline steps={exp.pipeline} withTooltips={false} />
            <div className="flex items-center gap-3">
              <OutcomePill outcome={exp.outcome} className="sm:hidden" />
              <DifficultyMeter value={exp.difficulty} />
            </div>
          </div>

          {exp.excerpt && (
            <p className="mt-3 line-clamp-2 text-body text-ink-700">
              <span className="text-ink-500" aria-hidden>“</span>
              {exp.excerpt}
              <span className="text-ink-500" aria-hidden>”</span>
            </p>
          )}

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {exp.topics.slice(0, 3).map((t) => (
                <Tag key={t.value}>{t.label}</Tag>
              ))}
              {exp.topics.length > 3 && <Tag className="bg-transparent text-ink-500">+{exp.topics.length - 3}</Tag>}
            </div>
            <p className="flex items-center gap-3 text-small text-ink-500">
              <span className="inline-flex items-center gap-1 tabular" title={`${exp.helpful_count} found this helpful`}>
                <ThumbsUp className="size-3.5" aria-hidden />
                {exp.helpful_count}
                <span className="sr-only">helpful</span>
              </span>
              {exp.comment_count > 0 && (
                <span className="inline-flex items-center gap-1 tabular">
                  <MessageSquare className="size-3.5" aria-hidden />
                  {exp.comment_count}
                  <span className="sr-only">comments</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3.5" aria-hidden />
                {exp.reading_minutes} min
              </span>
              <span>{timeAgo(exp.published_at)}</span>
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}

export function ExperienceRowSkeleton() {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-xs sm:p-5" aria-hidden>
      <div className="flex gap-4">
        <Skeleton className="hidden size-10 sm:block" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Compact variant for dashboard asides and related lists. */
export function ExperienceCompact({ exp, className }) {
  return (
    <Link
      to={`/experiences/${exp.id}`}
      className={cn('group flex items-start gap-3 rounded-md p-2 -mx-2 transition-colors hover:bg-ink-50', className)}
    >
      <CompanyLogo name={exp.company.name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink-900 group-hover:text-teal-700">{exp.company.name}</span>
        <span className="block truncate text-small text-ink-500">
          {exp.role_title} · {batchText(exp)}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-small tabular text-ink-500">
        <ThumbsUp className="size-3.5" aria-hidden />
        {exp.helpful_count}
      </span>
    </Link>
  )
}

export function ExperienceCompactSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2" aria-hidden>
      <Skeleton className="size-8" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}
