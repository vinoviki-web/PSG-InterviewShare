import { useEffect, useState } from 'react'

/**
 * Returns the id of the last section whose top has scrolled past `offset`.
 * Uses a rAF-throttled scroll listener: IntersectionObserver only reports
 * changed entries, which makes "which section am I in" unreliable.
 */
export function useScrollSpy(ids, offset = 140) {
  const [active, setActive] = useState(ids[0])
  const key = ids.join('|')
  useEffect(() => {
    let frame = 0
    const compute = () => {
      frame = 0
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top - offset <= 0) current = id
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = ids[ids.length - 1]
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [key, offset]) // eslint-disable-line react-hooks/exhaustive-deps
  return active
}
