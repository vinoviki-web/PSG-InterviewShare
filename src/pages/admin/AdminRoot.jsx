import { lazy, Suspense, useEffect, useRef } from 'react'
import { NavLink, Navigate, Route, Routes, Link, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Gauge, Users, Building2, Flag, ScrollText, SlidersHorizontal, ShieldCheck, ArrowUpRight } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { listAllReports } from '@/api/admin'
import { cn } from '@/lib/utils'

const Overview = lazy(() => import('./Overview'))
const UsersPage = lazy(() => import('./Users'))
const CompaniesPage = lazy(() => import('./Companies'))
const ReportsPage = lazy(() => import('./Reports'))
const AuditLogPage = lazy(() => import('./AuditLog'))
const SettingsPage = lazy(() => import('./Settings'))

const NAV = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/companies', label: 'Companies', icon: Building2 },
  { to: '/admin/reports', label: 'Reports', icon: Flag, badge: 'escalated' },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: SlidersHorizontal },
]

function useEscalatedCount() {
  const { data } = useQuery({ queryKey: ['admin', 'reports', 'escalated', ''], queryFn: () => listAllReports({ status: 'escalated' }), staleTime: 60_000 })
  return data?.counts?.escalated ?? 0
}

/** Left rail ≥ lg; horizontally scrolling tabs below (spec §9.14). */
function AdminNav() {
  const escalated = useEscalatedCount()
  const loc = useLocation()
  const scroller = useRef(null)

  /* Keep the active tab in view on phones. */
  useEffect(() => {
    scroller.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [loc.pathname])

  const item = (n, layout) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        cn(
          'group inline-flex shrink-0 items-center gap-2.5 font-medium transition-colors duration-[120ms]',
          layout === 'rail'
            ? cn('h-9 w-full rounded-md px-2.5 text-body', isActive ? 'bg-white text-ink-900 shadow-xs ring-1 ring-ink-200' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')
            : cn('-mb-px h-11 border-b-2 px-3 text-body', isActive ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-600 hover:text-ink-900'),
        )
      }
    >
      {({ isActive }) => (
        <>
          <n.icon className={cn('size-[18px] shrink-0', layout === 'rail' && (isActive ? 'text-teal-600' : 'text-ink-500 group-hover:text-ink-600'), layout === 'tabs' && 'hidden sm:block')} aria-hidden />
          <span className="flex-1">{n.label}</span>
          {n.badge && escalated > 0 && (
            <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-900 px-1.5 text-caption text-white" aria-label={`${escalated} escalated`}>
              {escalated}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  return (
    <>
      <nav aria-label="Admin" className="lg:hidden">
        <div ref={scroller} className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-ink-200 px-4 sm:-mx-5 sm:px-5">
          {NAV.map((n) => item(n, 'tabs'))}
        </div>
      </nav>
      <nav aria-label="Admin" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="mb-2 flex items-center gap-1.5 px-2.5 text-caption font-medium uppercase tracking-wider text-ink-500">
            <ShieldCheck className="size-3.5" aria-hidden /> Admin
          </p>
          <div className="flex flex-col gap-0.5">{NAV.map((n) => item(n, 'rail'))}</div>
          <div className="mt-6 border-t border-ink-200 pt-4">
            <Link to="/mod" className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-small font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900">
              Moderation queue <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </nav>
    </>
  )
}

function SubpageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid grid-cols-2 gap-3 pt-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

const TITLES = { '': 'Overview', users: 'Users', companies: 'Companies', reports: 'Reports', audit: 'Audit log', settings: 'Settings' }

export default function AdminRoot() {
  const loc = useLocation()
  useEffect(() => {
    const seg = loc.pathname.replace(/^\/admin\/?/, '').split('/')[0]
    document.title = `${TITLES[seg] ?? 'Admin'} · Admin · Roundwise`
  }, [loc.pathname])

  return (
    <div className="container-page py-4 md:py-8">
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <AdminNav />
        <div className="min-w-0 pt-6 lg:pt-0">
          <Suspense fallback={<SubpageFallback />}>
            <Routes>
              <Route index element={<Overview />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit" element={<AuditLogPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  )
}
