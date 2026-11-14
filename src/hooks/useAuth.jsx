import { createContext, useContext, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSession } from '@/api/auth'
import { supabase, USE_SUPABASE } from '@/lib/supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const qc = useQueryClient()
  const { data: user, isPending, error, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
    /* Database mode refreshes before the signed avatar URL (1 h) expires. */
    staleTime: USE_SUPABASE ? 45 * 60 * 1000 : Infinity,
    retry: 1,
  })

  /* Keep the app in sync with Supabase Auth: sign-in/out in another tab,
     token refresh failures and "sign out everywhere" all land here. */
  useEffect(() => {
    if (!USE_SUPABASE) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      /* Deferred: calling Supabase from inside this callback can deadlock its auth lock. */
      setTimeout(() => {
        if (event === 'SIGNED_OUT') qc.resetQueries()
        else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') qc.invalidateQueries({ queryKey: ['session'] })
      }, 0)
    })
    return () => data.subscription.unsubscribe()
  }, [qc])
  const value = useMemo(() => {
    const roles = user?.roles ?? []
    return {
      user: user ?? null,
      loading: isPending,
      error,
      roles,
      isAuthed: !!user,
      isOnboarded: !!user?.onboarded_at,
      isModerator: roles.includes('moderator') || roles.includes('admin'),
      isAdmin: roles.includes('admin'),
      refresh: () => refetch(),
      /**
       * After sign-in/out or persona switch. Queries are reset in place
       * (not removed) so mounted observers, including this provider, pick
       * up the new viewer instead of holding a detached cache entry.
       */
      reset: async () => {
        await qc.resetQueries({ queryKey: ['session'] }).catch(() => {})
        qc.resetQueries({ predicate: (q) => q.queryKey[0] !== 'session' }).catch(() => {})
      },
    }
  }, [user, isPending, error, refetch, qc])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
