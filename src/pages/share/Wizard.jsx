import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useBlocker } from 'react-router'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, MoreHorizontal, Trash2, Send } from 'lucide-react'
import { Button, IconButton, ConfirmDialog, Menu, MenuTrigger, MenuContent, MenuItem, useToast } from '@/components/ui'
import { checkDuplicate, deleteDraft, publishExperience } from '@/api/drafts'
import { cn } from '@/lib/utils'
import { STEPS, STEP_SCHEMAS, duplicateKey, toPayload, stepOfPath } from './schema'
import { useAutosave } from './useAutosave'
import { AutosaveIndicator, MobileProgress, StepRail, fieldId, focusFirstError } from './parts'
import { DuplicateDialog, SuccessScreen } from './Screens'
import { BasicsStep } from './steps/BasicsStep'
import { ProcessStep } from './steps/ProcessStep'
import { PrepStep } from './steps/PrepStep'
import { OutcomeStep } from './steps/OutcomeStep'
import { ReviewStep } from './steps/ReviewStep'

const focusable = 'input:not([type=hidden]), textarea, button, [tabindex]'
function focusElementById(id) {
  const el = id && document.getElementById(id)
  if (!el) return false
  const target = el.matches(focusable) ? el : el.querySelector(focusable) ?? el
  el.scrollIntoView({ block: 'center' })
  target.focus({ preventScroll: true })
  return true
}

/**
 * The share wizard (spec §9.9). `mode`: 'draft' (new or resumed draft) or
 * 'edit' (published experience; autosave stays local until Update).
 */
