import { Suspense, useEffect, useState } from 'react'
import { NavLink, Link, Outlet, useNavigate, useLocation, ScrollRestoration } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  House, Compass, Building2, Bookmark, UserRound, Plus, Search, Settings, LogOut, ShieldCheck, Gauge, FileText, Info, X, TriangleAlert,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { OwnerCredit } from '@/components/OwnerCredit'
import { Avatar, Button, IconButton, Kbd, Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel, Skeleton, useToast } from '@/components/ui'
import { CommandPalette } from '@/components/CommandPalette'
import { useAuth } from '@/hooks/useAuth'
import { signOut } from '@/api/auth'
import { getAnnouncement } from '@/api/public'
import { cn } from '@/lib/utils'
import { USE_SUPABASE } from '@/lib/supabase'

const NAV = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/experiences', label: 'Explore', icon: Compass },
  { to: '/companies', label: 'Companies', icon: Building2 },
]

function useHotkey(handler) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handler])
}

function AccountMenu() {
  const { user, isModerator, isAdmin, reset } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="rounded-full ring-offset-2 transition-shadow hover:ring-2 hover:ring-ink-200">
          <Avatar name={user.full_name} src={user.avatar_url} size={32} />
          <span className="sr-only">Account menu</span>
        </button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="truncate text-body font-medium text-ink-900">{user.full_name}</p>
          <p className="truncate text-small text-ink-500">{user.email}</p>
        </div>
        <MenuSeparator />
        <MenuItem icon={UserRound} onSelect={() => navigate('/me')}>My profile</MenuItem>
        <MenuItem icon={Bookmark} onSelect={() => navigate('/saved')}>Saved</MenuItem>
        <MenuItem icon={FileText} onSelect={() => navigate('/me?tab=drafts')}>Drafts</MenuItem>
        <MenuItem icon={Settings} onSelect={() => navigate('/settings')}>Settings</MenuItem>
        {(isModerator || isAdmin) && (
          <>
            <MenuSeparator />
            <MenuLabel>Team</MenuLabel>
            {isModerator && <MenuItem icon={ShieldCheck} onSelect={() => navigate('/mod')}>Moderation</MenuItem>}
            {isAdmin && <MenuItem icon={Gauge} onSelect={() => navigate('/admin')}>Admin</MenuItem>}
          </>
        )}
        <MenuSeparator />
        <MenuItem
          icon={LogOut}
          onSelect={async () => {
            await signOut()
            await reset()
            navigate('/')
            toast.info('You’re signed out.')
          }}
        >
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function TopNav({ onSearch }) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="container-page flex h-16 items-center gap-6">
        <Logo to="/home" />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-9 items-center rounded-md px-3 text-body font-medium transition-colors',
                  isActive ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onSearch}
            className="hidden h-9 w-[260px] items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 text-body text-ink-500 transition-colors hover:border-ink-300 hover:bg-white lg:flex"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">Search</span>
            <Kbd>⌘K</Kbd>
          </button>
          <IconButton label="Search" onClick={onSearch} className="lg:hidden">
            <Search />
          </IconButton>
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link to="/share"><Plus /> Share experience</Link>
          </Button>
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}

/** Small print on every signed-in page: this is not an official college service. */
function AppFooter() {
  return (
    <footer className="container-page mt-12 flex flex-col gap-2 border-t border-ink-200 pt-6 text-caption text-ink-500 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p>An independent student project. Not affiliated with or endorsed by PSG College of Technology.</p>
        <OwnerCredit />
      </div>
      <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Footer">
        <Link to="/about" className="hover:text-ink-900">About</Link>
        <Link to="/guidelines" className="hover:text-ink-900">Guidelines</Link>
        <Link to="/privacy" className="hover:text-ink-900">Privacy</Link>
        <Link to="/terms" className="hover:text-ink-900">Terms</Link>
      </nav>
    </footer>
  )
}

function BottomNav() {
  const items = [
    NAV[0],
    NAV[1],
    { to: '/share', label: 'Share', icon: Plus, accent: true },
    { to: '/saved', label: 'Saved', icon: Bookmark },
    { to: '/me', label: 'Me', icon: UserRound },
  ]
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 backdrop-blur-md md:hidden" aria-label="Primary">
      <ul className="grid h-16 grid-cols-5">
        {items.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              className={({ isActive }) =>
                cn('flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-ink-900' : 'text-ink-500')
              }
            >
              {({ isActive }) =>
                n.accent ? (
                  <>
                    <span className="inline-flex size-9 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm">
                      <n.icon className="size-5" aria-hidden />
                    </span>
                    <span className="sr-only">{n.label}</span>
                  </>
                ) : (
                  <>
                    <n.icon className="size-[22px]" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
                    {n.label}
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function AnnouncementBanner() {
  const { data } = useQuery({ queryKey: ['announcement'], queryFn: getAnnouncement, staleTime: 300_000 })
  const [dismissed, setDismissed] = useState(false)
  if (!data || dismissed) return null
  const warn = data.tone === 'warning'
  const Icon = warn ? TriangleAlert : Info
  return (
    <div className={cn('border-b', warn ? 'border-warning-200 bg-warning-50' : 'border-teal-200 bg-teal-50')} role={warn ? 'alert' : 'status'}>
      <div className={cn('container-page flex items-center gap-3 py-2 text-small', warn ? 'text-warning-600' : 'text-teal-800')}>
        <Icon className="size-4 shrink-0" aria-hidden />
        <p className="flex-1">{data.text}</p>
        <button onClick={() => setDismissed(true)} className={cn('rounded p-1', warn ? 'hover:bg-warning-200/50' : 'hover:bg-teal-100')} aria-label="Dismiss announcement">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function PageFallback() {
  return (
    <div className="container-page space-y-4 py-8" aria-busy>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="space-y-3 pt-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}
      </div>
    </div>
  )
}

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  useHotkey(() => setPaletteOpen((o) => !o))
  const loc = useLocation()
  const hideBottom = loc.pathname.startsWith('/share')
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-md">
        Skip to content
      </a>
      <AnnouncementBanner />
      {USE_SUPABASE && import.meta.env.DEV && (
        <div className="border-b border-ink-200 bg-ink-100">
          <p className="container-page py-1.5 text-caption text-ink-600">
            <span className="font-semibold text-ink-800">Database mode.</span> Every section runs on the database.
          </p>
        </div>
      )}
      <TopNav onSearch={() => setPaletteOpen(true)} />
      <main id="main" className={cn('flex-1', hideBottom ? 'pb-0' : 'pb-24 md:pb-12')}>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
        {!hideBottom && <AppFooter />}
      </main>
      {!hideBottom && <BottomNav />}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ScrollRestoration getKey={(l) => l.pathname + l.search} />
    </div>
  )
}
