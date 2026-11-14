import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Mail, FlaskConical } from 'lucide-react'
import { sendOtp, verifyOtp } from '@/api/auth'
import { Button, Field, Input } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { consumeReturnTo } from '@/routes/guards'
import { PSG_DOMAIN } from '@/lib/constants'
import { USE_SUPABASE } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { cn } from '@/lib/utils'

const RESEND_SECONDS = 30

/** One real input (autocomplete="one-time-code"), drawn as six boxes. */
function CodeInput({ value, onChange, onComplete, invalid, disabled }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        aria-label="6-digit code"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          onChange(v)
          if (v.length === 6) onComplete(v)
        }}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => {
          const focused = value.length === i || (i === 5 && value.length === 6)
          return (
            <div
              key={i}
              className={cn(
                'flex h-14 items-center justify-center rounded-md border bg-white font-mono text-h2 text-ink-900 shadow-xs transition-[border-color,box-shadow]',
                invalid ? 'border-danger-600' : focused ? 'border-teal-600 ring-[3px] ring-teal-100' : 'border-ink-300',
              )}
            >
              {value[i] ?? ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const { reset } = useAuth()
  const [step, setStep] = useState('start') // start | code
  const [local, setLocal] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [cooldown, setCooldown] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const email = `${local.trim().toLowerCase()}@${PSG_DOMAIN}`

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (step !== 'code') return
    const t = setTimeout(() => setShowHelp(true), 60_000)
    return () => clearTimeout(t)
  }, [step])

  const send = useMutation({
    mutationFn: () => sendOtp(email),
    onSuccess: () => {
      setStep('code')
      setCode('')
      setError(null)
      setCooldown(RESEND_SECONDS)
    },
    onError: (e) => setError(e.code === 'network' ? 'Couldn’t send the code. Check your connection and try again.' : e.message),
  })

  const verify = useMutation({
    mutationFn: (c) => verifyOtp(email, c),
    onSuccess: async (user) => {
      await reset()
      navigate(user.onboarded_at ? consumeReturnTo() ?? '/home' : '/onboarding', { replace: true })
    },
    onError: (e) => {
      setError(e.code === 'network' ? 'Couldn’t verify. Check your connection and try again.' : e.message)
      setCode('')
      if (e.code === 'otp_expired') setCooldown(RESEND_SECONDS)
    },
  })

  /* Pasting the full college address is fine; anything else isn't (D19). */
  const localError = local.includes('@') ? 'Use your college email ending in @psgtech.ac.in. Personal email addresses can’t be used.' : null

  return (
    <AuthLayout
      aside={USE_SUPABASE && !import.meta.env.DEV ? null : 
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-caption text-ink-500">
          <FlaskConical className="size-3.5" aria-hidden />
          {USE_SUPABASE ? (
            import.meta.env.DEV ? <>Local: codes arrive in <a className="underline" href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">Mailpit</a></> : null
          ) : (
            'Prototype: the demo code is 123456'
          )}
        </p>
      }
    >
      {step === 'start' ? (
        <>
          <h1 className="text-h2">Sign in with your college email</h1>
          <p className="mt-1.5 text-body text-ink-600">We’ll send a 6-digit code to your @psgtech.ac.in inbox. No password needed.</p>

          <form
            noValidate
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!local.trim()) return setError('Enter your college email.')
              if (localError) return
              send.mutate()
            }}
          >
            <Field label="College email" error={localError ?? (step === 'start' ? error : null)}>
              <Input
                value={local}
                autoFocus
                onChange={(e) => { setLocal(e.target.value.replace(/\s/g, '').replace(/@psgtech\.ac\.in$/i, '')); setError(null) }}
                placeholder="22z201"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                suffix={`@${PSG_DOMAIN}`}
              />
            </Field>
            <Button type="submit" className="w-full" size="lg" loading={send.isPending}>
              <Mail /> Send code
            </Button>
          </form>

          <p className="mt-6 text-center text-small text-ink-500">
            By continuing you agree to the <Link to="/guidelines" className="font-medium text-ink-700 underline-offset-2 hover:underline">Guidelines</Link> and{' '}
            <Link to="/privacy" className="font-medium text-ink-700 underline-offset-2 hover:underline">Privacy policy</Link>.
          </p>
        </>
      ) : (
        <>
          <button onClick={() => { setStep('start'); setError(null) }} className="-ml-1 mb-4 inline-flex items-center gap-1 rounded-md px-1 text-small font-medium text-ink-600 hover:text-ink-900">
            <ArrowLeft className="size-4" aria-hidden /> Change email
          </button>
          <h1 className="text-h2">Check your email</h1>
          <p className="mt-1.5 text-body text-ink-600">
            Enter the 6-digit code sent to <span className="font-medium text-ink-900">{email}</span>
          </p>
          <div className="mt-6">
            <CodeInput value={code} onChange={(v) => { setCode(v); setError(null) }} onComplete={(v) => verify.mutate(v)} invalid={!!error} disabled={verify.isPending} />
            <div className="mt-3 min-h-5" aria-live="polite">
              {verify.isPending ? <p className="text-small text-ink-500">Verifying…</p> : error ? <p className="text-small text-danger-600" role="alert">{error}</p> : null}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-small">
            {cooldown > 0 ? (
              <span className="text-ink-500 tabular">Resend code in 0:{String(cooldown).padStart(2, '0')}</span>
            ) : (
              <button className="font-medium text-teal-700 hover:underline" onClick={() => send.mutate()} disabled={send.isPending}>
                Resend code
              </button>
            )}
          </div>
          {showHelp && (
            <p className="mt-5 rounded-md bg-ink-50 p-3 text-small text-ink-600">
              Didn’t get it? Check Spam and Promotions. Codes come from no-reply@roundwise.app and expire after 10 minutes.
            </p>
          )}
        </>
      )}
    </AuthLayout>
  )
}
