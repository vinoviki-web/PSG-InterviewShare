import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form'
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, LayoutTemplate, MessageSquarePlus } from 'lucide-react'
import { Button, IconButton, Input, Textarea, CharCount, Select, Segmented, DifficultyInput, TagPicker, useToast } from '@/components/ui'
import { ROUND, ROUND_TYPES, QUESTION_KINDS, DIFFICULTY_LABELS } from '@/lib/constants'
import { TOPICS } from '@/mocks/lookups'
import { LIMITS } from '@/api/drafts'
import { cn, pluralize } from '@/lib/utils'
import { CField, InlineError, fieldId } from './parts'
import { emptyRound, emptyQuestion, ROUND_TEMPLATES } from './schema'

const TYPE_OPTIONS = ROUND_TYPES.map((t) => ({
  value: t.value,
  label: (
    <span className="inline-flex items-center gap-2">
      <t.icon className="size-4 text-ink-500" aria-hidden />
      {t.label}
    </span>
  ),
}))
const KIND_OPTIONS = QUESTION_KINDS
const MODE_OPTIONS = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
]

const PLACEHOLDERS = {
  online_assessment: 'e.g. 90 minutes on HackerRank: 2 coding problems and 20 MCQs on OS and DBMS. Camera on, no tab switching.',
  aptitude: 'e.g. 60 minutes, pen and paper. Quant, logical reasoning and a few C output questions. Very tight on time.',
  coding: 'e.g. 3 problems in 2 hours on their own platform. Partial marks for passing some test cases.',
  technical: 'e.g. 45 minutes with a senior engineer. Started with my resume project, then two DSA questions. They wanted me to explain my approach before coding.',
  system_design: 'e.g. Design a URL shortener. They pushed on scaling reads and how I’d handle hot keys.',
  group_discussion: 'e.g. 10 people, 15 minutes on “Is AI replacing jobs?”. They noted who moved the discussion forward, not who spoke most.',
  managerial: 'e.g. 30 minutes with a manager. Mostly about teamwork, a conflict I handled and why this role.',
  hr: 'e.g. 15 minutes, very conversational. Why this company, relocation, and questions about my internship.',
}

const errorOf = (e) => e?.root?.message ?? e?.message

export const roundAnchor = (id) => `round-${id}`

/** Keeps focus on a moved/added element after React re-renders the list. */
function useFocusAfterRender() {
  const pending = useRef(null)
  useEffect(() => {
    if (!pending.current) return
    const id = pending.current
    pending.current = null
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  })
  return (id) => (pending.current = id)
}

