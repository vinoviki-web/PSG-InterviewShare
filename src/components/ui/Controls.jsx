import { forwardRef } from 'react'
import { Switch as SwitchPrimitive, Checkbox as CheckboxPrimitive, RadioGroup, Select as SelectPrimitive } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldControl } from './Field'
import { DIFFICULTY_LABELS } from '@/lib/constants'

/* ---------- Switch ---------- */
export function Switch({ checked, onCheckedChange, label, description, id, disabled, ...aria }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body font-medium text-ink-800">
          {label}
        </label>
        {description && <p className="mt-0.5 text-small text-ink-500">{description}</p>}
      </div>
      <SwitchPrimitive.Root
        {...aria}
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-ink-300 transition-colors duration-[180ms] data-[state=checked]:bg-teal-600 disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-[180ms] ease-out-soft data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </div>
  )
}

/* ---------- Checkbox ---------- */
export function Checkbox({ checked, onCheckedChange, label, description, id, className, ...aria }) {
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <CheckboxPrimitive.Root
        {...aria}
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
        className="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-ink-300 bg-white shadow-xs transition-colors data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600"
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div>
        <label htmlFor={id} className="cursor-pointer text-body text-ink-800">
          {label}
        </label>
        {description && <p className="text-small text-ink-500">{description}</p>}
      </div>
    </div>
  )
}

/* ---------- RadioCards ---------- */
export const RadioCards = forwardRef(function RadioCards(
  { options, value, onValueChange, columns = 2, invalid, className, ...props },
  ref,
) {
  return (
    <RadioGroup.Root
      ref={ref}
      value={value ?? ''}
      onValueChange={onValueChange}
      className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3', className)}
      {...props}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'group flex items-start gap-3 rounded-lg border bg-white p-3.5 text-left shadow-xs transition-[border-color,background-color,box-shadow] duration-[120ms]',
            'hover:border-ink-300 data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-50 data-[state=checked]:shadow-none',
            invalid ? 'border-danger-600' : 'border-ink-200',
          )}
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-ink-300 bg-white group-data-[state=checked]:border-teal-600">
            <RadioGroup.Indicator className="size-2 rounded-full bg-teal-600" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-body font-medium text-ink-900">
              {o.icon && <o.icon className="size-4 text-ink-500" aria-hidden />}
              {o.label}
            </span>
            {o.description && <span className="mt-0.5 block text-small text-ink-500">{o.description}</span>}
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
})

/* ---------- SegmentedControl ---------- */
export const Segmented = forwardRef(function Segmented({ options, value, onValueChange, size = 'md', className, invalid, ...props }, ref) {
  return (
    <RadioGroup.Root
      ref={ref}
      value={value ?? ''}
      onValueChange={onValueChange}
      orientation="horizontal"
      className={cn(
        'inline-flex w-full rounded-md border bg-ink-100 p-0.5 sm:w-auto',
        invalid ? 'border-danger-600' : 'border-ink-200',
        className,
      )}
      {...props}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'flex-1 whitespace-nowrap rounded-[6px] px-3 font-medium text-ink-600 transition-[background-color,color,box-shadow] duration-[120ms] hover:text-ink-900 sm:flex-none',
            'data-[state=checked]:bg-white data-[state=checked]:text-ink-900 data-[state=checked]:shadow-sm',
            size === 'sm' ? 'h-7 text-small' : 'h-9 text-body',
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
})

/* ---------- Difficulty ---------- */
export function DifficultyMeter({ value, showLabel = true, className }) {
  if (!value) return null
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={`Difficulty ${value} of 5`}>
      <span className="flex gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn('h-3 w-1.5 rounded-[2px]', i <= value ? 'bg-ink-700' : 'bg-ink-200')} />
        ))}
      </span>
      {showLabel ? (
        <span className="text-small text-ink-600">{DIFFICULTY_LABELS[value]}</span>
      ) : (
        <span className="sr-only">Difficulty: {DIFFICULTY_LABELS[value]}</span>
      )}
    </span>
  )
}

