import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, Copy, ArrowRight, Plus, FileText, Clock3, MonitorSmartphone } from 'lucide-react'
import { Button, Dialog, Input, Field, CompanyLogo, Skeleton } from '@/components/ui'
import { LIMITS, TOTAL_STEPS } from '@/api/drafts'
import { STEPS } from './schema'
import { batchLabel, timeAgo } from '@/lib/utils'

/* ---------------- Duplicate check (after Step 1) ---------------- */
export function DuplicateDialog({ duplicate, onOpenChange, onEditExisting, onDifferent }) {
  const [step, setStep] = useState('ask')
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  useEffect(() => {
    if (duplicate) {
      setStep('ask')
      setReason('')
      setError(null)
    }
  }, [duplicate])
  if (!duplicate) return null
  const isDraft = duplicate.status === 'draft'
  const what = `${duplicate.company_name} ${duplicate.role_title} (${batchLabel(duplicate.graduation_year)})`
  const confirm = () => {
    const r = reason.trim()
    if (r.length < LIMITS.duplicate_reason[0]) return setError('Add a few words so moderators know this isn’t a duplicate.')
    onDifferent(r)
  }
  return (
    <Dialog
      open={!!duplicate}
      onOpenChange={onOpenChange}
      size="sm"
      title={isDraft ? 'Continue your existing draft?' : 'Edit your existing experience?'}
      description={isDraft ? `You already started a draft for ${what}.` : `You already shared an experience for ${what}.`}
      footer={
        step === 'ask' ? (
          <>
            <Button variant="secondary" onClick={() => setStep('reason')}>
              This is a different interview
            </Button>
            <Button onClick={onEditExisting}>{isDraft ? 'Continue draft' : 'Edit existing'}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep('ask')}>
              Back
            </Button>
            <Button onClick={confirm}>Continue with this one</Button>
          </>
        )
      }
    >
      {step === 'ask' ? (
        <p className="text-body text-ink-600">One experience per interview keeps things easy to find. If you interviewed again, for example off-campus or for a different team, you can continue here.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            confirm()
          }}
          className="animate-fade-in"
        >
          <Field label="What was different?" hint="One line, e.g. “Off-campus drive in March, different team”. Only moderators see this." error={error}>
            <Input
              autoFocus
              value={reason}
              maxLength={LIMITS.duplicate_reason[1]}
              onChange={(e) => {
                setReason(e.target.value)
                setError(null)
              }}
            />
          </Field>
        </form>
      )}
    </Dialog>
  )
}

