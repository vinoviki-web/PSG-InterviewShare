import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton, Skeleton } from '@/components/ui'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

/**
 * DataTable (spec §3.2): sortable headers, sticky header, pagination,
 * loading and empty rows. Below md it renders a card list (spec §10: no
 * horizontal scroll on admin tables).
 *
 * columns: [{ id, header, cell(row), sort?(row) → comparable, align?, className?, headerClassName? }]
 * The first column is the row's accessible trigger: it is wrapped in a
 * <button>, so its cell must render phrasing content (spans).
 */
export function DataTable({
  label,
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  card,
  selectedKey,
  loading,
  empty,
  pageSize = 20,
  initialSort,
  resetKey,
  dim,
}) {
  const desktop = useIsDesktop()
  const [sort, setSort] = useState(initialSort ?? null)
  const [page, setPage] = useState(0)

  useEffect(() => setPage(0), [resetKey])

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? []
    const col = columns.find((c) => c.id === sort.id)
    if (!col?.sort) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = col.sort(a)
      const y = col.sort(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir
    })
  }, [rows, sort, columns])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize)

  const toggleSort = (col) =>
    setSort((s) => (s?.id === col.id ? { id: col.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id: col.id, dir: col.defaultDir ?? 'asc' }))

  if (loading) return desktop ? <TableSkeleton columns={columns} /> : <CardSkeleton />
  if (!sorted.length) return <div className="rounded-lg border border-ink-200 bg-white shadow-xs">{empty}</div>

  const footer = sorted.length > pageSize && (
    <div className="flex items-center justify-between gap-3 px-1 pt-3 text-small text-ink-600">
      <p className="tabular" aria-live="polite">
        {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}
      </p>
      <div className="flex items-center gap-1">
        <IconButton variant="secondary" size="sm" label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} className="disabled:opacity-40">
          <ChevronLeft />
        </IconButton>
        <span className="tabular px-2">
          Page {current + 1} of {pages}
        </span>
        <IconButton variant="secondary" size="sm" label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="disabled:opacity-40">
          <ChevronRight />
        </IconButton>
      </div>
    </div>
  )

  if (!desktop) {
    return (
      <div className={cn('transition-opacity duration-[180ms]', dim && 'opacity-60')}>
        <ul className="space-y-2" aria-label={label}>
          {visible.map((row) => {
            const k = rowKey(row)
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'block w-full rounded-lg border bg-white p-4 text-left shadow-xs transition-[border-color,box-shadow] duration-[120ms] hover:border-ink-300 hover:shadow-sm',
                    selectedKey === k ? 'border-teal-600 ring-1 ring-teal-600' : 'border-ink-200',
                  )}
                >
                  {card(row)}
                  {rowLabel && <span className="sr-only"> ({rowLabel(row)})</span>}
                </button>
              </li>
            )
          })}
        </ul>
        {footer}
      </div>
    )
  }

  return (
    <div className={cn('transition-opacity duration-[180ms]', dim && 'opacity-60')}>
      <div className="rounded-lg border border-ink-200 bg-white shadow-xs">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left text-body" aria-label={label}>
          <thead>
            <tr>
              {columns.map((col, i) => {
                const active = sort?.id === col.id
                const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'sticky top-16 z-[1] h-10 border-b border-ink-200 bg-ink-50 px-4 text-caption font-medium text-ink-600',
                      i === 0 && 'rounded-tl-lg',
                      i === columns.length - 1 && 'rounded-tr-lg',
                      col.align === 'right' && 'text-right',
                      col.className,
                      col.headerClassName,
                    )}
                  >
                    {col.sort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-ink-900', active && 'text-ink-900', col.align === 'right' && 'flex-row-reverse')}
                      >
                        {col.header}
                        <Icon className={cn('size-3.5', !active && 'text-ink-500')} aria-hidden />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => {
              const k = rowKey(row)
              const last = ri === visible.length - 1
              return (
                <tr
                  key={k}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'group transition-colors duration-[120ms]',
                    onRowClick && 'cursor-pointer',
                    selectedKey === k ? 'bg-teal-50' : 'hover:bg-ink-25',
                  )}
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.id}
                      className={cn(
                        'px-4 py-3 align-middle',
                        !last && 'border-b border-ink-200',
                        col.align === 'right' && 'text-right',
                        col.className,
                      )}
                    >
                      {i === 0 && onRowClick ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRowClick(row)
                          }}
                          className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                        >
                          {col.cell(row)}
                          {rowLabel && <span className="sr-only"> ({rowLabel(row)})</span>}
                        </button>
                      ) : (
                        col.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  )
}

function TableSkeleton({ columns }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xs" aria-busy="true" aria-label="Loading">
      <div className="flex h-10 items-center gap-4 border-b border-ink-200 bg-ink-50 px-4">
        {columns.map((c, i) => (
          <Skeleton key={c.id} className={cn('h-3', i === 0 ? 'w-24' : 'w-14', c.className)} />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-ink-200 px-4 py-3.5 last:border-0">
          <Skeleton className="size-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="hidden h-3.5 w-20 lg:block" />
          <Skeleton className="h-6 w-20 rounded-sm" />
        </div>
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-ink-200 bg-white p-4 shadow-xs">
          <div className="flex gap-3">
            <Skeleton className="size-8 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="mt-3 h-5 w-24 rounded-sm" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
