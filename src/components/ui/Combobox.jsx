import { forwardRef, useId, useMemo, useRef, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Accessible single-select combobox (ARIA 1.2 pattern).
 * items: [{ value, label, meta?, leading? }]
 */
export const Combobox = forwardRef(function Combobox(
  { items, value, onChange, placeholder = 'Search…', allowCreate, createLabel = (q) => `Add “${q}”`, onCreate, invalid, id, renderLeading, emptyText = 'No matches', ...props },
  ref,
) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const selected = items.find((i) => i.value === value)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? items.filter((i) => i.label.toLowerCase().includes(q) || i.keywords?.some((k) => k.toLowerCase().includes(q)))
      : items
    return list.slice(0, 8)
  }, [items, query])

  const canCreate = allowCreate && query.trim().length >= 2 && !items.some((i) => i.label.toLowerCase() === query.trim().toLowerCase())
  const options = [...results.map((r) => ({ type: 'item', ...r })), ...(canCreate ? [{ type: 'create', value: '__create', label: query.trim() }] : [])]

  const choose = (opt) => {
    if (opt.type === 'create') onCreate?.(opt.label)
    else onChange?.(opt.value)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  if (selected && !open) {
    return (
      <div
        className={cn(
          'flex h-12 items-center gap-3 rounded-md border bg-white px-3 shadow-xs',
          invalid ? 'border-danger-600' : 'border-ink-300',
        )}
      >
        {renderLeading?.(selected)}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink-900">{selected.label}</p>
          {selected.meta && <p className="truncate text-caption text-ink-500">{selected.meta}</p>}
        </div>
        <button
          ref={ref}
          id={id}
          type="button"
          className="rounded-md px-2 py-1 text-small font-medium text-teal-700 hover:bg-teal-50"
          onClick={() => {
            setOpen(true)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
          {...props}
        >
          Change
        </button>
        <button type="button" aria-label="Clear selection" className="rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-700" onClick={() => onChange?.(null)}>
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-md border bg-white px-3 shadow-xs focus-within:border-teal-600 focus-within:ring-[3px] focus-within:ring-teal-100',
          invalid ? 'border-danger-600' : 'border-ink-300',
        )}
      >
        <Search className="size-4 shrink-0 text-ink-500" aria-hidden />
        <input
          ref={(el) => {
            inputRef.current = el
            if (typeof ref === 'function') ref(el)
            else if (ref) ref.current = el
          }}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink-900 outline-none placeholder:text-ink-500"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          {...props}
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-md animate-rise"
        >
          {options.length === 0 && <li className="px-3 py-2.5 text-body text-ink-500">{emptyText}</li>}
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(o)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-body',
                i === active ? 'bg-ink-100' : '',
                o.type === 'create' && 'border-t border-ink-100 text-teal-700',
              )}
            >
              {o.type === 'create' ? (
                <>
                  <span className="inline-flex size-8 items-center justify-center rounded-md border border-dashed border-teal-300 text-teal-600">
                    <Plus className="size-4" />
                  </span>
                  <span className="font-medium">{createLabel(o.label)}</span>
                </>
              ) : (
                <>
                  {renderLeading?.(o)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink-900">{o.label}</span>
                    {o.meta && <span className="block truncate text-caption text-ink-500">{o.meta}</span>}
                  </span>
                  {o.value === value && <Check className="size-4 text-teal-600" />}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

/**
 * Multi-select tag picker. options: [{ value, label, group? }]
 */
export const TagPicker = forwardRef(function TagPicker(
  { options, value = [], onChange, max = 15, placeholder = 'Add topics…', suggestions = [], invalid, id, ...props },
  ref,
) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const byValue = useMemo(() => Object.fromEntries(options.map((o) => [o.value, o])), [options])
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter((o) => !value.includes(o.value) && (!q || o.label.toLowerCase().includes(q))).slice(0, 8)
  }, [options, value, query])
  const full = value.length >= max

  const add = (v) => {
    if (full || value.includes(v)) return
    onChange?.([...value, v])
    setQuery('')
    setActive(0)
  }
  const remove = (v) => onChange?.(value.filter((x) => x !== v))
  const pendingSuggestions = suggestions.filter((s) => !value.includes(s) && byValue[s])

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'relative flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 shadow-xs focus-within:border-teal-600 focus-within:ring-[3px] focus-within:ring-teal-100',
          invalid ? 'border-danger-600' : 'border-ink-300',
        )}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex h-7 items-center gap-1 rounded-sm bg-ink-100 pl-2 pr-1 text-small font-medium text-ink-800">
            {byValue[v]?.label ?? v}
            <button type="button" className="rounded-sm p-0.5 text-ink-500 hover:bg-ink-200 hover:text-ink-900" aria-label={`Remove ${byValue[v]?.label}`} onClick={() => remove(v)}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={ref}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          disabled={full}
          className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-body outline-none placeholder:text-ink-500"
          placeholder={full ? `Maximum ${max} reached` : value.length ? '' : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter' && results[active]) { e.preventDefault(); add(results[active].value) }
            else if (e.key === 'Backspace' && !query && value.length) remove(value[value.length - 1])
            else if (e.key === 'Escape') setOpen(false)
          }}
          {...props}
        />
        {open && results.length > 0 && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-md animate-rise">
            {results.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => { e.preventDefault(); add(o.value) }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-body text-ink-800', i === active && 'bg-ink-100')}
              >
                {o.label}
                {o.group && <span className="text-caption text-ink-500">{o.group}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {pendingSuggestions.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-small text-ink-500">Suggested from your questions:</span>
          {pendingSuggestions.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-dashed border-ink-300 px-2 text-small text-ink-700 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
            >
              <Plus className="size-3.5" aria-hidden />
              {byValue[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
