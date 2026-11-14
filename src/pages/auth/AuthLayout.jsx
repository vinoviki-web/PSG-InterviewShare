import { Link } from 'react-router'
import { Logo } from '@/components/Logo'

export function AuthLayout({ children, aside }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[440px]">
          <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
          {aside}
        </div>
      </main>
      <footer className="pb-6 text-center text-small text-ink-500">
        <Link to="/guidelines" className="hover:text-ink-900">Guidelines</Link>
        <span className="mx-2 text-ink-300">·</span>
        <Link to="/privacy" className="hover:text-ink-900">Privacy</Link>
      </footer>
    </div>
  )
}
