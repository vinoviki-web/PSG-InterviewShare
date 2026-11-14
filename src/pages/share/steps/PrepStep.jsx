import { useMemo, useRef } from 'react'
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form'
import { Plus, Trash2, Link2 } from 'lucide-react'
import { Button, IconButton, Input, Textarea, CharCount, Select, TagPicker } from '@/components/ui'
import { topicsForDomain } from '@/lib/taxonomy'
import { RESOURCE_KINDS } from '@/lib/constants'
import { LIMITS } from '@/api/drafts'
import { CField, FormSection, InlineError, fieldId } from '../parts'
import { emptyResource } from '../schema'

const PROMPTS = ['How long did you prepare?', 'What did you focus on?', 'What would you skip next time?', 'What helped the most?']

export function PrepStep({ announce }) {
  const { setValue, getValues } = useFormContext()
  const rounds = useWatch({ name: 'rounds' })
  const domain = useWatch({ name: 'domain_id' })
  const strategyRef = useRef(null)

  // Topics already tagged on questions, most frequent first.
  const suggestions = useMemo(() => {
    const counts = {}
    rounds?.forEach((r) => r.questions?.forEach((q) => q.topics?.forEach((t) => (counts[t] = (counts[t] ?? 0) + 1))))
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [rounds])

  const insertPrompt = (p) => {
    const cur = getValues('preparation') ?? ''
    const next = `${cur.trimEnd()}${cur.trim() ? '\n\n' : ''}**${p}** `
    setValue('preparation', next, { shouldDirty: true })
    requestAnimationFrame(() => {
      const el = strategyRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.length, next.length)
    })
  }

  return (
    <div className="space-y-10">
      <FormSection>
        <CField
          name="topics"
          label="Topics covered"
          hint={`Pick what the interviews actually tested. Up to ${LIMITS.topics}.`}
          render={(field) => (
            <TagPicker ref={field.ref} options={topicsForDomain(domain)} value={field.value} onChange={field.onChange} max={LIMITS.topics} suggestions={suggestions} placeholder="Search topics, e.g. Power systems or Graphs" />
          )}
        />
        <div className="space-y-2.5">
          <CField
            name="preparation"
            label="Preparation strategy"
            hint="Recommended. Markdown works: **bold**, lists, `code`."
            counter={(v) => <CharCount value={v ?? ''} max={LIMITS.preparation} />}
            render={(field) => (
              <Textarea
                {...field}
                ref={(el) => {
                  field.ref(el)
                  strategyRef.current = el
                }}
                minRows={5}
                placeholder="e.g. Six weeks of prep. First two on arrays and strings from Striver’s sheet, then trees and DP. Revised OS and DBMS from my semester notes the week before."
              />
            )}
          />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Writing prompts">
            <span className="text-small text-ink-500">Not sure where to start?</span>
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => insertPrompt(p)}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 text-small text-ink-700 transition-colors duration-[120ms] hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
              >
                <Plus className="size-3" aria-hidden />
                {p}
              </button>
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection title="Resources" description="Courses, books, sheets or videos you actually used. https links only.">
        <ResourceList announce={announce} />
      </FormSection>
    </div>
  )
}

function ResourceList({ announce }) {
  const { fields, append, remove } = useFieldArray({ name: 'resources', keyName: '_key' })
  const { errors } = useFormState({ name: 'resources' })
  const listError = errors?.resources?.root?.message ?? errors?.resources?.message

  const add = () => {
    append(emptyResource(), { shouldFocus: false })
    const i = fields.length
    requestAnimationFrame(() => document.getElementById(fieldId(`resources.${i}.title`))?.focus())
    announce(`Resource ${i + 1} added.`)
  }
  const drop = (i) => {
    remove(i)
    announce(`Resource ${i + 1} removed.`)
    requestAnimationFrame(() => document.getElementById('add-resource')?.focus())
  }

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <ul className="space-y-2.5">
          {fields.map((f, i) => (
            <li key={f._key} className="rounded-md border border-ink-200 bg-ink-25 p-3 animate-rise">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_150px_auto] md:items-start">
                <CField name={`resources.${i}.title`} label="Title" render={(field) => <Input {...field} placeholder="e.g. NPTEL course or a practice site" />} />
                <CField
                  name={`resources.${i}.url`}
                  label="Link"
                  render={(field) => (
                    <Input
                      {...field}
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="https://"
                      prefix={<Link2 aria-hidden />}
                      onBlur={(e) => {
                        // Friendly fix for the most common mistake: a bare domain.
                        const v = e.target.value.trim()
                        if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) field.onChange(`https://${v}`)
                        field.onBlur()
                      }}
                    />
                  )}
                />
                <CField
                  name={`resources.${i}.kind`}
                  label="Kind"
                  render={(field) => <Select ref={field.ref} value={field.value} onValueChange={field.onChange} options={RESOURCE_KINDS} />}
                />
                <div className="flex justify-end md:pt-[30px]">
                  <IconButton label={`Remove resource ${i + 1}`} onClick={() => drop(i)} className="hover:bg-danger-50! hover:text-danger-600!">
                    <Trash2 />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <InlineError message={listError} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button id="add-resource" variant="secondary" onClick={add} disabled={fields.length >= LIMITS.resources}>
          <Plus /> Add resource
        </Button>
        {fields.length > 0 && <span className="text-small text-ink-500 tabular">{fields.length} of {LIMITS.resources}</span>}
      </div>
    </div>
  )
}