export const DifficultyInput = forwardRef(function DifficultyInput({ value, onChange, invalid, ...props }, ref) {
  return (
    <RadioGroup.Root
      ref={ref}
      value={value ? String(value) : ''}
      onValueChange={(v) => onChange?.(Number(v))}
      orientation="horizontal"
      className={cn('grid grid-cols-5 gap-1.5', invalid && 'rounded-md ring-1 ring-danger-600 ring-offset-2')}
      {...props}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <RadioGroup.Item
          key={i}
          value={String(i)}
          className={cn(
            'group flex flex-col items-center gap-1.5 rounded-md border bg-white px-1 py-2.5 shadow-xs transition-colors duration-[120ms]',
            'hover:border-ink-300 data-[state=checked]:border-ink-800 data-[state=checked]:bg-ink-900 data-[state=checked]:text-white',
            'border-ink-200 text-ink-700',
          )}
        >
          <span className="flex items-end gap-[2px]" aria-hidden>
            {[1, 2, 3, 4, 5].map((j) => (
              <span
                key={j}
                className={cn(
                  'w-1 rounded-[1px]',
                  j <= i ? 'bg-current' : 'bg-ink-200 group-data-[state=checked]:bg-ink-600',
                )}
                style={{ height: 4 + j * 2 }}
              />
            ))}
          </span>
          <span className="whitespace-nowrap text-[11px] font-medium sm:text-caption">{DIFFICULTY_LABELS[i]}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
})

/* ---------- Select ---------- */
export const Select = forwardRef(function Select(
  { value, onValueChange, options, placeholder = 'Select…', invalid, className, size = 'md', id, ...props },
  ref,
) {
  const field = useFieldControl()
  id = id ?? field?.id
  invalid = invalid ?? field?.invalid
  return (
    <SelectPrimitive.Root value={value ?? ''} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        ref={ref}
        id={id}
        aria-describedby={field?.describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field?.required || undefined}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-body text-ink-900 shadow-xs outline-none',
          'focus:border-teal-600 focus:ring-[3px] focus:ring-teal-100 data-[placeholder]:text-ink-500',
          size === 'sm' ? 'h-8' : 'h-10',
          invalid ? 'border-danger-600' : 'border-ink-300',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-ink-500" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-ink-200 bg-white shadow-md animate-rise"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((group) =>
              group.options ? (
                <SelectPrimitive.Group key={group.label}>
                  <SelectPrimitive.Label className="px-2.5 pb-1 pt-2 text-caption font-medium text-ink-500">{group.label}</SelectPrimitive.Label>
                  {group.options.map((o) => (
                    <SelectItem key={o.value} {...o} />
                  ))}
                </SelectPrimitive.Group>
              ) : (
                <SelectItem key={group.value} {...group} />
              ),
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
})

function SelectItem({ value, label }) {
  return (
    <SelectPrimitive.Item
      value={String(value)}
      className="relative flex h-9 cursor-pointer select-none items-center rounded-md pl-8 pr-3 text-body text-ink-800 outline-none data-[highlighted]:bg-ink-100 data-[state=checked]:font-medium"
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2.5">
        <Check className="size-4 text-teal-600" aria-hidden />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{label}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

/* ---------- Month / year ---------- */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const MonthYearPicker = forwardRef(function MonthYearPicker({ value, onChange, invalid, id, ...props }, ref) {
  const now = new Date()
  const [y, m] = value ? value.split('-').map(Number) : [undefined, undefined]
  const years = Array.from({ length: now.getFullYear() - 2015 + 1 }, (_, i) => now.getFullYear() - i)
  const set = (ny, nm) => {
    if (ny && nm) onChange?.(`${ny}-${String(nm).padStart(2, '0')}-01`)
    else onChange?.(ny || nm ? `${ny ?? now.getFullYear()}-${String(nm ?? 1).padStart(2, '0')}-01` : '')
  }
  return (
    <div className="grid grid-cols-[1fr_120px] gap-2" ref={ref}>
      <Select
        id={id}
        aria-label="Month"
        value={m ? String(m) : ''}
        onValueChange={(v) => set(y ?? now.getFullYear(), Number(v))}
        placeholder="Month"
        invalid={invalid}
        options={MONTH_NAMES.map((n, i) => ({ value: String(i + 1), label: n }))}
        {...props}
      />
      <Select
        aria-label="Year"
        value={y ? String(y) : ''}
        onValueChange={(v) => set(Number(v), m ?? 1)}
        placeholder="Year"
        invalid={invalid}
        options={years.map((yy) => ({ value: String(yy), label: String(yy) }))}
      />
    </div>
  )
})
