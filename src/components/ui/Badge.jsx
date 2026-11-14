import { Check, Clock, Minus, X } from 'lucide-react'
import { cn, initials, hashIndex } from '@/lib/utils'
import { OUTCOME } from '@/lib/constants'

const TONES = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  teal: 'bg-teal-50 text-teal-800 border-teal-200',
  success: 'bg-success-50 text-success-600 border-success-200',
  warning: 'bg-warning-50 text-warning-600 border-warning-200',
  danger: 'bg-danger-50 text-danger-600 border-danger-200',
  outline: 'bg-white text-ink-700 border-ink-300',
}

export function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-sm border px-2 text-caption font-medium [&_svg]:size-3.5',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

const OUTCOME_ICON = { selected: Check, awaiting: Clock, not_selected: Minus, withdrew: Minus, undisclosed: Minus }

export function OutcomePill({ outcome, className }) {
  const o = OUTCOME[outcome]
  if (!o) return null
  const Icon = OUTCOME_ICON[outcome]
  const label = outcome === 'undisclosed' ? 'Outcome not shared' : o.label
  return (
    <Badge tone={o.tone} className={cn('rounded-full', className)}>
      <Icon aria-hidden strokeWidth={2.25} />
      {label}
    </Badge>
  )
}

/** Toggle chip (filters) or removable chip (onRemove). */
export function Chip({ selected, onClick, onRemove, children, className, count, ...props }) {
  if (onRemove) {
    return (
      <span
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-teal-200 bg-teal-50 pl-3 pr-1 text-small font-medium text-teal-800',
          className,
        )}
      >
        {children}
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex size-6 items-center justify-center rounded-full hover:bg-teal-100"
          aria-label={`Remove filter ${typeof children === 'string' ? children : ''}`}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-small font-medium transition-colors duration-[120ms]',
        selected
          ? 'border-teal-600 bg-teal-50 text-teal-800'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50',
        className,
      )}
      {...props}
    >
      {selected && <Check className="size-3.5" aria-hidden strokeWidth={2.5} />}
      {children}
      {count != null && <span className="tabular text-ink-500">{count}</span>}
    </button>
  )
}

/** Plain topic tag (non-interactive). */
export function Tag({ children, className }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-sm bg-ink-100 px-2 text-caption font-medium text-ink-700', className)}>
      {children}
    </span>
  )
}

const AVATAR_TINTS = [
  'bg-[#E6EEF9] text-[#1F3B6E]',
  'bg-[#E7F4F1] text-[#0A4F46]',
  'bg-[#F3EEE6] text-[#6B4A1F]',
  'bg-[#EFEAF6] text-[#4A2F72]',
  'bg-[#F6E9EC] text-[#7A2638]',
  'bg-[#EAF2E4] text-[#355221]',
]
const AVATAR_SIZES = { 24: 'size-6 text-[10px]', 32: 'size-8 text-caption', 40: 'size-10 text-small', 64: 'size-16 text-h3', 96: 'size-24 text-h2' }

export function Avatar({ name = '', src, size = 32, anonymous = false, className }) {
  const sz = AVATAR_SIZES[size]
  if (anonymous) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500', sz, className)} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      </span>
    )
  }
  if (src) return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', sz, className)} />
  return (
    <span
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold', sz, AVATAR_TINTS[hashIndex(name, AVATAR_TINTS.length)], className)}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

const LOGO_SIZES = { 32: 'size-8 text-caption rounded-md', 40: 'size-10 text-small rounded-md', 48: 'size-12 text-body rounded-lg', 64: 'size-16 text-h3 rounded-lg' }

/** Monogram tile (prototype never uses real logos — see decision I4). */
export function CompanyLogo({ name = '', size = 40, className }) {
  const letters = name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean)
  const mono = letters.length > 1 ? letters[0][0] + letters[1][0] : (letters[0] ?? '?').slice(0, 2)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center border border-ink-200 bg-white font-semibold tracking-tight text-ink-800 shadow-xs',
        LOGO_SIZES[size],
        className,
      )}
      aria-hidden
    >
      {mono.toUpperCase()}
    </span>
  )
}

export function Kbd({ children, className }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-ink-200 bg-ink-50 px-1 font-sans text-[11px] font-medium text-ink-500', className)}>
      {children}
    </kbd>
  )
}