export function RoundBuilder({ announce, openRequest }) {
  const { getValues } = useFormContext()
  const { errors } = useFormState({ name: 'rounds' })
  const { fields, append, remove, move, insert, replace } = useFieldArray({ name: 'rounds', keyName: '_key' })
  const [open, setOpen] = useState(() => new Set(fields.length <= 1 ? fields.map((f) => f.id) : []))
  const toast = useToast()
  const focusLater = useFocusAfterRender()

  const setRoundOpen = (id, value) =>
    setOpen((s) => {
      const n = new Set(s)
      value ? n.add(id) : n.delete(id)
      return n
    })

  // Review step "Edit" links and validation can ask for a round to open.
  useEffect(() => {
    if (!openRequest) return
    const f = fields[openRequest.index]
    if (f) setRoundOpen(f.id, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest])

  const add = () => {
    const r = emptyRound()
    append(r, { shouldFocus: false })
    setRoundOpen(r.id, true)
    focusLater(fieldId(`rounds.${fields.length}.round_type`))
    announce(`Round ${fields.length + 1} added.`)
  }

  const applyTemplate = (t) => {
    const rounds = t.rounds.map((r) => emptyRound(r))
    replace(rounds)
    setOpen(new Set([rounds[0].id]))
    focusLater(fieldId('rounds.0.description'))
    announce(`${rounds.length} rounds added. Describe what happened in each.`)
  }

  const moveRound = (i, j, dir) => {
    move(i, j)
    const id = fields[i].id
    const atEdge = j === 0 || j === fields.length - 1
    focusLater(`${roundAnchor(id)}-${atEdge ? (dir === 'up' ? 'down' : 'up') : dir}`)
    announce(`Round moved to position ${j + 1} of ${fields.length}.`)
  }

  const removeRound = (i) => {
    const removed = structuredClone(getValues(`rounds.${i}`))
    remove(i)
    const next = fields[i + 1] ?? fields[i - 1]
    focusLater(next ? `${roundAnchor(next.id)}-toggle` : 'add-round')
    toast.info(`Round ${i + 1} removed.`, {
      action: {
        label: 'Undo',
        onClick: () => {
          insert(i, removed, { shouldFocus: false })
          setRoundOpen(removed.id, true)
        },
      },
    })
  }

  const rootError = errorOf(errors?.rounds)

  if (fields.length === 0) {
    return (
      <div className="space-y-3">
        <div className={cn('rounded-lg border border-dashed bg-ink-25 p-5 sm:p-6', rootError ? 'border-danger-600' : 'border-ink-300')}>
          <p className="flex items-center gap-2 text-body font-medium text-ink-900">
            <LayoutTemplate className="size-4 text-ink-500" aria-hidden /> Start from a common process
          </p>
          <p className="mt-1 text-small text-ink-500">You can rename, reorder or remove rounds afterwards.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {ROUND_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="group rounded-lg border border-ink-200 bg-white p-3.5 text-left shadow-xs transition-[border-color,box-shadow] duration-[120ms] hover:border-ink-300 hover:shadow-sm"
              >
                <span className="block text-body font-medium text-ink-900">{t.label}</span>
                <span className="mt-0.5 block text-small text-ink-500">{t.hint}</span>
                <span className="mt-3 flex items-center gap-1" aria-hidden>
                  {t.rounds.map((r, i) => {
                    const Icon = ROUND[r.round_type].icon
                    return (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="h-px w-2 bg-ink-300" />}
                        <span className="inline-flex size-6 items-center justify-center rounded-full border border-ink-200 bg-ink-50 text-ink-600 group-hover:border-teal-200 group-hover:bg-teal-50 group-hover:text-teal-700">
                          <Icon className="size-3.5" />
                        </span>
                      </span>
                    )
                  })}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" aria-hidden />
            <span className="text-caption text-ink-500">or</span>
            <span className="h-px flex-1 bg-ink-200" aria-hidden />
          </div>
          <Button id="add-round" variant="secondary" className="mt-4 w-full" onClick={add}>
            <Plus /> Add a round
          </Button>
        </div>
        <InlineError message={rootError} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {fields.map((f, i) => (
          <RoundCard
            key={f._key}
            id={f.id}
            index={i}
            total={fields.length}
            error={errors?.rounds?.[i]}
            open={open.has(f.id)}
            onOpenChange={(v) => setRoundOpen(f.id, v)}
            onMove={(dir) => moveRound(i, dir === 'up' ? i - 1 : i + 1, dir)}
            onRemove={() => removeRound(i)}
            announce={announce}
          />
        ))}
      </ol>
      <InlineError message={rootError} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button id="add-round" variant="secondary" onClick={add} disabled={fields.length >= LIMITS.rounds}>
          <Plus /> Add round
        </Button>
        <span className="text-small text-ink-500 tabular">
          {fields.length >= LIMITS.rounds ? `Maximum ${LIMITS.rounds} rounds` : `${fields.length} of ${LIMITS.rounds}`}
        </span>
      </div>
    </div>
  )
}

function RoundCard({ id, index, total, error, open, onOpenChange, onMove, onRemove, announce }) {
  const r = useWatch({ name: `rounds.${index}` }) ?? {}
  const [settled, setSettled] = useState(open)
  const type = ROUND[r.round_type]
  const Icon = type?.icon
  const hasError = !!error
  const anchor = roundAnchor(id)

  useEffect(() => {
    if (hasError) onOpenChange(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasError])
  useEffect(() => {
    if (!open) setSettled(false)
  }, [open])

  const qCount = r.questions?.length ?? 0
  const summary = [
    r.mode === 'offline' ? 'Offline' : 'Online',
    r.duration_minutes ? `${r.duration_minutes} min` : null,
    r.difficulty ? DIFFICULTY_LABELS[r.difficulty] : null,
    pluralize(qCount, 'question'),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      id={anchor}
      className={cn(
        'scroll-mt-24 rounded-lg border bg-white shadow-xs transition-[border-color,box-shadow] duration-[120ms]',
        hasError ? 'border-danger-200' : open ? 'border-ink-300 shadow-sm' : 'border-ink-200',
      )}
    >
      <div className="flex items-center gap-2 py-2.5 pl-3 pr-2 sm:gap-3 sm:pl-4">
        <span
          className={cn(
            'inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-small font-semibold tabular',
            type ? 'border-ink-200 bg-ink-50 text-ink-700' : 'border-dashed border-ink-300 bg-white text-ink-500',
          )}
          aria-hidden
        >
          {Icon ? <Icon className="size-[18px]" /> : index + 1}
        </span>
        <button
          id={`${anchor}-toggle`}
          type="button"
          aria-expanded={open}
          aria-controls={`${anchor}-body`}
          onClick={() => onOpenChange(!open)}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold text-ink-900">
              Round {index + 1}
              <span className="font-normal text-ink-500"> · </span>
              <span className={type ? '' : 'font-normal text-ink-500'}>{type?.label ?? 'Choose a type'}</span>
            </span>
            <span className={cn('block truncate text-small', hasError && !open ? 'text-danger-600' : 'text-ink-500')}>
              {hasError && !open ? 'Needs attention' : summary}
            </span>
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-ink-500 transition-transform duration-[180ms] ease-out-soft group-hover:text-ink-700', open && 'rotate-180')}
            aria-hidden
          />
        </button>
        <div className="flex shrink-0 items-center">
          <IconButton id={`${anchor}-up`} size="sm" label={`Move round ${index + 1} up`} disabled={index === 0} onClick={() => onMove('up')} className="disabled:opacity-30">
            <ArrowUp />
          </IconButton>
          <IconButton id={`${anchor}-down`} size="sm" label={`Move round ${index + 1} down`} disabled={index === total - 1} onClick={() => onMove('down')} className="disabled:opacity-30">
            <ArrowDown />
          </IconButton>
          <IconButton size="sm" label={`Remove round ${index + 1}`} onClick={onRemove} className="hover:bg-danger-50! hover:text-danger-600!">
            <Trash2 />
          </IconButton>
        </div>
      </div>

      <div
        className={cn('grid transition-[grid-template-rows] duration-[180ms] ease-out-soft', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        onTransitionEnd={(e) => e.target === e.currentTarget && open && setSettled(true)}
      >
        <div
          id={`${anchor}-body`}
          role="region"
          aria-labelledby={`${anchor}-toggle`}
          inert={!open}
          className={cn('min-h-0', open && settled ? 'overflow-visible' : 'overflow-hidden')}
        >
          <div className="space-y-5 border-t border-ink-200 px-3 pb-5 pt-4 sm:px-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <CField
                name={`rounds.${index}.round_type`}
                label="Round type"
                render={(field) => <Select ref={field.ref} value={field.value} onValueChange={field.onChange} options={TYPE_OPTIONS} placeholder="Choose a type" />}
              />
              <CField
                name={`rounds.${index}.mode`}
                label="Mode"
                render={(field) => <Segmented ref={field.ref} value={field.value} onValueChange={field.onChange} options={MODE_OPTIONS} />}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <CField
                name={`rounds.${index}.duration_minutes`}
                label="Duration"
                optional
                render={(field) => <Input {...field} type="number" inputMode="numeric" min={1} max={600} placeholder="60" suffix="min" />}
              />
              <CField
                name={`rounds.${index}.difficulty`}
                label="Round difficulty"
                optional
                counter={
                  r.difficulty ? (
                    <RoundDifficultyClear index={index} />
                  ) : null
                }
                render={(field) => <DifficultyInput ref={field.ref} value={field.value} onChange={field.onChange} aria-label={`Round ${index + 1} difficulty`} />}
              />
            </div>
            <CField
              name={`rounds.${index}.description`}
              label="What happened"
              hint="Format, platform and what they focused on. **bold**, `code` and lists work."
              counter={(v) => <CharCount value={v ?? ''} max={LIMITS.round_description} />}
              render={(field) => <Textarea {...field} minRows={3} placeholder={PLACEHOLDERS[r.round_type] ?? 'What was the format, how long, and what did they focus on?'} />}
            />
            <QuestionList roundIndex={index} roundId={id} roundError={error} announce={announce} />
          </div>
        </div>
      </div>
    </li>
  )
}

function RoundDifficultyClear({ index }) {
  const { setValue } = useFormContext()
  return (
    <button type="button" className="text-small font-medium text-teal-700 hover:underline" onClick={() => setValue(`rounds.${index}.difficulty`, null, { shouldDirty: true })}>
      Clear
    </button>
  )
}

function QuestionList({ roundIndex, roundId, roundError, announce }) {
  const { getValues } = useFormContext()
  const name = `rounds.${roundIndex}.questions`
  const { fields, append, remove, move, insert } = useFieldArray({ name, keyName: '_key' })
  const toast = useToast()
  const focusLater = useFocusAfterRender()
  const anchor = roundAnchor(roundId)
  const listError = errorOf(roundError?.questions)

  const add = () => {
    append(emptyQuestion(), { shouldFocus: false })
    focusLater(fieldId(`${name}.${fields.length}.body`))
    announce(`Question ${fields.length + 1} added to round ${roundIndex + 1}.`)
  }
  const moveQ = (j, k, dir) => {
    move(j, k)
    const atEdge = k === 0 || k === fields.length - 1
    focusLater(`${anchor}-q-${fields[j].id}-${atEdge ? (dir === 'up' ? 'down' : 'up') : dir}`)
    announce(`Question moved to position ${k + 1} of ${fields.length}.`)
  }
  const removeQ = (j) => {
    const removed = structuredClone(getValues(`${name}.${j}`))
    remove(j)
    focusLater(`${anchor}-addq`)
    if (removed.body.trim()) {
      toast.info(`Question ${j + 1} removed.`, { action: { label: 'Undo', onClick: () => insert(j, removed, { shouldFocus: false }) } })
    } else announce(`Question ${j + 1} removed.`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-body font-medium text-ink-800">
          Questions <span className="font-normal text-ink-500 tabular">({fields.length})</span>
        </h4>
        <span className="text-small text-ink-500">Optional, but juniors search these most</span>
      </div>
      {fields.length > 0 && (
        <ol className="space-y-2.5">
          {fields.map((q, j) => (
            <li key={q._key} className="rounded-md border border-ink-200 bg-ink-25 p-3 animate-rise">
              <div className="space-y-3">
                <CField
                  name={`${name}.${j}.body`}
                  label={`Question ${j + 1}`}
                  counter={
                    <span className="-my-1.5 -mr-1.5 flex items-center">
                      <IconButton id={`${anchor}-q-${q.id}-up`} size="sm" label={`Move question ${j + 1} up`} disabled={j === 0} onClick={() => moveQ(j, j - 1, 'up')} className="disabled:opacity-30">
                        <ArrowUp />
                      </IconButton>
                      <IconButton id={`${anchor}-q-${q.id}-down`} size="sm" label={`Move question ${j + 1} down`} disabled={j === fields.length - 1} onClick={() => moveQ(j, j + 1, 'down')} className="disabled:opacity-30">
                        <ArrowDown />
                      </IconButton>
                      <IconButton size="sm" label={`Remove question ${j + 1}`} onClick={() => removeQ(j)} className="hover:bg-danger-50! hover:text-danger-600!">
                        <Trash2 />
                      </IconButton>
                    </span>
                  }
                  render={(field) => <Textarea {...field} minRows={2} maxRows={10} placeholder="e.g. Find the longest substring without repeating characters." />}
                />
                <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <CField
                    name={`${name}.${j}.kind`}
                    label="Kind"
                    render={(field) => <Select ref={field.ref} value={field.value} onValueChange={field.onChange} options={KIND_OPTIONS} />}
                  />
                  <CField
                    name={`${name}.${j}.topics`}
                    label="Topics"
                    optional
                    render={(field) => (
                      <TagPicker ref={field.ref} options={TOPICS} value={field.value} onChange={field.onChange} max={LIMITS.question_topics} placeholder="Tag topics…" />
                    )}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <InlineError message={listError} />
      <Button
        id={`${anchor}-addq`}
        variant="ghost"
        size="sm"
        onClick={add}
        disabled={fields.length >= LIMITS.questions}
        className="text-teal-700! hover:bg-teal-50! hover:text-teal-800!"
      >
        <MessageSquarePlus /> {fields.length >= LIMITS.questions ? `Maximum ${LIMITS.questions} questions` : 'Add question'}
      </Button>
    </div>
  )
}
