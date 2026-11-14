import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastCtx = createContext(null)
const ICONS = { success: CircleCheck, error: CircleAlert, info: Info }
const DURATION = { success: 4000, info: 5000, error: null }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id])
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const show = useCallback(
    (tone, message, opts = {}) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((t) => [...t.slice(-2), { id, tone, message, ...opts }])
      const ms = opts.duration ?? DURATION[tone]
      if (ms) timers.current[id] = setTimeout(() => dismiss(id), ms)
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      success: (m, o) => show('success', m, o),
      error: (m, o) => show('error', m, o),
      info: (m, o) => show('info', m, o),
      dismiss,
    }),
    [show, dismiss],
  )

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-60 flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-lg border border-ink-200 bg-white py-3 pl-3.5 pr-2 shadow-md animate-rise"
            >
              <Icon
                className={cn(
                  'mt-0.5 size-[18px] shrink-0',
                  t.tone === 'success' && 'text-success-600',
                  t.tone === 'error' && 'text-danger-600',
                  t.tone === 'info' && 'text-ink-500',
                )}
                aria-hidden
              />
              <p className="flex-1 text-body text-ink-800">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  className="shrink-0 rounded-md px-2 py-0.5 text-body font-medium text-teal-700 hover:bg-teal-50"
                  onClick={() => {
                    t.action.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