/* ---------------- Success ---------------- */
export function SuccessScreen({ result, mode, company, role, onShareAnother }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/experiences/${result.id}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const t = document.createElement('textarea')
      t.value = url
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const updated = mode === 'edit'
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-[560px] items-center px-4 py-12">
      <div className="w-full text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-success-50 text-success-600 ring-8 ring-success-50/50 animate-pop">
          <Check className="size-7" strokeWidth={2.25} aria-hidden />
        </span>
        <h1 tabIndex={-1} id="success-h" className="mt-6 text-h1 outline-none">
          {updated ? 'Updated' : 'Published'}
        </h1>
        <p className="mt-2 text-body-lg text-ink-600">
          {updated ? 'Your changes are live.' : 'Thank you, this will help a lot of juniors.'}
        </p>

        <div className="mx-auto mt-8 flex max-w-[420px] items-center gap-3 rounded-lg border border-ink-200 bg-white p-3 text-left shadow-xs">
          <CompanyLogo name={company} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink-900">{role}</p>
            <p className="truncate text-small text-ink-500">{company}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button variant="secondary" onClick={copy} aria-live="polite">
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button asChild>
            <Link to={`/experiences/${result.id}`}>
              View experience <ArrowRight />
            </Link>
          </Button>
        </div>

        {!updated && (
          <div className="mt-10 border-t border-ink-200 pt-6">
            <p className="text-body text-ink-600">Interviewed for an internship and a PPO, or with another company?</p>
            <Button variant="ghost" className="mt-2 text-teal-700!" onClick={onShareAnother}>
              <Plus /> Share another
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- Entry gate: continue a draft or start new ---------------- */
export function DraftGate({ drafts, local, onContinue, onContinueLocal, onStartNew }) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:py-16">
      <span className="inline-flex size-11 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 shadow-xs">
        <FileText className="size-5" aria-hidden />
      </span>
      <h1 className="mt-5 text-h1">Continue your draft?</h1>
      <p className="mt-1.5 text-body-lg text-ink-600">Pick up where you left off, or start a new experience. Drafts are kept for 90 days.</p>
      <ul className="mt-8 space-y-2">
        {local && (
          <li>
            <DraftRow
              title={local.company ?? 'Untitled draft'}
              subtitle={local.role || 'No role yet'}
              meta={`Step ${local.step} of ${TOTAL_STEPS} · on this device, not synced yet`}
              onClick={onContinueLocal}
            />
          </li>
        )}
        {drafts.slice(0, 3).map((d) => (
          <li key={d.id}>
            <DraftRow
              title={d.company_name ?? 'Untitled draft'}
              subtitle={d.role_title ?? 'No role yet'}
              meta={`Step ${d.draft_step} of ${d.total_steps} · ${STEPS[d.draft_step - 1]?.title} · saved ${timeAgo(d.updated_at)}`}
              onClick={() => onContinue(d.id)}
            />
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-200" aria-hidden />
        <span className="text-caption text-ink-500">or</span>
        <span className="h-px flex-1 bg-ink-200" aria-hidden />
      </div>
      <Button variant="secondary" size="lg" className="mt-6 w-full" onClick={onStartNew}>
        <Plus /> Start a new experience
      </Button>
    </div>
  )
}

function DraftRow({ title, subtitle, meta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3.5 rounded-lg border border-ink-200 bg-white p-3.5 text-left shadow-xs transition-[border-color,box-shadow] duration-[120ms] hover:border-ink-300 hover:shadow-sm"
    >
      <CompanyLogo name={title} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold text-ink-900">
          {title}
          <span className="font-normal text-ink-500"> · </span>
          <span className="font-medium text-ink-700">{subtitle}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-small text-ink-500">
          <Clock3 className="size-3.5 shrink-0" aria-hidden />
          {meta}
        </span>
      </span>
      <span className="hidden shrink-0 text-small font-medium text-teal-700 group-hover:underline sm:inline">Continue</span>
      <ArrowRight className="size-4 shrink-0 text-ink-500 transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-teal-700" aria-hidden />
    </button>
  )
}

/* ---------------- Device copy is newer than the server copy ---------------- */
export function ConflictPrompt({ localAt, serverAt, onKeepLocal, onUseServer }) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:py-16">
      <span className="inline-flex size-11 items-center justify-center rounded-xl border border-warning-200 bg-warning-50 text-warning-600 shadow-xs">
        <MonitorSmartphone className="size-5" aria-hidden />
      </span>
      <h1 className="mt-5 text-h1">This device has newer changes</h1>
      <p className="mt-1.5 text-body-lg text-ink-600">
        Changes made here {timeAgo(localAt)} never reached the server. The saved version is from {timeAgo(serverAt)}.
      </p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onKeepLocal}>Keep this device’s version</Button>
        <Button variant="secondary" onClick={onUseServer}>
          Use saved version
        </Button>
      </div>
    </div>
  )
}

/* ---------------- Loading skeleton (matches the wizard layout) ---------------- */
export function WizardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-8 pt-6 sm:px-5 lg:max-w-[988px] lg:pt-8" aria-busy aria-label="Loading">
      <div className="mb-8 flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,720px)] lg:gap-12">
        <div className="hidden space-y-3 lg:block">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-1.5">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="space-y-6 md:rounded-xl md:border md:border-ink-200 md:bg-white md:p-8">
          <Skeleton className="h-3 w-20 lg:hidden" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
