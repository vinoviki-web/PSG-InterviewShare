import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ThumbsUp, Bookmark, BookmarkCheck } from 'lucide-react'
import { toggleHelpful, toggleBookmark } from '@/api/experiences'
import { useToast } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Optimistically patches every cached copy of an experience (lists, detail,
 * saved) so the UI updates instantly, then reconciles with the server.
 */
function patchCaches(qc, id, patch) {
  const apply = (e) => (e && e.id === id ? { ...e, ...patch(e) } : e)
  qc.setQueriesData({ queryKey: ['experience', id] }, apply)
  qc.setQueriesData({ queryKey: ['experiences'] }, (data) => {
    if (!data) return data
    if (data.pages) return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map(apply) })) }
    if (Array.isArray(data)) return data.map(apply)
    if (data.items) return { ...data, items: data.items.map(apply) }
    return data
  })
}

export function useHelpful(exp) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: () => toggleHelpful(exp.id),
    onMutate: () => {
      const prev = { has_voted: exp.has_voted, helpful_count: exp.helpful_count }
      patchCaches(qc, exp.id, (e) => ({ has_voted: !e.has_voted, helpful_count: Math.max(0, e.helpful_count + (e.has_voted ? -1 : 1)) }))
      return prev
    },
    onError: (err, _v, prev) => {
      patchCaches(qc, exp.id, () => prev)
      toast.error(err.message === 'Simulated network failure' ? 'Couldn’t save your vote. Try again.' : err.message)
    },
    onSuccess: (res) => patchCaches(qc, exp.id, () => res),
  })
}

export function useSave(exp) {
  const qc = useQueryClient()
  const toast = useToast()
  const m = useMutation({
    mutationFn: () => toggleBookmark(exp.id),
    onMutate: () => {
      const prev = exp.has_saved
      patchCaches(qc, exp.id, (e) => ({ has_saved: !e.has_saved }))
      return prev
    },
    onError: (_e, _v, prev) => {
      patchCaches(qc, exp.id, () => ({ has_saved: prev }))
      toast.error('Couldn’t update your saved list. Try again.')
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['experiences', 'saved'] })
      if (!res.has_saved) toast.info('Removed from saved', { action: { label: 'Undo', onClick: () => m.mutate() } })
      else toast.success('Saved. Find it under Saved.')
    },
  })
  return m
}

export function HelpfulButton({ exp, size = 'md', className }) {
  const m = useHelpful(exp)
  const disabled = exp.is_owner
  return (
    <button
      type="button"
      onClick={() => m.mutate()}
      disabled={disabled}
      aria-pressed={exp.has_voted}
      title={disabled ? 'You can’t vote on your own experience' : exp.has_voted ? 'Remove helpful vote' : 'Mark as helpful'}
      className={cn(
        'group inline-flex items-center gap-2 rounded-md border font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-2.5 text-small' : 'h-10 px-3.5 text-body',
        exp.has_voted ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-ink-300 bg-white text-ink-700 shadow-xs hover:bg-ink-50',
        className,
      )}
    >
      <ThumbsUp key={String(exp.has_voted)} className={cn('size-4', exp.has_voted && 'animate-pop fill-teal-600/15')} aria-hidden />
      Helpful
      <span className="tabular text-ink-500 group-aria-pressed:text-teal-700">{exp.helpful_count}</span>
    </button>
  )
}

export function SaveButton({ exp, variant = 'button', className }) {
  const m = useSave(exp)
  const Icon = exp.has_saved ? BookmarkCheck : Bookmark
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          m.mutate()
        }}
        aria-pressed={exp.has_saved}
        aria-label={exp.has_saved ? `Remove ${exp.company?.name} ${exp.role_title} from saved` : `Save ${exp.company?.name} ${exp.role_title}`}
        className={cn(
          'relative z-10 inline-flex size-9 items-center justify-center rounded-md transition-colors',
          exp.has_saved ? 'text-teal-700 hover:bg-teal-50' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-700',
          className,
        )}
      >
        <Icon key={String(exp.has_saved)} className={cn('size-[18px]', exp.has_saved && 'animate-pop fill-teal-600/15')} aria-hidden />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => m.mutate()}
      aria-pressed={exp.has_saved}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-body font-medium transition-colors',
        exp.has_saved ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-ink-300 bg-white text-ink-700 shadow-xs hover:bg-ink-50',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {exp.has_saved ? 'Saved' : 'Save'}
    </button>
  )
}
