import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/hooks/useAuth'
import { ToastProvider, TooltipProvider } from '@/components/ui'
import { AppShell, PageFallback } from '@/layouts/AppShell'
import { PublicLayout } from '@/layouts/PublicLayout'
import { RequireStudent, RequireAuthNotOnboarded, RequireRole, RedirectIfAuthed } from '@/routes/guards'
import { NotFoundPage, RouteErrorPage, FullPageLoader, NotConnectedPage } from '@/pages/SystemPages'
import { USE_SUPABASE } from '@/lib/supabase'
import { PrototypeControls } from '@/dev/PrototypeControls'

/* Route-level code splitting (spec §10 performance budget). */
const Landing = lazy(() => import('@/pages/Landing'))
const Login = lazy(() => import('@/pages/auth/Login'))
const Onboarding = lazy(() => import('@/pages/auth/Onboarding'))
const Home = lazy(() => import('@/pages/Home'))
const Explore = lazy(() => import('@/pages/Explore'))
const ExperienceDetail = lazy(() => import('@/pages/ExperienceDetail'))
const Companies = lazy(() => import('@/pages/Companies'))
const CompanyPage = lazy(() => import('@/pages/CompanyPage'))
const Saved = lazy(() => import('@/pages/Saved'))
const Me = lazy(() => import('@/pages/Me'))
const PublicProfile = lazy(() => import('@/pages/PublicProfile'))
const Settings = lazy(() => import('@/pages/Settings'))
const StaticPage = lazy(() => import('@/pages/StaticPages'))
const ShareWizard = lazy(() => import('@/pages/share/ShareWizard'))
const ModerationRoot = lazy(() => import('@/pages/mod/ModerationRoot'))
const AdminRoot = lazy(() => import('@/pages/admin/AdminRoot'))
const DevUi = import.meta.env.DEV || import.meta.env.VITE_DATA_SOURCE !== 'supabase' ? lazy(() => import('@/dev/DevUi')) : null

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, err) => err?.code === 'network' && n < 1, refetchOnWindowFocus: false },
  },
})

function Root() {
  return (
    <>
      <Suspense fallback={<FullPageLoader />}>
        <Outlet />
      </Suspense>
      {!USE_SUPABASE && (import.meta.env.DEV || import.meta.env.VITE_PROTOTYPE) ? <PrototypeControls /> : null}
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <RedirectIfAuthed><Landing /></RedirectIfAuthed> },
          { path: '/about', element: <StaticPage page="about" /> },
          { path: '/guidelines', element: <StaticPage page="guidelines" /> },
          { path: '/privacy', element: <StaticPage page="privacy" /> },
          { path: '/terms', element: <StaticPage page="terms" /> },
        ],
      },
      { path: '/login', element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
      { element: <RequireAuthNotOnboarded />, children: [{ path: '/onboarding', element: <Onboarding /> }] },
      {
        element: <RequireStudent />,
        children: [
          {
            element: <AppShell />,
            errorElement: <RouteErrorPage />,
            children: [
              { path: '/home', element: <Home /> },
              { path: '/experiences', element: <Explore /> },
              { path: '/experiences/:id', element: <ExperienceDetail /> },
              { path: '/companies', element: <Companies /> },
              { path: '/companies/:slug', element: <CompanyPage /> },
              { path: '/saved', element: <Saved /> },
              { path: '/me', element: <Me /> },
              { path: '/u/:handle', element: <PublicProfile /> },
              { path: '/settings', element: <Settings /> },
              { path: '/share', element: <ShareWizard /> },
              { path: '/share/:draftId', element: <ShareWizard /> },
              { element: <RequireRole role="moderator" />, children: [{ path: '/mod/*', element: <ModerationRoot /> }] },
              { element: <RequireRole role="admin" />, children: [{ path: '/admin/*', element: <AdminRoot /> }] },
              // Component showcase: dev server and prototype builds only, never production.
              ...(import.meta.env.DEV || import.meta.env.VITE_DATA_SOURCE !== 'supabase' ? [{ path: '/dev/ui', element: <DevUi /> }] : []),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<PageFallback />}>
              <RouterProvider router={router} />
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
