import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, GitMerge, Building2, SearchX, BadgeCheck, CircleDashed, ArrowRight, ExternalLink, Pencil, CornerDownRight, Info, ShieldAlert,
} from 'lucide-react'
import {
  Badge, Button, Chip, Combobox, CompanyLogo, ConfirmDialog, Dialog, EmptyState, ErrorState, FetchingBar, Field, Input, Select, Skeleton, Tag, Textarea, CharCount, useToast,
} from '@/components/ui'
import {
  listAdminCompanies, getAdminCompany, saveCompany, setCompanyVerified, previewCompanyMerge, mergeCompanies, listIndustryOptions, DESCRIPTION_SOURCES,
} from '@/api/admin'
import { useDebounced } from '@/hooks/useDebounced'
import { formatDate, formatMonth, timeAgo, pluralize, batchLabel } from '@/lib/utils'
import { DataTable } from '@/components/admin/DataTable'
import { PageHeader, Toolbar, SearchInput, DrawerSection, DetailList, Callout, FormDialog, errorText, focusFirstError, useInvalidateAll } from '@/components/admin/AdminUi'
import { auditLabel, auditSummary, formatDateTime } from '@/components/admin/format'

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'merged', label: 'Merged' },
]
const SOURCE_LABEL = Object.fromEntries(DESCRIPTION_SOURCES.map((s) => [s.value, s.label]))

function CompanyStatus({ c }) {
  if (c.merged_into)
    return (
      <Badge tone="neutral" className="max-w-full">
        <CornerDownRight aria-hidden />
        <span className="truncate">Merged into {c.merged_into.name}</span>
      </Badge>
    )
  return c.is_verified ? (
    <Badge tone="success">
      <BadgeCheck aria-hidden /> Verified
    </Badge>
  ) : (
    <Badge tone="warning">
      <CircleDashed aria-hidden /> Unverified
    </Badge>
  )
}

const COLUMNS = [
  {
    id: 'name',
    header: 'Company',
    sort: (c) => c.name.toLowerCase(),
    cell: (c) => (
      <span className="flex min-w-0 items-center gap-3">
        <CompanyLogo name={c.name} size={32} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink-900">{c.name}</span>
          <span className="block truncate text-small text-ink-500">{c.aliases.length ? `Also: ${c.aliases.join(', ')}` : c.website || c.slug}</span>
        </span>
      </span>
    ),
  },
  { id: 'industry', header: 'Industry', className: 'hidden w-[20%] lg:table-cell', cell: (c) => <span className="block truncate text-ink-700">{c.industry || '—'}</span>, sort: (c) => c.industry },
  { id: 'count', header: 'Experiences', align: 'right', className: 'w-28', cell: (c) => <span className="tabular text-ink-900">{c.experience_count}</span>, sort: (c) => c.experience_count, defaultDir: 'desc' },
  { id: 'status', header: 'Status', className: 'w-44', cell: (c) => <CompanyStatus c={c} />, sort: (c) => (c.merged_into ? 2 : c.is_verified ? 0 : 1) },
  {
    id: 'added',
    header: 'Added',
    className: 'hidden w-32 xl:table-cell',
    cell: (c) => (c.created_at ? <time title={formatDateTime(c.created_at)} className="text-ink-600">{timeAgo(c.created_at)}</time> : '—'),
    sort: (c) => c.created_at,
    defaultDir: 'desc',
  },
]

