import { useMemo, useState } from 'react'
import { useFormState, useWatch } from 'react-hook-form'
import { ChevronDown, GraduationCap } from 'lucide-react'
import { Input, Textarea, CharCount, Segmented, TagPicker } from '@/components/ui'
import { DEPARTMENTS } from '@/mocks/lookups'
import { LIMITS } from '@/api/drafts'
import { cn } from '@/lib/utils'
import { CField, FormSection } from '../parts'
import { RoundBuilder } from '../RoundBuilder'

const BACKLOG_OPTIONS = [
  { value: 'no', label: 'Not allowed' },
  { value: 'yes', label: 'Allowed' },
  { value: 'unknown', label: 'Not sure' },
]

function eligibilitySummary(el) {
  if (!el) return null
  const parts = []
  if (el.cgpa?.trim()) parts.push(`CGPA ${el.cgpa}+`)
  if (el.branches?.length) parts.push(`${el.branches.length} department${el.branches.length > 1 ? 's' : ''}`)
  if (el.backlogs === 'no') parts.push('no backlogs')
  if (el.backlogs === 'yes') parts.push('backlogs allowed')
  if (el.other?.trim()) parts.push('notes')
  return parts.length ? parts.join(' · ') : null
}

export function ProcessStep({ announce, openRequest }) {
  const el = useWatch({ name: 'eligibility' })
  const { errors } = useFormState({ name: 'eligibility' })
  const summary = eligibilitySummary(el)
  const [eligOpen, setEligOpen] = useState(!!summary)
  const open = eligOpen || !!errors?.eligibility
  const deptOptions = useMemo(() => DEPARTMENTS.map((d) => ({ value: d.id, label: d.code, group: d.name })), [])

  return (
    <div className="space-y-10">
      <FormSection title="Before the interviews" description="Optional, but juniors often ask about cutoffs and how to apply.">
        <div className="rounded-lg border border-ink-200 bg-white">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="eligibility-body"
            onClick={() => setEligOpen(!open)}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors duration-[120ms] hover:bg-ink-25"
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-600" aria-hidden>
              <GraduationCap className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink-900">
                Eligibility <span className="font-normal text-ink-500">(optional)</span>
              </span>
              <span className="block truncate text-small text-ink-500">{summary ?? 'CGPA cutoff, departments, backlogs'}</span>
            </span>
            <ChevronDown className={cn('size-4 text-ink-500 transition-transform duration-[180ms]', open && 'rotate-180')} aria-hidden />
          </button>
          {open && (
            <div id="eligibility-body" className="space-y-5 border-t border-ink-200 px-4 pb-5 pt-4 animate-fade-in">
              <div className="grid gap-5 sm:grid-cols-[140px_minmax(0,1fr)]">
                <CField
                  name="eligibility.cgpa"
                  label="CGPA cutoff"
                  render={(field) => <Input {...field} inputMode="decimal" placeholder="e.g. 7.5" />}
                />
                <CField
                  name="eligibility.backlogs"
                  label="Active backlogs"
                  render={(field) => <Segmented ref={field.ref} value={field.value} onValueChange={field.onChange} options={BACKLOG_OPTIONS} className="sm:self-start" />}
                />
              </div>
              <CField
                name="eligibility.branches"
                label="Eligible departments"
                render={(field) => <TagPicker ref={field.ref} options={deptOptions} value={field.value} onChange={field.onChange} max={30} placeholder="Add departments, e.g. CSE" />}
              />
              <CField
                name="eligibility.other"
                label="Anything else"
                counter={(v) => <CharCount value={v ?? ''} max={LIMITS.eligibility_other} />}
                render={(field) => <Input {...field} placeholder="e.g. No gap years, 60% in 10th and 12th" />}
              />
            </div>
          )}
        </div>

        <CField
          name="application_process"
          label="How did you apply?"
          optional
          hint="Portal, referral, resume shortlist… anything that helps juniors get to round 1."
          counter={(v) => <CharCount value={v ?? ''} max={LIMITS.application_process} />}
          render={(field) => <Textarea {...field} minRows={3} placeholder="e.g. Registered on the placement portal. About 400 applied; 120 were shortlisted on CGPA for the OA." />}
        />
      </FormSection>

      <FormSection title="Rounds" description="Add each round in the order it happened.">
        <RoundBuilder announce={announce} openRequest={openRequest} />
      </FormSection>
    </div>
  )
}
