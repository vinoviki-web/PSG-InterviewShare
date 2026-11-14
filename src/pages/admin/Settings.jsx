import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info, TriangleAlert, X } from 'lucide-react'
import { Button, Card, CharCount, ErrorState, Field, Input, Segmented, Skeleton, Switch, Textarea, useToast } from '@/components/ui'
import { getSettings, updateSettings, LIMIT_RULES } from '@/api/admin'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, errorText, focusFirstError, useInvalidateAll } from '@/components/admin/AdminUi'
import { toDateInput, todayInput } from '@/components/admin/format'

const LIMIT_FIELDS = [
  { key: 'publish_per_day', label: 'Experiences published', suffix: 'per day', hint: 'Per student. Stops accidental duplicates and spam bursts.' },
  { key: 'comments_per_hour', label: 'Comments', suffix: 'per hour', hint: 'Per student.' },
  { key: 'reports_per_day', label: 'Reports filed', suffix: 'per day', hint: 'Per student. Limits report brigading.' },
  { key: 'auto_hide_threshold', label: 'Auto-hide threshold', suffix: 'reports', hint: 'Distinct open reports before content is hidden for review.' },
]

const FLAG_FIELDS = [
  { key: 'comments', label: 'Comments', description: 'Students can comment on experiences and reply to each other.' },
  { key: 'anonymous_posting', label: 'Anonymous posting', description: 'Contributors can hide their name. Turning this off doesn’t unmask existing posts.' },
  { key: 'new_companies', label: 'New companies from the share wizard', description: 'Students can add a company that isn’t listed. New ones start unverified.' },
]

/** Settings as editable strings, so number inputs can be briefly empty while typing. */
const toForm = (s) => ({
  announcement: { text: s.announcement?.text ?? '', tone: s.announcement?.tone === 'warning' ? 'warning' : 'info', expires_on: toDateInput(s.announcement?.expires_at) },
  flags: { ...s.flags },
  limits: Object.fromEntries(Object.keys(LIMIT_RULES).map((k) => [k, String(s.limits?.[k] ?? '')])),
  landing_stats_threshold: String(s.landing_stats_threshold ?? ''),
})

const endOfDay = (ymd) => (ymd ? new Date(`${ymd}T23:59:59`).toISOString() : null)

const fromForm = (f) => ({
  announcement: { text: f.announcement.text.trim(), tone: f.announcement.tone, expires_at: endOfDay(f.announcement.expires_on) },
  flags: f.flags,
  limits: Object.fromEntries(Object.entries(f.limits).map(([k, v]) => [k, v === '' ? NaN : Number(v)])),
  landing_stats_threshold: f.landing_stats_threshold === '' ? NaN : Number(f.landing_stats_threshold),
})

function validate(f) {
  const e = {}
  if (f.announcement.text.trim().length > 200) e['announcement.text'] = 'Keep the announcement under 200 characters.'
  if (f.announcement.expires_on && f.announcement.expires_on < todayInput()) e['announcement.expires_at'] = 'Pick today or a later date, or leave it empty.'
  Object.entries(LIMIT_RULES).forEach(([k, r]) => {
    const n = Number(f.limits[k])
    if (f.limits[k] === '' || !Number.isInteger(n) || n < r.min || n > r.max) e[`limits.${k}`] = `Enter a whole number from ${r.min} to ${r.max}.`
  })
  const th = Number(f.landing_stats_threshold)
  if (f.landing_stats_threshold === '' || !Number.isInteger(th) || th < 0 || th > 10000) e.landing_stats_threshold = 'Enter a whole number from 0 to 10,000.'
  return e
}

function Section({ title, description, children }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <div>
          <h2 className="text-h3">{title}</h2>
          {description && <p className="mt-1 text-small text-ink-500">{description}</p>}
        </div>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </Card>
  )
}

