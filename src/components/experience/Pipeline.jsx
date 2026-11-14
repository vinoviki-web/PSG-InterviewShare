import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'
import { ROUND, DIFFICULTY_LABELS } from '@/lib/constants'
import { Tooltip } from '@/components/ui'
import { cn } from '@/lib/utils'

/** Inline round sequence, e.g. OA → TECH → TECH → HR (spec §3.2). */
export function RoundPipeline({ steps, max = 5, size = 'sm', className, withTooltips = true }) {
  if (!steps?.length) return null
  const shown = steps.slice(0, max)
  const extra = steps.length - shown.length
  return (
    <ol className={cn('flex flex-wrap items-center gap-1', className)} aria-label={`${steps.length} rounds: ${steps.map((s) => ROUND[s.type ?? s]?.label).join(', ')}`}>
      {shown.map((s, i) => {
        const type = s.type ?? s
        const r = ROUND[type]
        const node = (
          <span
            className={cn(
              'inline-flex items-center rounded-sm border border-ink-200 bg-ink-50 font-mono font-medium tracking-tight text-ink-700',
              size === 'sm' ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2 text-caption',
            )}
          >
            {r?.short ?? type}
          </span>
        )
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3 text-ink-500" aria-hidden />}
            <li className="list-none">
              {withTooltips && s.difficulty ? (
                <Tooltip content={`Round ${i + 1}: ${r?.label} · ${s.mode === 'online' ? 'Online' : 'Offline'} · ${DIFFICULTY_LABELS[s.difficulty]}`}>
                  <span tabIndex={-1}>{node}</span>
                </Tooltip>
              ) : (
                node
              )}
            </li>
          </Fragment>
        )
      })}
      {extra > 0 && <li className="list-none text-caption text-ink-500">+{extra}</li>}
    </ol>
  )
}
