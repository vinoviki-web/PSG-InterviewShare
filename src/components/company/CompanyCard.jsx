import { Link } from 'react-router'
import { BadgeCheck } from 'lucide-react'
import { CompanyLogo, Skeleton, Tooltip } from '@/components/ui'
import { formatMonth, pluralize, cn } from '@/lib/utils'

export function VerifiedTick({ className }) {
  return (
    <Tooltip content="Verified by admins">
      <BadgeCheck className={cn('size-4 shrink-0 text-teal-600', className)} aria-label="Verified company" />
    </Tooltip>
  )
}

export function CompanyCard({ company, className }) {
  return (
    <Link
      to={`/companies/${company.slug}`}
      className={cn('group flex flex-col rounded-lg border border-ink-200 bg-white p-4 shadow-xs transition-[border-color,box-shadow] duration-[120ms] hover:border-ink-300 hover:shadow-sm', className)}
    >
      <div className="flex items-start gap-3">
        <CompanyLogo name={company.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-body font-semibold text-ink-900">
            <span className="truncate group-hover:text-teal-700">{company.name}</span>
            {company.is_verified && <VerifiedTick />}
          </p>
          <p className="truncate text-small text-ink-500">{company.industry}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-small">
        <span className="font-medium text-ink-800 tabular">{pluralize(company.experience_count, 'experience')}</span>
        {company.latest_interview && <span className="text-ink-500">Latest {formatMonth(company.latest_interview)}</span>}
      </div>
    </Link>
  )
}

export function CompanyCardSkeleton() {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4" aria-hidden>
      <div className="flex gap-3">
        <Skeleton className="size-10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-4 h-4 w-1/2" />
    </div>
  )
}
