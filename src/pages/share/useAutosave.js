import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { saveDraft } from '@/api/drafts'
import { isMeaningful, toPayload } from './schema'

const DEBOUNCE = 1500
const PREFIX = 'rw-share-local:'

/* ---------------- Local fallback (per draft, or "new" before the row exists) ---------------- */
export const localKey = (id, mode = 'draft') => `${PREFIX}${mode === 'edit' ? 'edit:' : ''}${id ?? 'new'}`
export function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
export function writeLocal(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    /* storage full or blocked: nothing else to fall back to */
  }
}
export function clearLocal(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Autosave for the share wizard (spec §9.9).
 * - Every change is mirrored to localStorage immediately (survives a killed tab).
 * - Draft mode: debounced server save (1.5s), plus `flush()` on step change,
 *   on `visibilitychange` and on reconnect. The draft row is created on the
 *   first meaningful change (company or role).
 * - Edit mode (published experience): never writes the live row; changes stay
 *   local until "Update".
 */
export function useAutosave({ form, mode, initialId, initialSavedAt, stepRef, maxStepRef, onCreated }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState(mode === 'edit' ? 'edit-clean' : initialId ? 'saved' : 'idle')
  const [savedAt, setSavedAt] = useState(initialSavedAt ?? null)
  const idRef = useRef(initialId ?? null)
  const rev = useRef(0)
  const synced = useRef(0)
  const timer = useRef(null)
  const inflight = useRef(null)
  const again = useRef(false)
  const stopped = useRef(false)

  const snapshot = useCallback(
    () => writeLocal(localKey(idRef.current, mode), { values: form.getValues(), step: stepRef.current, maxStep: maxStepRef.current, savedAt: new Date().toISOString() }),
    [form, mode, stepRef, maxStepRef],
  )

  const save = useCallback(async () => {
    if (mode === 'edit' || stopped.current) return true
    if (inflight.current) {
      again.current = true
      return inflight.current
    }
    const values = form.getValues()
    if (!idRef.current && !isMeaningful(values)) return true
    const at = rev.current
    setStatus('saving')
    const run = (async () => {
      try {
        const res = await saveDraft({ ...toPayload(values), id: idRef.current ?? undefined, draft_step: stepRef.current, draft_max_step: maxStepRef.current })
        if (stopped.current) return true
        if (!idRef.current) {
          clearLocal(localKey(null))
          idRef.current = res.id
          onCreated?.(res.id)
        }
        synced.current = Math.max(synced.current, at)
        if (rev.current === at) clearLocal(localKey(res.id))
        else snapshot()
        setSavedAt(res.updated_at)
        setStatus('saved')
        qc.invalidateQueries({ queryKey: ['drafts'] })
        return true
      } catch {
        snapshot()
        setStatus('offline')
        return false
      } finally {
        inflight.current = null
      }
    })()
    inflight.current = run
    const ok = await run
    if (again.current && !stopped.current) {
      again.current = false
      if (rev.current > synced.current) return save()
    }
    return ok
  }, [form, mode, stepRef, maxStepRef, onCreated, qc, snapshot])

  /** Save now. `force` also saves when only the step changed (draft_step). */
  const flush = useCallback(
    async ({ force = false } = {}) => {
      clearTimeout(timer.current)
      if (mode === 'edit' || stopped.current) return true
      if (inflight.current) await inflight.current
      if (force || rev.current > synced.current || !idRef.current) return save()
      return true
    },
    [mode, save],
  )

  // Watch every change.
  useEffect(() => {
    const sub = form.watch(() => {
      if (stopped.current) return
      rev.current += 1
      snapshot()
      if (mode === 'edit') {
        setStatus('edit-dirty')
        return
      }
      clearTimeout(timer.current)
      timer.current = setTimeout(save, DEBOUNCE)
    })
    return () => sub.unsubscribe()
  }, [form, mode, save, snapshot])

  // Background / reconnect.
  useEffect(() => {
    const onVis = () => document.visibilityState === 'hidden' && flush()
    const onOnline = () => rev.current > synced.current && flush()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      clearTimeout(timer.current)
    }
  }, [flush])

  // Retry an offline draft every 20s while the page is open.
  useEffect(() => {
    if (status !== 'offline') return
    const id = setInterval(() => navigator.onLine !== false && save(), 20000)
    return () => clearInterval(id)
  }, [status, save])

  const hasUnsynced = useCallback(() => {
    if (stopped.current) return false
    if (mode === 'edit') return rev.current > 0
    return rev.current > synced.current && (!!idRef.current || isMeaningful(form.getValues()))
  }, [mode, form])

  /** Stop saving (after publish / delete) and drop local copies. */
  const stop = useCallback(() => {
    stopped.current = true
    clearTimeout(timer.current)
    clearLocal(localKey(idRef.current, mode))
    clearLocal(localKey(null))
  }, [mode])

  return { status, savedAt, flush, hasUnsynced, stop, draftId: () => idRef.current }
}
