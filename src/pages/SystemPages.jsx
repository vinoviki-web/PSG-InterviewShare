import { Link, useRouteError } from 'react-router'
import { SearchX, ShieldCheck, Ban, TriangleAlert, Plug } from 'lucide-react'
import { Button, Spinner, EmptyState } from '@/components/ui'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'
import { signOut } from '@/api/auth'
import { formatDate } from '@/lib/utils'

export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label="Loading PSG InterviewShare" />
    </div>
  )
}

function Frame({ children }) {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <div className="w-full max-w-[520px]">{children}</div>
    </div>
  )
}

export function NotFoundPage({ title = 'Page not found', message = 'This page was removed or never existed.' }) {
  return (
    <Frame>
      <EmptyState
        icon={SearchX}
        title={title}
        action={
          <>
            <Button asChild><Link to="/home">Go home</Link></Button>
            <Button variant="secondary" asChild><Link to="/experiences">Explore experiences</Link></Button>
          </>
        }
      >
        {message}
      </EmptyState>
    </Frame>
  )
}

export function ForbiddenPage({ role }) {
  return (
    <Frame>
      <EmptyState icon={ShieldCheck} title={`This area is for ${role === 'admin' ? 'admins' : 'moderators'}`} action={<Button asChild><Link to="/home">Go home</Link></Button>}>
        If you think you should have access, ask an admin.
      </EmptyState>
    </Frame>
  )
}

export function SuspendedPage() {
  const { reset, user } = useAuth()
  const reason = user?.suspension_reason
  const until = user?.suspended_until
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center"><Logo /></header>
      <Frame>
        <EmptyState
          icon={Ban}
          title="Your account is suspended"
          action={<Button variant="secondary" onClick={async () => { await signOut(); reset() }}>Sign out</Button>}
        >
          You can’t read or post while suspended.
          {reason && <> Reason: {reason}.</>}
          {until ? <> It ends on {formatDate(until)}.</> : <> It lasts until an admin lifts it.</>}
          {' '}If this is a mistake, contact the moderators through the Guidelines page.
        </EmptyState>
      </Frame>
    </div>
  )
}

export function NotConnectedPage({ what, phase }) {
  return (
    <Frame>
      <EmptyState icon={Plug} title={`${what} isn’t connected yet`} action={<Button asChild variant="secondary"><Link to="/home">Go home</Link></Button>}>
        You’re running against the real database. {what} connects in Phase {phase}. To try it now, run the app without <span className="font-mono text-ink-800">VITE_DATA_SOURCE=supabase</span> to use the prototype data.
      </EmptyState>
    </Frame>
  )
}

export function RouteErrorPage() {
  const err = useRouteError()
  const id = Math.random().toString(36).slice(2, 8).toUpperCase()
  if (import.meta.env.DEV) console.error(err)
  return (
    <Frame>
      <EmptyState
        icon={TriangleAlert}
        title="Something broke on this page"
        action={<Button onClick={() => location.reload()}>Reload</Button>}
      >
        It’s not you. If it keeps happening, report it with error ID <span className="font-mono text-ink-800">{id}</span>.
      </EmptyState>
    </Frame>
  )
}