function CompanyCard({ c }) {
  return (
    <span className="flex items-start gap-3">
      <CompanyLogo name={c.name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink-900">{c.name}</span>
        <span className="block truncate text-small text-ink-500">{[c.industry, c.aliases.length && `Also: ${c.aliases.join(', ')}`].filter(Boolean).join(' · ')}</span>
        <span className="mt-2.5 flex flex-wrap items-center gap-2 text-small text-ink-600">
          <CompanyStatus c={c} />
          <span>{pluralize(c.experience_count, 'experience')}</span>
        </span>
      </span>
    </span>
  )
}

export default function CompaniesPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const dq = useDebounced(q.trim(), 250)
  const status = STATUSES.some((s) => s.value === params.get('status')) ? params.get('status') : 'all'
  const companyId = params.get('company')
  const [form, setForm] = useState(null) // { company } | { company: null } for create
  const [merge, setMerge] = useState(null) // { sourceId }

  const update = (patch) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        Object.entries(patch).forEach(([k, v]) => (v == null || v === '' || v === 'all' ? next.delete(k) : next.set(k, v)))
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    if ((params.get('q') ?? '') !== dq) update({ q: dq })
  }, [dq])

  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ['admin', 'companies', { q: dq, status }],
    queryFn: () => listAdminCompanies({ q: dq, status }),
    placeholderData: (prev) => prev,
  })
  const counts = data?.counts

  return (
    <>
      <PageHeader
        title="Companies"
        description="Keep the company list clean: verify student-added companies, fix details and merge duplicates."
        actions={
          <>
            <Button variant="secondary" onClick={() => setMerge({ sourceId: null })}>
              <GitMerge aria-hidden /> Merge duplicates
            </Button>
            <Button onClick={() => setForm({ company: null })}>
              <Plus aria-hidden /> New company
            </Button>
          </>
        }
      />

      <Toolbar search={<SearchInput value={q} onChange={setQ} placeholder="Search name or alias" label="Search companies" />}>
        <div className="col-span-2 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <Chip key={s.value} selected={status === s.value} onClick={() => update({ status: s.value })} count={counts?.[s.value]}>
              {s.label}
            </Chip>
          ))}
        </div>
      </Toolbar>
      <FetchingBar active={isFetching && !isPending} />

      {error ? (
        <ErrorState title="Couldn’t load companies" message={errorText(error)} onRetry={refetch} />
      ) : (
        <DataTable
          label="Companies"
          columns={COLUMNS}
          rows={data?.items}
          rowKey={(c) => c.id}
          onRowClick={(c) => update({ company: c.id })}
          rowLabel={(c) => `Open ${c.name}`}
          card={(c) => <CompanyCard c={c} />}
          selectedKey={companyId}
          loading={isPending}
          dim={isPlaceholderData}
          resetKey={`${dq}|${status}`}
          empty={
            dq || status !== 'all' ? (
              <EmptyState icon={SearchX} title="No companies match" action={<Button variant="secondary" onClick={() => { setQ(''); update({ q: null, status: null }) }}>Clear filters</Button>}>
                {status === 'unverified' && !dq ? 'Every company is verified.' : status === 'merged' && !dq ? 'No companies have been merged yet.' : 'Try another name or alias.'}
              </EmptyState>
            ) : (
              <EmptyState icon={Building2} title="No companies yet" action={<Button onClick={() => setForm({ company: null })}><Plus aria-hidden /> New company</Button>}>
                Students add companies when they share an experience. You can add them here too.
              </EmptyState>
            )
          }
        />
      )}

      <CompanyDrawer
        companyId={companyId}
        onClose={() => update({ company: null })}
        onEdit={(c) => setForm({ company: c })}
        onMerge={(c) => setMerge({ sourceId: c.id })}
      />
      <CompanyFormDialog open={!!form} company={form?.company} onOpenChange={(o) => !o && setForm(null)} onCreated={(c) => update({ company: c.id })} />
      <MergeDialog open={!!merge} initialSource={merge?.sourceId} onOpenChange={(o) => !o && setMerge(null)} onMerged={(target) => update({ company: target.id })} />
    </>
  )
}

