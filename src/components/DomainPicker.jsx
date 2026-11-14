import { forwardRef } from 'react'
import { RadioGroup } from 'radix-ui'
import { DOMAINS, DOMAIN } from '@/lib/taxonomy'
import { useFieldControl } from '@/components/ui/Field'
import { cn } from '@/lib/utils'

/**
 * Compact domain choice for the share form (MD1): 13 one-line tiles instead
 * of tall cards, with what the selected domain covers shown underneath.
 * A real radio group, so arrow keys move between domains.
 */
export const DomainPicker = forwardRef(function DomainPicker({ value, onValueChange, invalid, id, ...props }, ref) {
  const field = useFieldControl()
  const selected = DOMAIN[value]
  invalid = invalid ?? field?.invalid
  return (
    <div>
      <RadioGroup.Root
        ref={ref}
        id={id ?? field?.id}
        value={value ?? ''}
        onValueChange={onValueChange}
        aria-describedby={field?.describedBy}
        aria-invalid={invalid || undefined}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        {...props}
      >
        {DOMAINS.map((d) => (
          <RadioGroup.Item
            key={d.value}
            value={d.value}
            className={cn(
              'flex h-11 min-w-0 items-center gap-2 rounded-md border bg-white px-3 text-left text-body font-medium text-ink-800 shadow-xs outline-none',
              'transition-[border-color,background-color] duration-[120ms] hover:border-ink-300 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1',
              'data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-50 data-[state=checked]:text-teal-900',
              invalid ? 'border-danger-600' : 'border-ink-200',
            )}
          >
            <d.icon className="size-4 shrink-0 text-ink-500" aria-hidden />
            <span className="truncate">{d.short}</span>
            <span className="sr-only">: {d.label}, {d.covers}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <p className="mt-2 min-h-5 text-small text-ink-600" aria-live="polite">
        {selected ? <><span className="font-medium text-ink-800">{selected.label}</span> · {selected.covers}</> : null}
      </p>
    </div>
  )
})
