import { useMemo } from 'react'
import { useWatch } from 'react-hook-form'
import { Check, CircleAlert, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { ExperienceArticle } from '@/components/experience/ExperienceArticle'
import { cn } from '@/lib/utils'
import { FULL_SCHEMA, STEPS, stepOfPath } from '../schema'
import { toPreview } from '../preview'
import { fieldId } from '../parts'
import { roundAnchor } from '../RoundBuilder'

const listJoin = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

function checklist(v) {
  const items = []
  const noQ = v.rounds.map((r, i) => ({ r, i })).filter(({ r }) => !r.questions.some((q) => q.body.trim()))
  items.push(
    noQ.length === 0
      ? { done: true, label: 'Questions added to every round' }
      : {
          done: false,
          label: `Add questions to ${noQ.length === 1 ? 'Round' : 'Rounds'} ${listJoin(noQ.map(({ i }) => i + 1))}`,
          hint: 'Even one question per round helps juniors prepare.',
          step: 2,
          target: { round: noQ[0].i, focus: `${roundAnchor(noQ[0].r.id)}-addq` },
        },
  )
  items.push(
    v.topics.length
      ? { done: true, label: `${v.topics.length} ${v.topics.length === 1 ? 'topic' : 'topics'} tagged` }
      : { done: false, label: 'Add topics so juniors can find this by subject', step: 3, target: { focus: fieldId('topics') } },
  )
  items.push(
    v.preparation.trim()
      ? { done: true, label: 'Preparation strategy written' }
      : { done: false, label: 'Preparation is empty: say how long you prepared and what you focused on', step: 3, target: { focus: fieldId('preparation') } },
  )
  items.push(
    v.advice.trim()
      ? { done: true, label: 'Advice for juniors written' }
      : { done: false, label: 'Advice is empty: juniors value this most', step: 4, target: { focus: fieldId('advice') } },
  )
  items.push(
    v.resources.length
      ? { done: true, label: 'Resources linked' }
      : { done: false, label: 'Link a resource or two you actually used', step: 3, target: { focus: 'add-resource' }, optional: true },
  )
  return items
}

export function ReviewStep({ user, companies, draftId, mode, updatedAt, onEdit, serverError }) {
  const values = useWatch()
  const issues = useMemo(() => {
    const r = FULL_SCHEMA.safeParse(values)
    if (r.success) return []
    const seen = new Set()
    return r.error.issues
      .map((i) => ({ path: i.path.join('.'), message: i.message, step: stepOfPath(i.path.join('.')) }))
      .filter((i) => (seen.has(i.path) ? false : seen.add(i.path)))
      .sort((a, b) => a.step - b.step)
  }, [values])
  const items = useMemo(() => checklist(values), [values])
  const preview = useMemo(
    () => toPreview(values, { user, id: draftId, companies, edited: mode === 'edit', updatedAt: mode === 'edit' ? new Date().toISOString() : updatedAt }),
    [values, user, draftId, companies, mode, updatedAt],
  )
  const done = items.filter((i) => i.done).length

  return (
    <div className="space-y-8">
      {serverError && (
        <div id="server-error" className="rounded-lg border border-danger-200 bg-danger-50 p-4 outline-none sm:p-5" role="alert" tabIndex={-1}>
          <p className="flex items-start gap-2 text-body font-medium text-ink-900">
            <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-danger-600" aria-hidden />
            {serverError.message}
          </p>
          {serverError.fields?.length > 0 && (
            <ul className="mt-3 space-y-1.5 pl-[26px]">
              {serverError.fields.map((f) => (
                <li key={f.path} className="flex items-start justify-between gap-3 text-small">
                  <span className="text-ink-700">
                    <span className="font-medium text-ink-900">{STEPS[f.step - 1].title}:</span> {f.message}
                  </span>
                  <button type="button" onClick={() => onEdit(f.step, { path: f.path === 'company' ? 'company' : f.path })} className="shrink-0 font-medium text-teal-700 hover:underline">
                    Fix
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <section id="publish-issues" tabIndex={-1} className="rounded-lg border border-danger-200 bg-danger-50 p-4 outline-none sm:p-5" aria-labelledby="publish-issues-h">
          <h3 id="publish-issues-h" className="flex items-center gap-2 text-body font-semibold text-ink-900">
            <CircleAlert className="size-[18px] text-danger-600" aria-hidden />
            {issues.length === 1 ? '1 thing to fix before publishing' : `${issues.length} things to fix before publishing`}
          </h3>
          <ul className="mt-3 space-y-1.5">
            {issues.slice(0, 6).map((i) => (
              <li key={i.path} className="flex items-start justify-between gap-3 text-small">
                <span className="text-ink-700">
                  <span className="font-medium text-ink-900">{STEPS[i.step - 1].title}:</span> {i.message}
                </span>
                <button type="button" onClick={() => onEdit(i.step, { path: i.path })} className="shrink-0 font-medium text-teal-700 hover:underline">
                  Fix
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="checklist-h" className="rounded-lg border border-ink-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3 sm:px-5">
          <h3 id="checklist-h" className="text-body font-semibold text-ink-900">Make it more useful</h3>
          <span className="text-small text-ink-500 tabular">
            {done} of {items.length} done
          </span>
        </div>
        <ul className="divide-y divide-ink-100">
          {items.map((it) => (
            <li key={it.label} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span
                className={cn(
                  'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full',
                  it.done ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' : 'border border-dashed border-ink-300',
                )}
                aria-hidden
              >
                {it.done && <Check className="size-3" strokeWidth={2.75} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-body', it.done ? 'text-ink-600' : 'text-ink-900')}>
                  {it.label}
                  {it.optional && <span className="text-ink-500"> (optional)</span>}
                  <span className="sr-only">{it.done ? ' (done)' : ' (suggested)'}</span>
                </span>
                {it.hint && <span className="block text-small text-ink-500">{it.hint}</span>}
              </span>
              {!it.done && (
                <button
                  type="button"
                  onClick={() => onEdit(it.step, it.target)}
                  className="inline-flex shrink-0 items-center gap-1 text-small font-medium text-teal-700 hover:underline"
                >
                  Edit<span className="sr-only">: {it.label}</span>
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="preview-h">
        <div
          className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm"
          onClickCapture={(e) => {
            // Preview is read-only: links would leave the wizard.
            if (e.target.closest('a')) e.preventDefault()
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-ink-200 bg-ink-50 px-4 py-2.5 sm:px-5">
            <h3 id="preview-h" className="flex items-center gap-1.5 text-small font-medium text-ink-700">
              <Eye className="size-4 text-ink-500" aria-hidden />
              Preview: exactly how readers will see it
            </h3>
            {values.is_anonymous && (
              <p className="flex items-center gap-1.5 text-small text-ink-600">
                <EyeOff className="size-4 text-ink-500" aria-hidden />
                Posting anonymously
              </p>
            )}
          </div>
          <div className="px-4 py-6 sm:px-8 sm:py-8">
            <ExperienceArticle exp={preview} />
          </div>
        </div>
      </section>
    </div>
  )
}
