import { useEffect, useMemo, useState } from 'react'
import { Dialog as D } from 'radix-ui'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Search, ArrowRight, Building2, FileText, House, Compass, Bookmark, Settings, PenLine, CornerDownLeft } from 'lucide-react'
import { listAllCompanies } from '@/api/companies'
import { searchExperiences } from '@/api/experiences'
import { CompanyLogo, Kbd } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/hooks/useDebounced'

const PAGES = [
  { label: 'Home', to: '/home', icon: House },
  { label: 'Explore experiences', to: '/experiences', icon: Compass },
  { label: 'Companies', to: '/companies', icon: Building2 },
  { label: 'Share an experience', to: '/share', icon: PenLine },
  { label: 'Saved', to: '/saved', icon: Bookmark },
  { label: 'Settings', to: '/settings', icon: Settings },
]

const RECENT_KEY = 'rw-recent-searches'
const getRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? [] } catch { return [] } }
const pushRecent = (q) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...getRecent().filter((x) => x !== q)].slice(0, 5))) } catch { /* ignore */ } }

export function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const dq = useDebounced(q.trim(), 200)
  const { data: companies = [] } = useQuery({ queryKey: ['companies', 'all'], queryFn: listAllCompanies, enabled: open, staleTime: 60_000 })
  const { data: exps } = useQuery({
    queryKey: ['palette', dq],
    queryFn: () => searchExperiences({ q: dq, limit: 5 }),
    enabled: open && dq.length >= 2,
    placeholderData: (prev) => prev,
  })

  useEffect(() => { if (!open) { setQ(''); setActive(0) } }, [open])

  const items = useMemo(() => {
    const ql = dq.toLowerCase()
    const out = []
    if (!ql) {
      getRecent().forEach((r) => out.push({ group: 'Recent searches', label: r, icon: Search, run: () => setQ(r), keep: true }))
      PAGES.forEach((p) => out.push({ group: 'Go to', label: p.label, icon: p.icon, run: () => navigate(p.to) }))
      return out
    }
    companies
      .filter((c) => c.name.toLowerCase().includes(ql) || c.aliases?.some((a) => a.toLowerCase().includes(ql)))
      .slice(0, 4)
      .forEach((c) => out.push({ group: 'Companies', label: c.name, meta: `${c.experience_count} experiences`, company: c.name, run: () => navigate(`/companies/${c.slug}`) }))
    if (dq.length >= 2)
      (exps?.items ?? []).forEach((e) =>
        out.push({ group: 'Experiences', label: `${e.company.name} · ${e.role_title}`, meta: `${e.department?.code ?? 'Anonymous'} ’${String(e.graduation_year).slice(-2)}`, icon: FileText, run: () => navigate(`/experiences/${e.id}`) }),
      )
    out.push({ group: 'Search', label: `Search all experiences for “${dq}”`, icon: ArrowRight, run: () => navigate(`/experiences?q=${encodeURIComponent(dq)}`) })
    PAGES.filter((p) => p.label.toLowerCase().includes(ql)).forEach((p) => out.push({ group: 'Go to', label: p.label, icon: p.icon, run: () => navigate(p.to) }))
    return out
  }, [dq, companies, exps, navigate])

  const run = (item) => {
    if (dq) pushRecent(dq)
    item.run()
    if (!item.keep) onOpenChange(false)
  }

  let lastGroup = null
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-ink-900/40 animate-fade-in" />
        <D.Content
          className="fixed inset-x-0 top-0 z-50 flex max-h-dvh flex-col overflow-hidden bg-white shadow-lg animate-rise outline-none md:left-1/2 md:top-[12vh] md:max-h-[70vh] md:w-[600px] md:-translate-x-1/2 md:rounded-xl md:border md:border-ink-200"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Search PSG InterviewShare</D.Title>
          <div className="flex items-center gap-3 border-b border-ink-200 px-4">
            <Search className="size-5 shrink-0 text-ink-500" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                if (e.key === 'Enter' && items[active]) { e.preventDefault(); run(items[active]) }
              }}
              placeholder="Search companies, roles, topics, questions…"
              className="h-14 flex-1 bg-transparent text-body-lg text-ink-900 outline-none placeholder:text-ink-500"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={items[active] ? `pal-${active}` : undefined}
            />
            <D.Close className="rounded-md px-2 py-1 text-small text-ink-500 hover:bg-ink-100">Esc</D.Close>
          </div>
          <ul id="palette-list" role="listbox" className="flex-1 overflow-y-auto p-2">
            {items.map((it, i) => {
              const header = it.group !== lastGroup ? it.group : null
              lastGroup = it.group
              const Icon = it.icon
              return (
                <li key={`${it.group}-${it.label}`} role="presentation">
                  {header && <p className="px-2.5 pb-1 pt-3 text-caption font-medium text-ink-500 first:pt-1">{header}</p>}
                  <div
                    id={`pal-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(it)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2', i === active && 'bg-ink-100')}
                  >
                    {it.company ? <CompanyLogo name={it.company} size={32} /> : <span className="inline-flex size-8 items-center justify-center rounded-md bg-ink-100 text-ink-600"><Icon className="size-4" aria-hidden /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink-900">{it.label}</span>
                      {it.meta && <span className="block truncate text-caption text-ink-500">{it.meta}</span>}
                    </span>
                    {i === active && <CornerDownLeft className="size-4 text-ink-500" aria-hidden />}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="hidden items-center gap-4 border-t border-ink-200 px-4 py-2 text-caption text-ink-500 md:flex">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
            <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
