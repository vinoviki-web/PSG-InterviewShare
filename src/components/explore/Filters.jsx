import { useMemo } from 'react'
import { Checkbox } from '@/components/ui/Controls'
import { Chip, Combobox, Select } from '@/components/ui'
import { OPPORTUNITY_TYPES, HIRING_MODES, OUTCOMES, ROUND_TYPES, DIFFICULTY_LABELS } from '@/lib/constants'
import { DEPARTMENTS, DEPARTMENT } from '@/mocks/lookups'
import { batchLabel, cn } from '@/lib/utils'

/** Filter config shared by the rail (≥ lg) and the bottom sheet (< lg). */
export const FILTER_KEYS = ['company', 'type', 'hiring', 'outcome', 'difficulty', 'dept', 'year', 'round']

export const readFilters = (sp) => Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k)?.split(',').filter(Boolean) ?? []]))

export function countActive(f) {
  return FILTER_KEYS.reduce((n, k) => n + (f[k]?.length ?? 0), 0)
}

const year = new Date().getFullYear()
const YEARS = [year - 2, year - 1, year, year + 1, year + 2].map(String)

function Group({ title, children, className }) {
  return (
    <fieldset className={cn('border-b border-ink-200 py-4 first:pt-0 last:border-b-0', className)}>
      <legend className="float-left mb-2.5 w-full text-small font-semibold text-ink-900">{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  )
}

function CheckList({ name, options, values, onToggle, facets }) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <div key={o.value} className="flex items-center justify-between gap-2">
          <Checkbox id={`f-${name}-${o.value}`} label={o.label} checked={values.includes(o.value)} onCheckedChange={() => onToggle(name, o.value)} />
          {facets?.[o.value] != null && <span className="text-caption text-ink-500 tabular">{facets[o.value]}</span>}
        </div>
      ))}
    </div>
  )
}

export function FilterPanel({ filters, onToggle, onSet, companies = [], facets }) {
  const companyItems = useMemo(
    () => companies.filter((c) => c.experience_count > 0).map((c) => ({ value: c.slug, label: c.name, meta: `${c.experience_count} experiences`, keywords: c.aliases })),
    [companies],
  )
  return (
    <div>
      <Group title="Company">
        <Combobox
          items={companyItems.filter((c) => !filters.company.includes(c.value))}
          value={null}
          onChange={(v) => v && onToggle('company', v)}
          placeholder="Search companies"
          aria-label="Filter by company"
        />
        {filters.company.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filters.company.map((slug) => (
              <Chip key={slug} onRemove={() => onToggle('company', slug)}>{companies.find((c) => c.slug === slug)?.name ?? slug}</Chip>
            ))}
          </div>
        )}
      </Group>
      <Group title="Type">
        <CheckList name="type" options={OPPORTUNITY_TYPES} values={filters.type} onToggle={onToggle} facets={facets?.type} />
      </Group>
      <Group title="Outcome">
        <CheckList name="outcome" options={OUTCOMES.filter((o) => o.value !== 'withdrew')} values={filters.outcome} onToggle={onToggle} facets={facets?.outcome} />
      </Group>
      <Group title="Difficulty">
        <div className="grid grid-cols-5 gap-1" role="group">
          {[1, 2, 3, 4, 5].map((d) => {
            const on = filters.difficulty.includes(String(d))
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                title={DIFFICULTY_LABELS[d]}
                onClick={() => onToggle('difficulty', String(d))}
                className={cn(
                  'flex h-9 flex-col items-center justify-center rounded-md border text-small font-medium tabular transition-colors',
                  on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                )}
              >
                {d}
              </button>
            )
          })}
        </div>
        <div className="mt-1 flex justify-between text-caption text-ink-500"><span>Easy</span><span>Very hard</span></div>
      </Group>
      <Group title="Hiring">
        <CheckList name="hiring" options={HIRING_MODES.filter((h) => h.value !== 'other')} values={filters.hiring} onToggle={onToggle} facets={facets?.hiring} />
      </Group>
      <Group title="Batch">
        <div className="flex flex-wrap gap-1.5">
          {YEARS.map((y) => (
            <Chip key={y} selected={filters.year.includes(y)} onClick={() => onToggle('year', y)}>{batchLabel(y)}</Chip>
          ))}
        </div>
      </Group>
      <Group title="Department">
        <Select
          value=""
          onValueChange={(v) => onToggle('dept', v)}
          placeholder="Add a department"
          options={DEPARTMENTS.filter((d) => !filters.dept.includes(d.id)).map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))}
          aria-label="Filter by department"
        />
        {filters.dept.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filters.dept.map((d) => <Chip key={d} onRemove={() => onToggle('dept', d)}>{DEPARTMENT[d]?.code ?? d}</Chip>)}
          </div>
        )}
      </Group>
      <Group title="Includes a round">
        <div className="flex flex-wrap gap-1.5">
          {ROUND_TYPES.filter((r) => ['system_design', 'group_discussion', 'managerial', 'aptitude', 'coding'].includes(r.value)).map((r) => (
            <Chip key={r.value} selected={filters.round.includes(r.value)} onClick={() => onToggle('round', r.value)}>{r.label}</Chip>
          ))}
        </div>
      </Group>
    </div>
  )
}

/** Human labels for active-filter chips. */
export function chipLabel(key, value, companies) {
  switch (key) {
    case 'company': return companies.find((c) => c.slug === value)?.name ?? value
    case 'type': return OPPORTUNITY_TYPES.find((o) => o.value === value)?.label
    case 'hiring': return HIRING_MODES.find((o) => o.value === value)?.label
    case 'outcome': return OUTCOMES.find((o) => o.value === value)?.label
    case 'difficulty': return `Difficulty: ${DIFFICULTY_LABELS[value]}`
    case 'dept': return DEPARTMENT[value]?.code ?? value
    case 'year': return `Batch ${batchLabel(value)}`
    case 'round': return `Has ${ROUND_TYPES.find((r) => r.value === value)?.label}`
    default: return value
  }
}
