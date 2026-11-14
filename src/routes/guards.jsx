import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import { FullPageLoader, SuspendedPage, ForbiddenPage } from '@/pages/SystemPages'

const RETURN_KEY = 'rw-return-to'
export const rememberReturnTo = (path) => {
  try { sessionStorage.setItem(RETURN_KEY, path) } catch { /* ignore */ }
}
/* Read without clearing: several guards may redirect during one sign-in,
   and StrictMode renders twice. The path is cleared once the student lands
   inside the app (RequireStudent). Only same-origin paths are honoured. */
export const peekReturnTo = () => {
  try {
    const p = sessionStorage.getItem(RETURN_KEY)
    return p && p.startsWith('/') && !p.startsWith('//') ? p : null
  } catch {
    return null
  }
}
const clearReturnTo = () => {
  try { sessionStorage.removeItem(RETURN_KEY) } catch { /* ignore */ }
}
export const consumeReturnTo = peekReturnTo

/** Signed in + onboarded. Deep links survive sign-in (spec §8 J1). */
export function RequireStudent() {
  const { loading, isAuthed, isOnboarded, user } = useAuth()
  const loc = useLocation()
  const ready = !loading && isAuthed && isOnboarded && user?.status !== 'suspended'
  useEffect(() => { if (ready) clearReturnTo() }, [ready, loc.pathname])
  if (loading) return <FullPageLoader />
  if (!isAuthed) {
    rememberReturnTo(loc.pathname + loc.search + loc.hash)
    return <Navigate to="/login" replace />
  }
  if (user.status === 'suspended') return <SuspendedPage />
  if (!isOnboarded) {
    rememberReturnTo(loc.pathname + loc.search + loc.hash)
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}

export function RequireAuthNotOnboarded() {
  const { loading, isAuthed, isOnboarded } = useAuth()
  if (loading) return <FullPageLoader />
  if (!isAuthed) return <Navigate to="/login" replace />
  if (isOnboarded) return <Navigate to={consumeReturnTo() ?? '/home'} replace />
  return <Outlet />
}

/** UI guard only. Real enforcement is RLS + role-checked RPCs. */
export function RequireRole({ role }) {
  const { isModerator, isAdmin } = useAuth()
  const ok = role === 'admin' ? isAdmin : isModerator
  return ok ? <Outlet /> : <ForbiddenPage role={role} />
}

export function RedirectIfAuthed({ children }) {
  const { loading, isAuthed, isOnboarded } = useAuth()
  if (loading) return <FullPageLoader />
  if (isAuthed) return <Navigate to={isOnboarded ? peekReturnTo() ?? '/home' : '/onboarding'} replace />
  return children
}
