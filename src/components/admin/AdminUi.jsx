import { useCallback, useId } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Search, X, FileText, MessageSquare, UserRound, CircleDot, EyeOff, ArrowUpRight, Check, Eye, Trash2, Info, TriangleAlert, ShieldCheck, Ban, Clock3,
} from 'lucide-react'
import { Badge, Button, Dialog, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { ROLE_LABEL } from './format'

/* ---------------- Page chrome ---------------- */
export function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-h1">{title}</h1>
        {description && <p className="mt-1 max-w-[62ch] text-body text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Filter bar: search grows, filters wrap into a 2-up grid on phones. */
export function Toolbar({ search, children, className }) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3 xl:flex-row xl:items-center', className)}>
      {search && <div className="min-w-0 sm:max-w-[420px] xl:max-w-[320px] xl:flex-1">{search}</div>}
      {children && <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">{children}</div>}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full rounded-md border border-ink-300 bg-white pl-9 pr-9 text-body text-ink-900 shadow-xs outline-none transition-[border-color,box-shadow] duration-[120ms] placeholder:text-ink-500 focus:border-teal-600 focus:ring-[3px] focus:ring-teal-100 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-700"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** Select with an "All …" option. Radix forbids empty values, so "all" means no filter. */
export function FilterSelect({ label, value, onValueChange, options, allLabel, className }) {
  return (
    <Select
      aria-label={label}
      value={value || 'all'}
      onValueChange={onValueChange}
      className={cn('sm:w-auto sm:min-w-[150px]', className, value && value !== 'all' && 'border-teal-600 bg-teal-50/60')}
      options={[{ value: 'all', label: allLabel }, ...options]}
    />
  )
}

/* ---------------- Drawer building blocks ---------------- */
export function DrawerSection({ title, count, action, children, className }) {
  return (
    <section className={cn('border-t border-ink-200 pt-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-caption font-medium uppercase tracking-wider text-ink-500">
          {title}
          {count != null && <span className="tabular rounded-full bg-ink-100 px-1.5 py-px text-ink-600 normal-case tracking-normal">{count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function DetailList({ items, className }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3', className)}>
      {items.filter(Boolean).map((it) => (
        <div key={it.label} className={cn('min-w-0', it.wide && 'col-span-2')}>
          <dt className="text-caption text-ink-500">{it.label}</dt>
          <dd className={cn('mt-0.5 truncate text-body text-ink-900', it.mono && 'font-mono text-small')}>{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

const CALLOUT = {
  info: { cls: 'border-ink-200 bg-ink-50 text-ink-800', icon: Info, iconCls: 'text-ink-500' },
  warning: { cls: 'border-warning-200 bg-warning-50 text-ink-800', icon: TriangleAlert, iconCls: 'text-warning-600' },
  danger: { cls: 'border-danger-200 bg-danger-50 text-ink-800', icon: Ban, iconCls: 'text-danger-600' },
  teal: { cls: 'border-teal-200 bg-teal-50 text-ink-800', icon: ShieldCheck, iconCls: 'text-teal-600' },
}
export function Callout({ tone = 'info', icon, title, children, action, className }) {
  const t = CALLOUT[tone]
  const Icon = icon ?? t.icon
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3.5', t.cls, className)}>
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', t.iconCls)} aria-hidden />
      <div className="min-w-0 flex-1 text-body">
        {title && <p className="font-medium text-ink-900">{title}</p>}
        {children && <div className={cn('text-small text-ink-600', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

/* ---------------- Badges ---------------- */
export const MOD_STATES = {
  needs_review: { label: 'Needs review', tone: 'warning', icon: CircleDot },
  auto_hidden: { label: 'Auto-hidden', tone: 'warning', icon: EyeOff },
  escalated: { label: 'Escalated', tone: 'outline', icon: ArrowUpRight },
  hidden: { label: 'Hidden', tone: 'neutral', icon: EyeOff },
  dismissed: { label: 'Dismissed', tone: 'neutral', icon: Check },
  restored: { label: 'Restored', tone: 'success', icon: Eye },
  removed: { label: 'Removed', tone: 'neutral', icon: Trash2 },
}
export function StateBadge({ state, className }) {
  const s = MOD_STATES[state] ?? MOD_STATES.needs_review
  return (
    <Badge tone={s.tone} className={className}>
      <s.icon aria-hidden strokeWidth={2} />
      {s.label}
    </Badge>
  )
}

const TYPE_ICON = { experience: FileText, comment: MessageSquare, profile: UserRound }
export const TYPE_LABEL = { experience: 'Experience', comment: 'Comment', profile: 'Profile' }
export function TypeIcon({ type, className }) {
  const Icon = TYPE_ICON[type] ?? FileText
  return (
    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-ink-600', className)}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{TYPE_LABEL[type]}</span>
    </span>
  )
}

export function RoleBadge({ role }) {
  if (role === 'student') return <span className="text-small text-ink-600">Student</span>
  return (
    <Badge tone={role === 'admin' ? 'teal' : 'outline'}>
      <ShieldCheck aria-hidden />
      {ROLE_LABEL[role]}
    </Badge>
  )
}

export function UserStatusBadge({ status }) {
  if (status === 'suspended')
    return (
      <Badge tone="danger">
        <Ban aria-hidden /> Suspended
      </Badge>
    )
  if (status === 'onboarding')
    return (
      <Badge tone="neutral">
        <Clock3 aria-hidden /> Onboarding
      </Badge>
    )
  return (
    <Badge tone="success">
      <Check aria-hidden /> Active
    </Badge>
  )
}

/* ---------------- Dialogs ---------------- */
/** Dialog whose footer submits an inner <form>, so Enter works and fields validate together. */
export function FormDialog({ open, onOpenChange, title, description, confirmLabel, tone = 'primary', loading, onSubmit, children, size = 'sm', secondary }) {
  const formId = useId()
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          {secondary}
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="space-y-5 pt-2"
      >
        {children}
      </form>
    </Dialog>
  )
}

/** Moves focus to the first invalid control after a failed submit (spec §5). */
export function focusFirstError(container = document) {
  requestAnimationFrame(() => {
    const el = container.querySelector('[aria-invalid="true"]')
    el?.focus?.()
  })
}

/* ---------------- Data helpers ---------------- */
/** Moderation and admin actions change visibility everywhere, so refresh every cached view (except the session). */
export function useInvalidateAll() {
  const qc = useQueryClient()
  return useCallback(() => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' }), [qc])
}

export const errorText = (err, fallback = 'Something went wrong. Try again.') =>
  err?.code === 'network' ? 'Couldn’t reach the server. Check your connection and try again.' : err?.message || fallback

/** Small numeric stat used inside drawers. */
export function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2.5">
      <p className="text-h3 tabular text-ink-900">{value}</p>
      <p className="text-caption text-ink-500">{label}</p>
    </div>
  )
}
