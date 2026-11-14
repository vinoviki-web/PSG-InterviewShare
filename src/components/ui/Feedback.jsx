import { Tabs as TabsPrimitive } from 'radix-ui'
import { CircleAlert, RotateCcw, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export function Skeleton({ className, ...props }) {
  return <div className={cn('skeleton', className)} aria-hidden {...props} />
}

export function EmptyState({ icon: Icon, title, children, action, className, compact }) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {Icon && (
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-500 shadow-xs">
          <Icon className="size-[22px]" aria-hidden />
        </span>
      )}
      <h3 className="text-h3 text-ink-900">{title}</h3>
      {children && <div className="mt-1.5 max-w-[420px] text-body text-ink-600">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something didn’t load', message = 'Check your connection and try again.', onRetry, className, error }) {
  if (error?.code === 'not_connected') {
    return (
      <div className={cn('flex items-start gap-3 rounded-lg border border-dashed border-ink-300 bg-ink-25 p-4', className)} role="status">
        <Plug className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
        <div className="flex-1">
          <p className="text-body font-medium text-ink-800">Not connected yet</p>
          <p className="text-small text-ink-600">{error.message}</p>
        </div>
      </div>
    )
  }
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4', className)} role="alert">
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger-600" aria-hidden />
      <div className="flex-1">
        <p className="text-body font-medium text-ink-900">{title}</p>
        <p className="text-small text-ink-600">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw /> Retry
        </Button>
      )}
    </div>
  )
}

export function Card({ className, children, as: As = 'div', ...props }) {
  return (
    <As className={cn('rounded-lg border border-ink-200 bg-white shadow-xs', className)} {...props}>
      {children}
    </As>
  )
}

export function SectionHeader({ title, action, description, className, as: As = 'h2' }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-4', className)}>
      <div>
        <As className="text-h3 font-semibold text-ink-900">{title}</As>
        {description && <p className="mt-0.5 text-small text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------- Tabs ---------- */
export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

export function TabsList({ children, className }) {
  return (
    <TabsPrimitive.List className={cn('scrollbar-none flex gap-1 overflow-x-auto border-b border-ink-200', className)}>
      {children}
    </TabsPrimitive.List>
  )
}

export function TabsTrigger({ value, children, count }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="relative -mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-body font-medium text-ink-600 transition-colors hover:text-ink-900 data-[state=active]:border-ink-900 data-[state=active]:text-ink-900"
    >
      {children}
      {count != null && (
        <span className="tabular rounded-full bg-ink-100 px-1.5 text-caption text-ink-600">{count}</span>
      )}
    </TabsPrimitive.Trigger>
  )
}

export function ProgressBar({ value, max = 100, className, label }) {
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-200', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-teal-600 transition-[width] duration-[260ms] ease-out-soft" style={{ width: `${(value / max) * 100}%` }} />
    </div>
  )
}

/** Thin top progress bar for background refetches. */
export function FetchingBar({ active }) {
  return (
    <div className={cn('pointer-events-none h-0.5 overflow-hidden transition-opacity duration-[180ms]', active ? 'opacity-100' : 'opacity-0')} aria-hidden>
      <div className="h-full w-1/3 animate-[fetchbar_1s_ease-in-out_infinite] bg-teal-600" />
      <style>{'@keyframes fetchbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
  )
}
