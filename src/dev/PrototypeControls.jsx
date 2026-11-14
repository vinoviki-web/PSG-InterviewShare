import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { FlaskConical, X, RotateCcw } from 'lucide-react'
import { controls, setControls, subscribeControls, resetDb, DEMO } from './protoState'
import { switchPersona } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { Segmented, Switch, Button } from '@/components/ui'
import { cn } from '@/lib/utils'

const PERSONAS = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'newbie', label: 'New' },
  { value: 'student', label: 'Student' },
  { value: 'moderator', label: 'Mod' },
  { value: 'admin', label: 'Admin' },
]

/**
 * Dev-only panel (DECISIONS.md I3). Lets reviewers switch persona and
 * simulate slow network, failures and empty data to see every state.
 */
export function PrototypeControls() {
  const [open, setOpen] = useState(false)
  const c = useSyncExternalStore(subscribeControls, () => JSON.stringify(controls))
  const state = JSON.parse(c)
  const { user, reset } = useAuth()
  const navigate = useNavigate()
  const current = !user ? 'visitor' : Object.entries(DEMO).find(([, u]) => u.id === user.id)?.[0] ?? 'student'

  const apply = async (patch) => {
    setControls(patch)
    await reset()
  }

  return (
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-3 z-30 md:bottom-4 md:left-4">
      {open ? (
        <div className="w-[300px] rounded-xl border border-ink-200 bg-white p-4 shadow-lg animate-rise" role="dialog" aria-label="Prototype controls">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-body font-semibold text-ink-900">
              <FlaskConical className="size-4 text-teal-600" aria-hidden /> Prototype controls
            </p>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-ink-500 hover:bg-ink-100" aria-label="Close prototype controls">
              <X className="size-4" />
            </button>
          </div>
          <p className="mb-1.5 text-caption font-medium text-ink-500">View as</p>
          <Segmented
            size="sm"
            className="w-full! [&>button]:flex-1 [&>button]:px-1"
            options={PERSONAS}
            value={current}
            onValueChange={async (p) => {
              switchPersona(p === 'visitor' ? null : DEMO[p].id)
              await reset()
              navigate(p === 'visitor' ? '/' : p === 'newbie' ? '/onboarding' : p === 'admin' ? '/admin' : p === 'moderator' ? '/mod' : '/home')
            }}
          />
          <div className="mt-4 space-y-3 border-t border-ink-200 pt-4">
            <Switch id="pc-slow" label="Slow network" description="~2s per request, to check skeletons" checked={state.latency === 'slow'} onCheckedChange={(v) => apply({ latency: v ? 'slow' : 'normal' })} />
            <Switch id="pc-empty" label="Empty data" description="Lists return nothing" checked={state.empty} onCheckedChange={(v) => apply({ empty: v })} />
            <Switch id="pc-fail" label="Requests fail" description="Every call errors, to check error states" checked={state.fail} onCheckedChange={(v) => apply({ fail: v })} />
          </div>
          <div className="mt-4 border-t border-ink-200 pt-3">
            <p className="mb-2 text-caption text-ink-500">Demo sign-in code: <span className="font-mono text-ink-800">123456</span> · expired: <span className="font-mono text-ink-800">000000</span></p>
            <Button variant="ghost" size="sm" className="-ml-2" onClick={resetDb}>
              <RotateCcw /> Reset prototype data
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-full border border-ink-200 bg-white px-3 text-small font-medium text-ink-700 shadow-md hover:bg-ink-50',
            (state.fail || state.empty || state.latency === 'slow') && 'border-warning-200 bg-warning-50 text-warning-600',
          )}
        >
          <FlaskConical className="size-4" aria-hidden />
          Prototype
        </button>
      )}
    </div>
  )
}
