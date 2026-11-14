import { createContext, forwardRef, useContext, useId, useLayoutEffect, useRef, cloneElement, isValidElement } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The enclosing Field's wiring, for controls that sit inside a wrapper such as
 * react-hook-form's <Controller> (cloneElement can't reach them).
 */
const FieldContext = createContext(null)
export const useFieldControl = () => useContext(FieldContext)

/**
 * Field: label + control + helper/error. Wires aria-describedby / aria-invalid
 * onto its single child control.
 */
export function Field({ label, hint, error, optional, required, counter, className, children, id: idProp }) {
  const autoId = useId()
  const id = idProp ?? autoId
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [error ? errId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        invalid: error ? true : undefined,
      })
    : children

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error, required: !!required }}>
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-body font-medium text-ink-800">
            {label}
            {optional && <span className="ml-1.5 font-normal text-ink-500">(optional)</span>}
          </label>
          {counter}
        </div>
      )}
      {control}
      {error ? (
        <p id={errId} className="flex items-start gap-1.5 text-small text-danger-600" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-small text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
    </FieldContext.Provider>
  )
}

const controlBase =
  'w-full rounded-md border bg-white text-body text-ink-900 placeholder:text-ink-500 shadow-xs ' +
  'transition-[border-color,box-shadow] duration-[120ms] outline-none ' +
  'focus:border-teal-600 focus:ring-[3px] focus:ring-teal-100 disabled:bg-ink-50 disabled:text-ink-500'

export const Input = forwardRef(function Input({ className, invalid, prefix, suffix, size = 'md', ...props }, ref) {
  const h = size === 'lg' ? 'h-12 text-body-lg' : size === 'sm' ? 'h-8' : 'h-10'
  if (prefix || suffix) {
    return (
      <div
        className={cn(
          controlBase,
          'flex items-center overflow-hidden focus-within:border-teal-600 focus-within:ring-[3px] focus-within:ring-teal-100',
          invalid ? 'border-danger-600' : 'border-ink-300',
          h,
          className,
        )}
      >
        {prefix && <span className="flex h-full items-center pl-3 text-ink-500 [&_svg]:size-4">{prefix}</span>}
        <input ref={ref} className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-ink-500" {...props} />
        {suffix && (
          <span className="flex h-full items-center border-l border-ink-200 bg-ink-50 px-3 text-ink-600">{suffix}</span>
        )}
      </div>
    )
  }
  return (
    <input
      ref={ref}
      className={cn(controlBase, 'px-3', h, invalid ? 'border-danger-600' : 'border-ink-300', className)}
      {...props}
    />
  )
})

export const Textarea = forwardRef(function Textarea(
  { className, invalid, minRows = 4, maxRows = 16, value, onChange, ...props },
  ref,
) {
  const inner = useRef(null)
  const setRef = (el) => {
    inner.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const lh = 27
    el.style.height = 'auto'
    const h = Math.min(Math.max(el.scrollHeight, minRows * lh + 18), maxRows * lh + 18)
    el.style.height = `${h}px`
  }, [value, minRows, maxRows])
  return (
    <textarea
      ref={setRef}
      value={value}
      onChange={onChange}
      className={cn(
        controlBase,
        'resize-none px-3 py-2 text-body-lg leading-[27px]',
        invalid ? 'border-danger-600' : 'border-ink-300',
        className,
      )}
      {...props}
    />
  )
})

export function CharCount({ value = '', max }) {
  const n = value.length
  if (n < max * 0.8) return null
  return (
    <span className={cn('tabular text-caption', n > max ? 'text-danger-600' : 'text-ink-500')} aria-live="polite">
      {n}/{max}
    </span>
  )
}
