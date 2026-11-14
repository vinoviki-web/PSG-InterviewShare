import { useSyncExternalStore } from 'react'

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useIsDesktop = () => useMediaQuery('(min-width: 768px)')
export const useIsLarge = () => useMediaQuery('(min-width: 1024px)')