/* ---------------- Drawer ---------------- */
function CompanyDrawer({ companyId, onClose, onEdit, onMerge }) {
  const last = useRef(companyId)
  if (companyId) last.current = companyId
  const id = last.current
  const { data: c, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'company', id], queryFn: () => getAdminCompany(id), enabled: !!id })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const invalidateAll = useInvalidateAll()

  const toggleVerified = async () => {
    setBusy(true)
    try {
      await setCompanyVerified(c.id, !c.is_verified)
      toast.success(c.is_verified ? `${c.name} is marked unverified.` : `${c.name} is verified.`)
      setConfirm(false)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
      invalidateAll()
    }
  }

  const footer =
    c && !error ? (
      c.merged_into ? (
        <p className="flex items-center gap-1.5 text-small text-ink-500 sm:mr-auto">
          <Info className="size-3.5" aria-hidden /> Merged companies are read-only.
        </p>
      ) : (
        <>
          <Button variant="ghost" onClick={() => onMerge(c)} className="sm:mr-auto">
            <GitMerge aria-hidden /> Merge into another…
          </Button>
          {c.is_verified ? (
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              Mark unverified
            </Button>
          ) : (
            <Button variant="secondary" onClick={toggleVerified} loading={busy}>
              <BadgeCheck aria-hidden /> Verify
            </Button>
          )}
          <Button onClick={() => onEdit(c)}>
            <Pencil aria-hidden /> Edit
          </Button>
        </>
      )
    ) : null

  return (
    <>
      <Dialog side="right" open={!!companyId} onOpenChange={(o) => !o && onClose()} title={c?.name ?? 'Company'} description={c ? `/companies/${c.slug}` : undefined} footer={footer}>
        {isPending ? (
          <div className="space-y-6 pt-2" aria-busy="true" aria-label="Loading">
            <div className="flex items-center gap-4">
              <Skeleton className="size-16 rounded-lg" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : error ? (
          <ErrorState title="Couldn’t load this company" message={errorText(error)} onRetry={refetch} className="mt-2" />
        ) : (
          <div className="space-y-6 pb-2 pt-2">
            <div className="flex items-center gap-4">
              <CompanyLogo name={c.name} size={64} />
              <div className="min-w-0">
                <CompanyStatus c={c} />
                {!c.merged_into && (
                  <Link to={`/companies/${c.slug}`} target="_blank" rel="noopener" className="mt-2 flex items-center gap-1 text-small font-medium text-teal-700 hover:underline">
                    View company page <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>
            </div>

            {c.merged_into && (
              <Callout tone="info" icon={CornerDownRight} title={`Merged into ${c.merged_into.name}`}>
                {c.merged_at && `${formatDate(c.merged_at)}. `}Links to /companies/{c.slug} redirect to /companies/{c.merged_into.slug}.
              </Callout>
            )}
            {!c.is_verified && !c.merged_into && (
              <Callout tone="warning" title="Added by a student">
                Check the name and details, merge it if it duplicates another company, then verify it.
              </Callout>
            )}

            <DrawerSection title="Details">
              <DetailList
                items={[
                  { label: 'Industry', value: c.industry || '—' },
                  { label: 'Website', value: c.website ? <a href={`https://${c.website}`} target="_blank" rel="nofollow noopener noreferrer" className="text-teal-700 hover:underline">{c.website}</a> : '—' },
                  { label: 'Experiences', value: `${c.published_count} published · ${c.experience_count} total` },
                  { label: 'Added', value: c.created_at ? `${formatDate(c.created_at)}${c.created_by ? ` · ${c.created_by}` : ''}` : '—' },
                  { label: 'Slug', value: c.slug, mono: true, wide: true },
                ]}
              />
              {c.aliases.length > 0 && (
                <div className="mt-4">
                  <p className="text-caption text-ink-500">Also known as</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.aliases.map((a) => (
                      <Tag key={a}>{a}</Tag>
                    ))}
                  </div>
                </div>
              )}
            </DrawerSection>

            <DrawerSection title="Description">
              {c.description ? (
                <>
                  <p className="text-body text-ink-800">{c.description}</p>
                  <p className="mt-2 text-small text-ink-500">Source: {SOURCE_LABEL[c.description_source] ?? 'Not recorded'}</p>
                </>
              ) : (
                <p className="text-small text-ink-500">No description yet. Company pages show only student-reported data until you add one.</p>
              )}
            </DrawerSection>

            {c.merged_from.length > 0 && (
              <DrawerSection title="Merged into this company" count={c.merged_from.length}>
                <ul className="space-y-1.5 text-small text-ink-700">
                  {c.merged_from.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <CornerDownRight className="size-3.5 text-ink-500" aria-hidden />
                      <span className="font-medium">{m.name}</span>
                      <span className="font-mono text-ink-500">/companies/{m.slug}</span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>
            )}

            {c.history.length > 0 && (
              <DrawerSection title="History">
                <ol className="space-y-3">
                  {c.history.map((a) => (
                    <li key={a.id} className="flex gap-3 text-small">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-ink-800">
                          <span className="font-medium">{auditLabel(a.action)}</span>
                          {auditSummary(a) && <span className="text-ink-600"> · {auditSummary(a)}</span>}
                        </p>
                        <p className="text-ink-500">
                          {a.actor} · <time title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</time>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </DrawerSection>
            )}
          </div>
        )}
      </Dialog>
      {c && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={(o) => !busy && setConfirm(o)}
          title={`Mark ${c.name} as unverified?`}
          body="Its page stays up, but it loses the verified tick until an admin checks it again."
          confirmLabel="Mark unverified"
          loading={busy}
          onConfirm={toggleVerified}
        />
      )}
    </>
  )
}

/* ---------------- Create / edit ---------------- */
const EMPTY_FORM = { name: '', aliases: '', industry: '', website: '', description: '', description_source: 'admin_curated' }

function CompanyFormDialog({ open, company, onOpenChange, onCreated }) {
  const [v, setV] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)
  const toast = useToast()
  const invalidateAll = useInvalidateAll()
  const { data: industryList = [] } = useQuery({ queryKey: ['admin', 'industries'], queryFn: listIndustryOptions, enabled: open })

  useEffect(() => {
    if (!open) return
    setErrors({})
    setV(
      company
        ? {
            name: company.name,
            aliases: company.aliases.join(', '),
            industry: company.industry ?? '',
            website: company.website ?? '',
            description: company.description ?? '',
            description_source: company.description_source ?? 'admin_curated',
          }
        : EMPTY_FORM,
    )
  }, [open, company])

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const aliasList = v.aliases.split(',').map((a) => a.trim()).filter(Boolean)

  const submit = async () => {
    const e = {}
    if (v.name.trim().length < 2) e.name = 'Enter the company’s name.'
    if (!v.industry.trim()) e.industry = 'Add an industry so students can browse by it.'
    if (v.description.length > 600) e.description = 'Keep the description under 600 characters.'
    setErrors(e)
    if (Object.keys(e).length) return focusFirstError(ref.current)
    setLoading(true)
    try {
      const saved = await saveCompany(company?.id ?? null, { ...v, aliases: aliasList })
      toast.success(company ? `Saved changes to ${saved.name}.` : `${saved.name} added.`)
      onOpenChange(false)
      if (!company) onCreated?.(saved)
    } catch (err) {
      if (err?.fields) {
        setErrors(err.fields)
        focusFirstError(ref.current)
      } else toast.error(errorText(err))
    } finally {
      setLoading(false)
      invalidateAll()
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={company ? `Edit ${company.name}` : 'New company'}
      description={company ? `The URL stays /companies/${company.slug} so existing links keep working.` : 'Admin-created companies are verified straight away.'}
      confirmLabel={company ? 'Save changes' : 'Add company'}
      loading={loading}
      onSubmit={submit}
      size="md"
    >
      <div ref={ref} className="space-y-5">
        <div className="flex items-end gap-3">
          <CompanyLogo name={v.name || '?'} size={48} className="shrink-0" />
          <Field label="Name" required error={errors.name} className="flex-1">
            <Input value={v.name} onChange={set('name')} placeholder="e.g. Zoho Corporation" autoComplete="off" />
          </Field>
        </div>
        <Field label="Aliases" optional error={errors.aliases} hint="Other names students search for, separated by commas. e.g. TCS, TCS Digital">
          <Input value={v.aliases} onChange={set('aliases')} placeholder="Short names, old names, divisions" autoComplete="off" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Industry" required error={errors.industry}>
            <Input value={v.industry} onChange={set('industry')} list="rw-industries" placeholder="e.g. Software" autoComplete="off" />
          </Field>
          <Field label="Website" optional error={errors.website}>
            <Input value={v.website} onChange={set('website')} prefix="https://" placeholder="zoho.com" autoComplete="off" inputMode="url" />
          </Field>
        </div>
        <datalist id="rw-industries">
          {industryList.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
        <Field label="Description" optional error={errors.description} hint="Two neutral sentences about what the company does. No marketing copy." counter={<CharCount value={v.description} max={600} />}>
          <Textarea value={v.description} onChange={set('description')} minRows={3} maxRows={8} />
        </Field>
        {v.description.trim() && (
          <Field label="Description source" required error={errors.description_source} hint="Shown on the company page so students know where it came from.">
            <Select value={v.description_source} onValueChange={set('description_source')} options={DESCRIPTION_SOURCES} />
          </Field>
        )}
        <p className="flex items-start gap-1.5 text-small text-ink-500">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Logos are shown as monogram tiles in the prototype. Logo upload arrives with storage in Phase 3.
        </p>
      </div>
    </FormDialog>
  )
}

/* ---------------- Merge tool ---------------- */
function MergeDialog({ open, initialSource, onOpenChange, onMerged }) {
  const [source, setSource] = useState(null)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const invalidateAll = useInvalidateAll()

  useEffect(() => {
    if (open) {
      setSource(initialSource ?? null)
      setTarget(null)
    }
  }, [open, initialSource])

  const all = useQuery({ queryKey: ['admin', 'companies', { q: '', status: 'all' }], queryFn: () => listAdminCompanies({ status: 'all' }), enabled: open })
  const items = (all.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    meta: [c.is_verified ? 'Verified' : 'Unverified', pluralize(c.experience_count, 'experience')].join(' · '),
    keywords: c.aliases,
  }))
  const ready = source && target && source !== target
  const preview = useQuery({ queryKey: ['admin', 'merge-preview', source, target], queryFn: () => previewCompanyMerge(source, target), enabled: open && !!ready })
  const p = preview.data

  const confirm = async () => {
    setBusy(true)
    try {
      const res = await mergeCompanies(source, target)
      toast.success(`Merged into ${res.target.name}. ${pluralize(res.moved, 'experience')} moved.`)
      onOpenChange(false)
      onMerged?.(res.target)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
      invalidateAll()
    }
  }

  const renderLeading = (o) => <CompanyLogo name={o.label} size={32} />

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Merge duplicate companies"
      description="Experiences move to the company you keep. The duplicate’s name becomes an alias and its old link redirects."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy} disabled={!p || preview.isFetching}>
            <GitMerge aria-hidden /> {p ? `Merge into ${p.target.name}` : 'Merge companies'}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-2">
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <Field label="Duplicate" hint="This one is merged away.">
            <Combobox items={items.filter((i) => i.value !== target)} value={source} onChange={setSource} placeholder="Search companies…" renderLeading={renderLeading} />
          </Field>
          <ArrowRight className="mx-auto mb-[34px] hidden size-5 text-ink-500 md:block" aria-hidden />
          <Field label="Keep" hint="Experiences move here.">
            <Combobox items={items.filter((i) => i.value !== source)} value={target} onChange={setTarget} placeholder="Search companies…" renderLeading={renderLeading} />
          </Field>
        </div>

        {!ready ? (
          <div className="rounded-lg border border-dashed border-ink-300 px-4 py-8 text-center text-small text-ink-500">
            Choose the duplicate and the company to keep to preview what changes.
          </div>
        ) : preview.isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading preview">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        ) : preview.error ? (
          <ErrorState title="Can’t merge these" message={errorText(preview.error)} onRetry={preview.refetch} />
        ) : (
          <div className="space-y-4 animate-fade-in">
            <ul className="grid gap-2 sm:grid-cols-3">
              {[
                { label: 'Experiences move', value: p.experiences.length + p.draft_count },
                { label: 'Aliases added', value: p.aliases_added.length },
                { label: 'Links redirected', value: p.redirects.length },
              ].map((s) => (
                <li key={s.label} className="rounded-lg border border-ink-200 px-3 py-2.5">
                  <p className="text-h3 tabular text-ink-900">{s.value}</p>
                  <p className="text-caption text-ink-500">{s.label}</p>
                </li>
              ))}
            </ul>

            <div>
              <p className="mb-2 text-caption font-medium uppercase tracking-wider text-ink-500">Affected experiences</p>
              {p.experiences.length ? (
                <ul className="max-h-56 divide-y divide-ink-200 overflow-y-auto rounded-lg border border-ink-200">
                  {p.experiences.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-body">
                      <span className="min-w-0 truncate text-ink-900">{e.role_title}</span>
                      <span className="shrink-0 text-small text-ink-500">
                        {[formatMonth(e.interview_month), batchLabel(e.graduation_year), e.status !== 'published' && e.status].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-ink-500">No published experiences use {p.source.name}.</p>
              )}
              {p.draft_count > 0 && <p className="mt-1.5 text-small text-ink-500">Plus {pluralize(p.draft_count, 'draft')}, which move too.</p>}
            </div>

            <ul className="space-y-1.5 text-small text-ink-700">
              {p.aliases_added.length > 0 && (
                <li className="flex gap-2">
                  <span className="text-ink-500" aria-hidden>•</span>
                  <span>
                    {p.target.name} gains the {p.aliases_added.length === 1 ? 'alias' : 'aliases'} <span className="font-medium">{p.aliases_added.join(', ')}</span>, so search still finds it.
                  </span>
                </li>
              )}
              <li className="flex gap-2">
                <span className="text-ink-500" aria-hidden>•</span>
                <span>
                  <span className="font-mono">{p.redirects.map((s) => `/companies/${s}`).join(', ')}</span> will redirect to <span className="font-mono">/companies/{p.target.slug}</span>.
                </span>
              </li>
            </ul>

            <Callout tone="warning" icon={ShieldAlert}>
              Merging can’t be undone from the app. Check the two companies really are the same organisation.
            </Callout>
          </div>
        )}
      </div>
    </Dialog>
  )
}

