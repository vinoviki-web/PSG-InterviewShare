import { useEffect, useState } from 'react'
import { Controller } from 'react-hook-form'
import { Check, CloudOff, LoaderCircle, Lightbulb, CircleDashed, PencilLine, CircleAlert } from 'lucide-react'
import { Field, ProgressBar } from '@/components/ui'
import { cn, timeAgo } from '@/lib/utils'
import { STEPS } from './schema'

export const fieldId = (name) => `f-${String(name).replace(/\./g, '-')}`

/** Controller + Field: label, hint, error and aria wiring for any control. */
export function CField({ name, label, hint, optional, counter, render, className, id }) {
  return (
    <Controller
      name={name}
      render={({ field, fieldState }) => (
        <Field
          id={id ?? fieldId(name)}
          label={label}
          hint={hint}
          optional={optional}
          error={fieldState.error?.message}
          counter={typeof counter === 'function' ? counter(field.value) : counter}
          className={className}
        >
          {render(field, fieldState)}
        </Field>
      )}
    />
  )
}

/** Error with no single control (array-level errors, checkboxes). Focusable target for "first error". */
export function InlineError({ message, id, className }) {
  if (!message) return null
  return (
    <p id={id} data-invalid="true" tabIndex={-1} role="alert" className={cn('flex items-start gap-1.5 text-small text-danger-600 outline-none', className)}>
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

export function FormSection({ title, description, children, className, action }) {
  return (
    <section className={cn('space-y-5', className)}>
      {(title || description) && (
        <div className="flex items-end justify-between gap-4">
          <div>
            {title && <h3 className="text-body-lg font-semibold text-ink-900">{title}</h3>}
            {description && <p className="mt-0.5 text-small text-ink-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** After a failed validation: scroll to and focus the first invalid control in DOM order. */
export function focusFirstError(root, attempt = 0) {
  setTimeout(() => {
    const scope = root ?? document
    const el = scope.querySelector('[aria-invalid="true"], [data-invalid="true"]')
    if (!el) return
    // A collapsed round card is still opening (inert until its state updates): retry briefly.
    if (el.closest('[inert]')) {
      if (attempt < 8) focusFirstError(root, attempt + 1)
      return
    }
    const focusable = 'input:not([type=hidden]), textarea, button, [tabindex]'
    const target = el.matches(focusable) ? el : el.querySelector(focusable) ?? el
    el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' })
    target.focus({ preventScroll: true })
  }, attempt ? 60 : 80)
}

/* ---------------- Step rail (≥ lg) ---------------- */
const TIPS = [
  ['Use the role title from the job post, e.g. “Graduate Engineer Trainee” or “SDE Intern”.', 'Pick the domain of the role, so juniors in that field can find it.', 'Department and batch help readers judge how relevant this is.'],
  ['Add rounds in the order they happened, even the short ones.', 'Write questions the way they were asked.', 'Skip test content you agreed not to share.'],
  ['Specific beats general: “6 weeks of power-systems numericals” helps more than “practised a lot”.', 'Only link resources you actually used.'],
  ['Not selected? Your experience is just as valuable. Juniors learn most from what went wrong.', 'Anonymous experiences still show your batch.'],
  ['Read it once as a junior would. Is anything unclear?', 'You can edit it after publishing.'],
]

export function StepRail({ step, maxStep, onGo }) {
  return (
    <div className="sticky top-24 space-y-8">
      <nav aria-label="Steps">
        <ol className="space-y-1">
          {STEPS.map((s, i) => {
            const n = i + 1
            const current = n === step
            const done = n < step || (n <= maxStep && n !== step)
            const reachable = n <= maxStep && !current
            const inner = (
              <>
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold tabular transition-colors duration-[180ms]',
                    current && 'bg-ink-900 text-white',
                    !current && done && 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
                    !current && !done && 'bg-white text-ink-500 ring-1 ring-ink-300',
                  )}
                  aria-hidden
                >
                  {done && !current ? <Check className="size-3.5" strokeWidth={2.5} /> : n}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-body font-medium', current ? 'text-ink-900' : done ? 'text-ink-700' : 'text-ink-500')}>{s.title}</span>
                </span>
                <span className="sr-only">{current ? ' (current step)' : done ? ' (completed)' : ' (not started)'}</span>
              </>
            )
            return (
              <li key={s.id}>
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => onGo(n)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-[120ms] hover:bg-ink-100"
                  >
                    {inner}
                  </button>
                ) : (
                  <div aria-current={current ? 'step' : undefined} className={cn('flex items-center gap-3 rounded-md px-2 py-2', current && 'bg-white shadow-xs ring-1 ring-ink-200')}>
                    {inner}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <aside className="rounded-lg border border-ink-200 bg-white/60 p-4" aria-label="Tips">
        <p className="flex items-center gap-1.5 text-caption font-medium uppercase tracking-wider text-ink-500">
          <Lightbulb className="size-3.5" aria-hidden /> Tips for a great experience
        </p>
        <ul key={step} className="mt-3 space-y-2.5 animate-fade-in">
          {TIPS[step - 1].map((t) => (
            <li key={t} className="flex gap-2 text-small text-ink-600">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-400" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

/* ---------------- Mobile progress (< lg) ---------------- */
export function MobileProgress({ step }) {
  return (
    <div className="space-y-2 lg:hidden">
      <p className="text-small text-ink-600">
        <span className="font-medium text-ink-900">Step {step} of {STEPS.length}</span>
        <span className="text-ink-300" aria-hidden> · </span>
        {STEPS[step - 1].title}
      </p>
      <ProgressBar value={step} max={STEPS.length} label={`Step ${step} of ${STEPS.length}`} />
    </div>
  )
}

/* ---------------- Autosave indicator ---------------- */
function useNow(ms = 30000) {
  const [, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

export function AutosaveIndicator({ status, savedAt, className }) {
  useNow()
  const map = {
    idle: { icon: CircleDashed, text: 'Saves automatically', tone: 'text-ink-500' },
    saving: { icon: LoaderCircle, text: 'Saving…', tone: 'text-ink-500', spin: true },
    saved: { icon: Check, text: `Saved · ${savedAt ? timeAgo(savedAt) : 'just now'}`, tone: 'text-ink-500' },
    offline: { icon: CloudOff, text: 'Offline, saved on this device', tone: 'text-warning-600' },
    'edit-clean': { icon: PencilLine, text: 'Editing published experience', tone: 'text-ink-500' },
    'edit-dirty': { icon: PencilLine, text: 'Unpublished changes', tone: 'text-warning-600' },
  }
  const s = map[status] ?? map.idle
  const Icon = s.icon
  return (
    <p className={cn('inline-flex min-w-0 items-center gap-1.5 text-small', s.tone, className)}>
      <Icon className={cn('size-3.5 shrink-0', s.spin && 'animate-spin')} aria-hidden />
      <span className="truncate">{s.text}</span>
    </p>
  )
}
