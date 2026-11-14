import { Info } from 'lucide-react'
import { Tooltip } from '@/components/ui'
import { RoundPipeline } from '@/components/experience/Pipeline'
import { ROUND, DIFFICULTY_LABELS } from '@/lib/constants'
import { batchLabel, formatMonth, pluralize, cn } from '@/lib/utils'

export function ProvenanceLabel({ n, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm bg-ink-100 px-2 py-0.5 text-caption font-medium text-ink-600', className)}>
      Student-reported · from {pluralize(n, 'experience')}
    </span>
  )
}

export function InsightStat({ label, value, sub, tip }) {
  return (
    <div className="bg-white px-4 py-3.5">
      <dt className="flex items-center gap-1 text-caption text-ink-500">
        {label}
        {tip && (
          <Tooltip content={tip}>
            <button className="rounded text-ink-500 hover:text-ink-700" aria-label={`About ${label}`}><Info className="size-3.5" /></button>
          </Tooltip>
        )}
      </dt>
      <dd className="mt-0.5 text-h2 tabular text-ink-900">{value}</dd>
      {sub && <p className="text-caption text-ink-500">{sub}</p>}
    </div>
  )
}

/** Accessible horizontal bar list (rendered as a list, not a chart). */
export function BarList({ items, max, label }) {
  const top = max ?? Math.max(...items.map((i) => i.count), 1)
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[minmax(0,120px)_1fr_28px] items-center gap-3 sm:grid-cols-[minmax(0,160px)_1fr_32px]">
          <span className="truncate text-body text-ink-800">{i.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden>
            <span className="block h-full rounded-full bg-teal-600" style={{ width: `${(i.count / top) * 100}%` }} />
          </span>
          <span className="text-right text-small text-ink-600 tabular">{i.count}</span>
        </li>
      ))}
    </ul>
  )
}

export function CompanyInsights({ data }) {
  const top = data.sequences[0]
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2">What students reported</h2>
        <ProvenanceLabel n={data.n} />
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 md:grid-cols-4">
        <InsightStat label="Experiences" value={data.n} sub={`${formatMonth(data.first_month)} – ${formatMonth(data.latest_month)}`} />
        <InsightStat label="Avg difficulty" value={data.avg_difficulty} sub={DIFFICULTY_LABELS[Math.round(data.avg_difficulty)]} />
        <InsightStat
          label="Reported selected"
          value={data.disclosed ? `${data.selected} of ${data.disclosed}` : '—'}
          sub="who shared an outcome"
          tip="Counts only experiences that disclosed a final outcome. This is not an official selection rate."
        />
        <InsightStat label="Latest interview" value={formatMonth(data.latest_month)} />
      </dl>

      <section aria-labelledby="process-h" className="rounded-lg border border-ink-200 bg-white p-5">
        <h3 id="process-h" className="text-h3">Typical process</h3>
        <p className="mt-0.5 text-small text-ink-500">Most common sequence, seen in {top.count} of {data.n} experiences</p>
        <RoundPipeline steps={top.steps} size="md" className="mt-4" withTooltips={false} />
        {data.sequences.length > 1 && (
          <div className="mt-5 border-t border-ink-100 pt-4">
            <p className="mb-2 text-small font-medium text-ink-700">Other sequences seen</p>
            <ul className="space-y-2">
              {data.sequences.slice(1, 4).map((s) => (
                <li key={s.steps.join('>')} className="flex flex-wrap items-center gap-3">
                  <RoundPipeline steps={s.steps} withTooltips={false} />
                  <span className="text-small text-ink-500 tabular">×{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="topics-h" className="rounded-lg border border-ink-200 bg-white p-5">
          <h3 id="topics-h" className="mb-4 text-h3">Most reported topics</h3>
          <BarList label="Topics by number of experiences" max={data.n} items={data.topics.map((t) => ({ key: t.topic.value, label: t.topic.label, count: t.count }))} />
        </section>
        <section aria-labelledby="rounds-h" className="rounded-lg border border-ink-200 bg-white p-5">
          <h3 id="rounds-h" className="mb-4 text-h3">Rounds by type</h3>
          <BarList label="Rounds by type" items={data.rounds.map((r) => ({ key: r.type, label: ROUND[r.type]?.label, count: r.count }))} />
          <h3 className="mb-3 mt-6 text-body font-semibold text-ink-900">Experiences by batch</h3>
          <div className="flex items-end gap-3" aria-label="Experiences by batch">
            {data.batches.map((b) => {
              const max = Math.max(...data.batches.map((x) => x.count))
              return (
                <div key={b.year} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-caption text-ink-600 tabular">{b.count}</span>
                  <span className="w-full max-w-10 rounded-t-sm bg-ink-300" style={{ height: `${8 + (b.count / max) * 56}px` }} aria-hidden />
                  <span className="text-caption text-ink-500">{batchLabel(b.year)}</span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