export function Wizard({ mode, draftId: initialDraftId, initialValues, initialStep = 1, initialMaxStep = 1, updatedAt, companies, config, user, onShareAnother, syncOnMount = false }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const [step, setStep] = useState(initialStep)
  const [maxStep, setMaxStep] = useState(Math.max(initialMaxStep, initialStep))
  const stepRef = useRef(step)
  const maxStepRef = useRef(maxStep)

  const resolvers = useMemo(() => STEP_SCHEMAS.map((s) => zodResolver(s)), [])
  const form = useForm({
    defaultValues: initialValues,
    resolver: (values, ctx, opts) => resolvers[stepRef.current - 1](values, ctx, opts),
    // Validation runs on Continue / Publish only (spec §4). After a failed
    // attempt, errored fields re-validate live as they're fixed (see below).
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  })

  const attempted = useRef(false)
  useEffect(() => {
    const sub = form.watch((_, { name }) => {
      if (!attempted.current || !name) return
      // Read the live store: Wizard doesn't subscribe to errors, so its formState snapshot is stale.
      const paths = errorPaths(form.control._formState.errors)
      if (paths.length) form.trigger(paths)
    })
    return () => sub.unsubscribe()
  }, [form])

  const [draftId, setDraftId] = useState(initialDraftId ?? null)
  const syncUrl = useCallback(
    (id, s) => {
      if (!id) return
      const url = mode === 'edit' ? `/share/${id}?edit=1&step=${s}` : `/share/${id}?step=${s}`
      // The router doesn't need to know: same screen, and remounting would lose focus.
      window.history.replaceState(window.history.state, '', url)
    },
    [mode],
  )
  const onCreated = useCallback(
    (id) => {
      setDraftId(id)
      syncUrl(id, stepRef.current)
    },
    [syncUrl],
  )
  const autosave = useAutosave({ form, mode, initialId: initialDraftId, initialSavedAt: updatedAt, stepRef, maxStepRef, onCreated })
  const { flush, hasUnsynced, stop } = autosave

  // Restored from this device's copy: push it to the server straight away.
  useEffect(() => {
    if (syncOnMount) flush({ force: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep focused fields clear of the sticky top nav and the sticky footer.
  useEffect(() => {
    const el = document.documentElement
    const prev = [el.style.scrollPaddingTop, el.style.scrollPaddingBottom]
    el.style.scrollPaddingTop = '88px'
    el.style.scrollPaddingBottom = '96px'
    return () => {
      el.style.scrollPaddingTop = prev[0]
      el.style.scrollPaddingBottom = prev[1]
    }
  }, [])

  /* ---------- Live announcements ---------- */
  const [live, setLive] = useState('')
  const announce = useCallback((msg) => {
    setLive('')
    requestAnimationFrame(() => setLive(msg))
  }, [])

  /* ---------- Step navigation ---------- */
  const formRef = useRef(null)
  const headingRef = useRef(null)
  const pending = useRef(null)
  const [openRequest, setOpenRequest] = useState(null)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      syncUrl(draftId, step)
      return
    }
    window.scrollTo({ top: 0 })
    announce(`Step ${step} of ${STEPS.length}, ${STEPS[step - 1].title}`)
    const target = pending.current
    pending.current = null
    const t = setTimeout(async () => {
      if (target?.validate) {
        attempted.current = true
        await form.trigger()
      }
      if (target?.focus && focusElementById(target.focus)) return
      headingRef.current?.focus({ preventScroll: true })
    }, target ? 240 : 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const goTo = useCallback(
    (n, target) => {
      form.clearErrors()
      attempted.current = false
      if (target) {
        const path = target.path
        const roundIdx = target.round ?? (path?.startsWith('rounds.') ? Number(path.split('.')[1]) : null)
        if (roundIdx != null && !Number.isNaN(roundIdx)) setOpenRequest({ index: roundIdx, at: Date.now() })
        pending.current = { focus: target.focus ?? (path ? fieldId(path) : null), validate: !!path }
      }
      stepRef.current = n
      if (n > maxStepRef.current) {
        maxStepRef.current = n
        setMaxStep(n)
      }
      setStep(n)
      syncUrl(draftId, n)
      flush({ force: true })
    },
    [form, flush, syncUrl, draftId],
  )

  const [checking, setChecking] = useState(false)
  const [duplicate, setDuplicate] = useState(null)

  const runDuplicateCheck = async () => {
    if (mode === 'edit') return false
    const v = form.getValues()
    if (!v.company?.slug || v.company.is_new) return false
    const key = duplicateKey(v)
    if (v.duplicate_key === key) return false
    setChecking(true)
    try {
      const dup = await checkDuplicate({
        company_slug: v.company.slug,
        role_title: v.role_title,
        opportunity_type: v.opportunity_type,
        graduation_year: Number(v.graduation_year),
        excludeId: autosave.draftId(),
      })
      if (dup) {
        setDuplicate({ ...dup, key })
        return true
      }
    } catch {
      /* non-blocking: if the check fails, carry on */
    } finally {
      setChecking(false)
    }
    return false
  }

  const goNext = async () => {
    if (step === 3) {
      const res = form.getValues('resources')
      const kept = res.filter((r) => r.title.trim() || r.url.trim())
      if (kept.length !== res.length) form.setValue('resources', kept)
    }
    const ok = await form.trigger()
    if (!ok) {
      attempted.current = true
      announce('Some fields need attention.')
      focusFirstError(formRef.current)
      return
    }
    if (step === 1 && (await runDuplicateCheck())) return
    goTo(step + 1)
  }

  const goBack = () => step > 1 && goTo(step - 1)

  const goToFromRail = async (n) => {
    if (n > step) {
      const ok = await form.trigger()
      if (!ok) {
        attempted.current = true
        announce('Some fields need attention.')
        focusFirstError(formRef.current)
        return
      }
    }
    goTo(n)
  }

  /* ---------- Publish / update ---------- */
  const [publishing, setPublishing] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [result, setResult] = useState(null)

  const publish = async () => {
    setServerError(null)
    const ok = await form.trigger()
    if (!ok) {
      attempted.current = true
      announce('Fix the highlighted items before publishing.')
      setTimeout(() => focusElementById('publish-issues'), 50)
      return
    }
    setPublishing(true)
    try {
      let id = autosave.draftId()
      if (mode === 'draft') {
        await flush({ force: true })
        id = autosave.draftId()
        if (!id) throw Object.assign(new Error('offline'), { code: 'network' })
      }
      const res = await publishExperience(id, toPayload(form.getValues()))
      stop()
      allowLeave.current = true
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['experiences'] }),
        qc.invalidateQueries({ queryKey: ['drafts'] }),
        qc.invalidateQueries({ queryKey: ['experience', id] }),
        res.created_company && qc.invalidateQueries({ queryKey: ['companies'] }),
      ])
      setResult(res)
      // A refresh of the success screen shouldn't reopen the editor.
      window.history.replaceState(window.history.state, '', '/share')
      window.scrollTo({ top: 0 })
      requestAnimationFrame(() => document.getElementById('success-h')?.focus())
    } catch (err) {
      if (err.code === 'validation' && err.fields) {
        setServerError({
          message: err.message,
          fields: Object.entries(err.fields).map(([path, message]) => ({ path, message, step: stepOfPath(path) })),
        })
      } else if (err.code === 'rate_limited') {
        setServerError({ message: err.message })
      } else {
        setServerError({ message: 'Couldn’t publish. Check your connection and try again. Your draft is saved on this device.' })
      }
      setTimeout(() => focusElementById('server-error'), 50)
    } finally {
      setPublishing(false)
    }
  }

  /* ---------- Leaving ---------- */
  const allowLeave = useRef(false)
  const [exiting, setExiting] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const blocker = useBlocker(
    useCallback(({ currentLocation, nextLocation }) => !allowLeave.current && hasUnsynced() && currentLocation.pathname !== nextLocation.pathname, [hasUnsynced]),
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (mode === 'edit') return setLeaveOpen(true)
    let cancelled = false
    flush({ force: true }).then((ok) => {
      if (cancelled) return
      if (ok) blocker.proceed()
      else setLeaveOpen(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (allowLeave.current || !hasUnsynced()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasUnsynced])

  const saveAndExit = async () => {
    if (mode === 'edit') return navigate(`/experiences/${draftId}`)
    setExiting(true)
    const ok = await flush({ force: true })
    setExiting(false)
    allowLeave.current = true
    if (autosave.draftId()) {
      if (ok) toast.success('Draft saved. Pick it up any time from Home or your profile.')
      else toast.info('Saved on this device. It’ll sync next time you’re online.')
      navigate('/me?tab=drafts')
    } else navigate('/home')
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await deleteDraft(autosave.draftId())
      stop()
      allowLeave.current = true
      qc.invalidateQueries({ queryKey: ['drafts'] })
      toast.success('Draft deleted.')
      navigate('/home')
    } catch {
      toast.error('Couldn’t delete the draft. Try again.')
      setDeleting(false)
    }
  }

  /* ---------- Render ---------- */
  if (result) {
    const v = form.getValues()
    return (
      <SuccessScreen
        result={result}
        mode={mode}
        company={result.created_company?.name ?? v.company?.name ?? ''}
        role={v.role_title}
        onShareAnother={onShareAnother}
      />
    )
  }

  const meta = STEPS[step - 1]
  const isLast = step === STEPS.length
  const status = autosave.status

  return (
    <FormProvider {...form}>
      <div className="mx-auto w-full max-w-[720px] px-4 pt-5 sm:px-5 lg:max-w-[1012px] lg:pt-8">
        <header className="mb-5 flex items-start justify-between gap-3 lg:mb-8">
          <div className="min-w-0">
            <h1 className="text-body-lg font-semibold sm:text-h2 lg:text-h1">{mode === 'edit' ? 'Edit your experience' : 'Share your experience'}</h1>
            <AutosaveIndicator status={status} savedAt={autosave.savedAt} className="mt-0.5 md:hidden" />
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <AutosaveIndicator status={status} savedAt={autosave.savedAt} className="mr-2 hidden md:inline-flex" />
            {mode === 'draft' && draftId && (
              <Menu>
                <MenuTrigger asChild>
                  <IconButton label="More actions" size="sm">
                    <MoreHorizontal />
                  </IconButton>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={Trash2} tone="danger" onSelect={() => setDeleteOpen(true)}>
                    Delete draft
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
            <Button variant="secondary" size="sm" onClick={saveAndExit} loading={exiting}>
              {mode === 'edit' ? 'Cancel' : 'Save & exit'}
            </Button>
          </div>
        </header>

        <div className="lg:grid lg:grid-cols-[220px_minmax(0,720px)] lg:gap-12">
          <div className="hidden lg:block">
            <StepRail step={step} maxStep={maxStep} onGo={goToFromRail} />
          </div>

          <div className="min-w-0">
            <div className="mb-5 lg:hidden">
              <MobileProgress step={step} />
            </div>
            <form
              ref={formRef}
              noValidate
              onSubmit={(e) => e.preventDefault()}
              aria-labelledby="step-heading"
              className="md:rounded-xl md:border md:border-ink-200 md:bg-white md:shadow-xs"
            >
              <div key={step} className="pb-10 animate-step md:px-8 md:pt-8">
                <div className="mb-8">
                  <p className="hidden text-caption font-medium uppercase tracking-wider text-ink-500 lg:block">
                    Step {step} of {STEPS.length}
                  </p>
                  <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-h2 outline-none lg:mt-1">
                    {meta.title}
                  </h2>
                  <p className="mt-1 text-body text-ink-600">{mode === 'edit' && isLast ? 'Check your changes, then update.' : meta.blurb}</p>
                </div>

                {step === 1 && <BasicsStep companies={companies} config={config} />}
                {step === 2 && <ProcessStep announce={announce} openRequest={openRequest} />}
                {step === 3 && <PrepStep announce={announce} />}
                {step === 4 && <OutcomeStep user={user} config={config} />}
                {step === 5 && (
                  <ReviewStep
                    user={user}
                    companies={companies}
                    draftId={draftId}
                    mode={mode}
                    updatedAt={updatedAt}
                    serverError={serverError}
                    onEdit={(n, target) => goTo(n, target)}
                  />
                )}
              </div>

              <div className="pb-safe sticky bottom-0 z-10 -mx-4 border-t border-ink-200 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/85 sm:-mx-5 md:mx-0 md:rounded-b-xl">
                <div className="flex items-center gap-3 px-4 py-3 sm:px-5 md:px-8">
                  {step > 1 ? (
                    <Button variant="secondary" onClick={goBack} className="shrink-0">
                      <ArrowLeft /> Back
                    </Button>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <span className="hidden flex-1 text-center text-small text-ink-500 tabular sm:block lg:invisible">
                    {step} / {STEPS.length}
                  </span>
                  {isLast ? (
                    <Button onClick={publish} loading={publishing} className={cn('flex-1 sm:flex-none')}>
                      {!publishing && <Send />}
                      {mode === 'edit' ? 'Update' : 'Publish'}
                    </Button>
                  ) : (
                    <Button onClick={goNext} loading={checking} className="flex-1 sm:flex-none">
                      {step === 4 ? 'Review' : 'Continue'} {!checking && <ArrowRight />}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </div>
      <OfflineAnnouncer status={status} />

      <DuplicateDialog
        duplicate={duplicate}
        onOpenChange={(o) => !o && setDuplicate(null)}
        onEditExisting={async () => {
          const d = duplicate
          setDuplicate(null)
          await flush({ force: true })
          allowLeave.current = true
          navigate(d.status === 'draft' ? `/share/${d.id}` : `/share/${d.id}?edit=1`)
        }}
        onDifferent={(reason) => {
          const d = duplicate
          form.setValue('duplicate_of', d.id)
          form.setValue('duplicate_reason', reason)
          form.setValue('duplicate_key', d.key)
          setDuplicate(null)
          goTo(2)
        }}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={(o) => {
          setLeaveOpen(o)
          if (!o && blocker.state === 'blocked') blocker.reset()
        }}
        title={mode === 'edit' ? 'Leave without updating?' : 'Leave before your changes sync?'}
        body={
          mode === 'edit'
            ? 'Your edits aren’t live yet. We’ll keep them on this device so you can finish later.'
            : 'Your latest changes couldn’t reach the server. They’re saved on this device and will sync when you come back.'
        }
        confirmLabel="Leave anyway"
        tone="primary"
        onConfirm={() => {
          setLeaveOpen(false)
          allowLeave.current = true
          blocker.state === 'blocked' && blocker.proceed()
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this draft?"
        body="Everything in this draft will be deleted. This can’t be undone."
        confirmLabel="Delete draft"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </FormProvider>
  )
}

/** Leaf error paths in an RHF errors object ('rounds.0.description', 'rounds', …). */
function errorPaths(errors, prefix = '') {
  const out = []
  if (!errors || typeof errors !== 'object') return out
  for (const [k, v] of Object.entries(errors)) {
    if (!v || k === 'ref') continue
    if (k === 'root') {
      if (prefix) out.push(prefix)
      continue
    }
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v.message === 'string' && v.type) out.push(path)
    else out.push(...errorPaths(v, path))
  }
  return out
}

/** Screen-reader notice for the states that matter: first save, offline, back online. */
function OfflineAnnouncer({ status }) {
  const [msg, setMsg] = useState('')
  const prev = useRef(status)
  useEffect(() => {
    const p = prev.current
    prev.current = status
    if (status === 'offline' && p !== 'offline') setMsg('You’re offline. Changes are saved on this device and will sync.')
    else if (status === 'saved' && p === 'offline') setMsg('Back online. Draft saved.')
    else if (status === 'saved' && p === 'saving' && !msg) setMsg('Draft saved.')
  }, [status, msg])
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {msg}
    </div>
  )
}
