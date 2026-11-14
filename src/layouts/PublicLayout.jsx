import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export function PublicHeader() {
  const { isAuthed } = useAuth()
  const link = ({ isActive }) => cn('hidden h-9 items-center rounded-md px-3 text-body font-medium sm:inline-flex', isActive ? 'text-ink-900' : 'text-ink-600 hover:text-ink-900')
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-ink-50/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-4">
        <Logo />
        <nav className="ml-auto flex items-center gap-1" aria-label="Site">
          <NavLink to="/about" className={link}>About</NavLink>
          <NavLink to="/guidelines" className={link}>Guidelines</NavLink>
          <Button asChild size="sm" variant={isAuthed ? 'primary' : 'secondary'} className="ml-2">
            <Link to={isAuthed ? '/home' : '/login'}>{isAuthed ? 'Open app' : 'Sign in'}</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="container-page flex flex-col gap-4 py-8 text-small text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Built by PSG students, for PSG students. An independent project, not affiliated with or endorsed by PSG College of Technology.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <Link to="/about" className="hover:text-ink-900">About</Link>
          <Link to="/guidelines" className="hover:text-ink-900">Guidelines</Link>
          <Link to="/privacy" className="hover:text-ink-900">Privacy</Link>
          <Link to="/terms" className="hover:text-ink-900">Terms</Link>
        </nav>
      </div>
    </footer>
  )
}

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
      <ScrollRestoration />
    </div>
  )
}
