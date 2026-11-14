import { forwardRef } from 'react'
import { Slot } from 'radix-ui'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const VARIANTS = {
  primary:
    'bg-teal-600 text-white shadow-xs hover:bg-teal-700 active:bg-teal-800 disabled:bg-ink-200 disabled:text-ink-500',
  secondary:
    'bg-white text-ink-800 border border-ink-300 shadow-xs hover:bg-ink-50 hover:border-ink-400 active:bg-ink-100 disabled:text-ink-500',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 disabled:text-ink-500',
  danger: 'bg-danger-600 text-white shadow-xs hover:bg-danger-700 disabled:bg-ink-200 disabled:text-ink-500',
  'danger-ghost': 'text-danger-600 hover:bg-danger-50 disabled:text-ink-500',
  link: 'text-teal-700 underline-offset-4 hover:underline px-0! h-auto!',
}

const SIZES = {
  sm: 'h-8 px-3 text-small gap-1.5 [&_svg]:size-4',
  md: 'h-10 px-4 text-body gap-2 [&_svg]:size-[18px]',
  lg: 'h-12 px-5 text-body-lg gap-2 [&_svg]:size-5',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, asChild = false, className, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      ref={ref}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] ease-out-soft',
        'active:translate-y-px disabled:pointer-events-none disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(!asChild && { type: props.type ?? 'button' })}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <LoaderCircle className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
})

const ICON_SIZES = { sm: 'size-8 [&_svg]:size-4', md: 'size-10 [&_svg]:size-[18px]', lg: 'size-12 [&_svg]:size-5' }

export const IconButton = forwardRef(function IconButton(
  { variant = 'ghost', size = 'md', label, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-[120ms]',
        variant === 'ghost' && 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200',
        variant === 'secondary' && 'border border-ink-300 bg-white text-ink-700 shadow-xs hover:bg-ink-50',
        ICON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" className={cn('inline-flex items-center text-ink-500', className)}>
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}