function BannerPreview({ text, tone }) {
  const warn = tone === 'warning'
  const Icon = warn ? TriangleAlert : Info
  return (
    <div>
      <p className="mb-1.5 text-caption font-medium text-ink-500">Preview</p>
      <div className="overflow-hidden rounded-lg border border-ink-200">
        <div className={cn('flex items-center gap-3 border-b px-3.5 py-2 text-small', warn ? 'border-warning-200 bg-warning-50 text-warning-600' : 'border-teal-200 bg-teal-50 text-teal-800')}>
          <Icon className="size-4 shrink-0" aria-hidden />
          <p className={cn('flex-1', !text && 'italic text-ink-500')}>{text || 'Your announcement appears here.'}</p>
          <X className="size-4 shrink-0 opacity-70" aria-hidden />
        </div>
        <div className="flex h-10 items-center gap-3 bg-white px-3.5" aria-hidden>
          <span className="h-2.5 w-16 rounded-full bg-ink-200" />
          <span className="h-2 w-10 rounded-full bg-ink-100" />
          <span className="h-2 w-12 rounded-full bg-ink-100" />
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'settings'], queryFn: getSettings })
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)
  const toast = useToast()
  const invalidateAll = useInvalidateAll()

  const baseline = useMemo(() => (data ? toForm(data) : null), [data])
  useEffect(() => {
    if (baseline) setForm(baseline)
  }, [baseline])

  const dirty = form && baseline && JSON.stringify(form) !== JSON.stringify(baseline)

  /* Never lose input (principle 6): warn before leaving with unsaved changes. */
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const set = (path, value) => {
    setForm((f) => {
      const next = structuredClone(f)
      const keys = path.split('.')
      let o = next
      keys.slice(0, -1).forEach((k) => (o = o[k]))
      o[keys.at(-1)] = value
      return next
    })
    setErrors((e) => {
      const errKey = path === 'announcement.expires_on' ? 'announcement.expires_at' : path
      if (!e[errKey]) return e
      const { [errKey]: _, ...rest } = e
      return rest
    })
  }

  const save = async (e) => {
    e?.preventDefault()
    const v = validate(form)
    setErrors(v)
    if (Object.keys(v).length) {
      toast.error('Some settings need fixing before they can be saved.')
      return focusFirstError(ref.current)
    }
    setSaving(true)
    try {
      await updateSettings(fromForm(form))
      toast.success('Settings saved. Changes apply right away.')
    } catch (err) {
      if (err?.fields) {
        setErrors(err.fields)
        focusFirstError(ref.current)
      }
      toast.error(errorText(err))
    } finally {
      setSaving(false)
      invalidateAll()
    }
  }

  const header = <PageHeader title="Settings" description="Platform-wide switches and limits. Every change is recorded in the audit log." />

  if (isPending || (!form && !error)) {
    return (
      <>
        {header}
        <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
          {[200, 180, 240, 120].map((h, i) => (
            <Skeleton key={i} className="w-full rounded-lg" style={{ height: h }} />
          ))}
        </div>
      </>
    )
  }
  if (error) {
    return (
      <>
        {header}
        <ErrorState title="Couldn’t load settings" message={errorText(error)} onRetry={refetch} />
      </>
    )
  }

  const a = form.announcement
  const expiry = a.expires_on && a.expires_on >= todayInput() ? `Shows until the end of ${formatDate(endOfDay(a.expires_on))}.` : 'Shows until you clear it.'

  return (
    <form ref={ref} onSubmit={save} noValidate>
      {header}
      <div className="space-y-4">
        <Section title="Announcement banner" description="A short notice at the top of every signed-in page. Students can dismiss it.">
          <Field
            label="Message"
            optional
            error={errors['announcement.text']}
            hint="Leave empty to turn the banner off."
            counter={<CharCount value={a.text} max={200} />}
          >
            <Textarea value={a.text} onChange={(e) => set('announcement.text', e.target.value)} minRows={2} maxRows={5} placeholder="e.g. Zoho’s on-campus drive is on 24 Nov. Share your experience after the interview." />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tone" error={errors['announcement.tone']}>
              <Segmented
                aria-label="Tone"
                className="sm:self-start"
                value={a.tone}
                onValueChange={(v) => set('announcement.tone', v)}
                options={[
                  { value: 'info', label: 'Info' },
                  { value: 'warning', label: 'Warning' },
                ]}
              />
            </Field>
            <Field label="Show until" optional error={errors['announcement.expires_at']} hint={expiry}>
              <Input type="date" value={a.expires_on} min={todayInput()} onChange={(e) => set('announcement.expires_on', e.target.value)} />
            </Field>
          </div>
          <BannerPreview text={a.text.trim()} tone={a.tone} />
        </Section>

        <Section title="Features" description="Turn features off during incidents or exam season without a deploy.">
          <div className="divide-y divide-ink-200">
            {FLAG_FIELDS.map((f) => (
              <div key={f.key} className="py-4 first:pt-0 last:pb-0">
                <Switch id={`flag-${f.key}`} checked={!!form.flags[f.key]} onCheckedChange={(v) => set(`flags.${f.key}`, v)} label={f.label} description={f.description} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Rate limits" description="Enforced on the server, per account. Lower them during spam waves.">
          <div className="grid gap-5 sm:grid-cols-2">
            {LIMIT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} error={errors[`limits.${f.key}`]} hint={f.hint}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={LIMIT_RULES[f.key].min}
                  max={LIMIT_RULES[f.key].max}
                  step={1}
                  value={form.limits[f.key]}
                  onChange={(e) => set(`limits.${f.key}`, e.target.value)}
                  suffix={f.suffix}
                  className="tabular"
                />
              </Field>
            ))}
          </div>
        </Section>

        <Section title="Landing page" description="The public page shows totals only once they’re big enough to be meaningful.">
          <Field label="Show public counts from" error={errors.landing_stats_threshold} hint="Below this many published experiences, the landing page hides its counts (principle 3: every number is real).">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              step={1}
              value={form.landing_stats_threshold}
              onChange={(e) => set('landing_stats_threshold', e.target.value)}
              suffix="experiences"
              className="tabular sm:max-w-[280px]"
            />
          </Field>
        </Section>
      </div>

      <div
        className={cn(
          'sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 mt-6 transition-[opacity,transform] duration-[180ms] ease-out-soft md:bottom-4',
          dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}
        aria-hidden={!dirty}
      >
        <div className="flex flex-col gap-3 rounded-lg border border-ink-200 bg-white p-3 shadow-md sm:flex-row sm:items-center sm:justify-between sm:pl-4">
          <p className="flex items-center gap-2 text-body text-ink-700">
            <span className="size-2 rounded-full bg-warning-600" aria-hidden /> You have unsaved changes.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              tabIndex={dirty ? 0 : -1}
              onClick={() => {
                setForm(baseline)
                setErrors({})
              }}
              disabled={saving}
            >
              Discard
            </Button>
            <Button type="submit" className="flex-1 sm:flex-none" loading={saving} tabIndex={dirty ? 0 : -1}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
