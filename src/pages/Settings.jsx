import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Download, LogOut, Trash2, Mail, ShieldCheck } from 'lucide-react'
import { updateProfile, exportMyData, deleteAccount } from '@/api/profile'
import { signOut } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { departmentOptions, TOPICS } from '@/mocks/lookups'
import { DOMAINS } from '@/lib/taxonomy'
import { Button, Card, Chip, Dialog, Field, Input, RadioCards, Select, Switch, TagPicker, Textarea, CharCount, useToast } from '@/components/ui'
import { AvatarPicker } from '@/components/AvatarPicker'
import { cn } from '@/lib/utils'

const year = new Date().getFullYear()
const schema = z.object({
  full_name: z.string().trim().min(2, 'Use at least 2 characters.').max(80),
  handle: z.string().regex(/^[a-z0-9-]{3,30}$/, 'Use 3–30 lowercase letters, numbers or hyphens.'),
  department_id: z.string().min(1, 'Choose your department.'),
  graduation_year: z.coerce.number().int().min(year - 6).max(year + 6),
  bio: z.string().max(280, 'Keep your bio under 280 characters.').optional(),
  avatar_url: z.string().nullable().optional(),
  interests: z.array(z.string()),
  topics: z.array(z.string()),
})

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'account', label: 'Account' },
]

function SectionCard({ id, title, description, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <Card className="p-5 sm:p-6">
        <h2 id={`${id}-h`} className="text-h2">{title}</h2>
        {description && <p className="mt-1 text-body text-ink-600">{description}</p>}
        <div className="mt-6">{children}</div>
      </Card>
    </section>
  )
}

function ProfileForm() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const { register, control, handleSubmit, watch, setError, formState: { errors, isDirty }, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: user.full_name, handle: user.handle ?? '', department_id: user.department_id, graduation_year: user.graduation_year,
      bio: user.bio ?? '', avatar_url: user.avatar_url ?? null, interests: user.interests ?? [], topics: user.topics ?? [],
    },
  })
  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (p, vars) => { reset(vars); refresh(); toast.success('Profile saved.') },
    onError: (e) => (e.fields ? Object.entries(e.fields).forEach(([k, m]) => setError(k, { message: m })) : toast.error('Couldn’t save. Try again.')),
  })
  return (
    <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
      <Controller control={control} name="avatar_url" render={({ field }) => <AvatarPicker name={watch('full_name')} value={field.value} onChange={(v) => field.onChange(v)} />} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.full_name?.message}><Input {...register('full_name')} autoComplete="name" /></Field>
        <Field label="Profile link" error={errors.handle?.message} hint={`${window.location.host}/u/your-handle`}>
          <Input {...register('handle')} prefix={<span className="text-small">/u/</span>} autoCapitalize="none" spellCheck={false} />
        </Field>
        <Field label="Department" error={errors.department_id?.message}>
          <Controller control={control} name="department_id" render={({ field }) => <Select value={field.value} onValueChange={field.onChange} options={departmentOptions()} />} />
        </Field>
        <Field label="Batch" error={errors.graduation_year?.message}>
          <Controller control={control} name="graduation_year" render={({ field }) => (
            <Select value={String(field.value)} onValueChange={field.onChange} options={Array.from({ length: 11 }, (_, i) => year - 5 + i).map((y) => ({ value: String(y), label: String(y) }))} />
          )} />
        </Field>
      </div>
      <Field label="Bio" optional error={errors.bio?.message} counter={<CharCount value={watch('bio')} max={280} />}>
        <Textarea {...register('bio')} minRows={2} placeholder="What you’re preparing for, or what you can help juniors with." />
      </Field>
      <Controller control={control} name="interests" render={({ field }) => (
        <fieldset>
          <legend className="mb-2 text-body font-medium text-ink-800">Domains you’re interested in <span className="font-normal text-ink-500">(optional)</span></legend>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.filter((d) => d.value !== 'other').map((d) => <Chip key={d.value} selected={field.value.includes(d.value)} onClick={() => field.onChange(field.value.includes(d.value) ? field.value.filter((x) => x !== d.value) : [...field.value, d.value])}>{d.label}</Chip>)}
          </div>
        </fieldset>
      )} />
      <Field label="Topics you’re preparing" optional>
        <Controller control={control} name="topics" render={({ field }) => <TagPicker options={TOPICS} value={field.value} onChange={field.onChange} max={10} />} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-ink-100 pt-5">
        <Button variant="ghost" onClick={() => reset()} disabled={!isDirty}>Discard</Button>
        <Button type="submit" loading={save.isPending} disabled={!isDirty}>Save changes</Button>
      </div>
    </form>
  )
}

function PrivacySettings() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const m = useMutation({ mutationFn: updateProfile, onSuccess: () => { refresh(); toast.success('Privacy settings saved.') }, onError: () => toast.error('Couldn’t save. Try again.') })
  return (
    <div className="space-y-6">
      <Field label="Who can see your profile and named experiences">
        <RadioCards
          value={user.profile_visibility}
          onValueChange={(v) => m.mutate({ profile_visibility: v })}
          options={[
            { value: 'public_psg', label: 'PSG students', description: 'Verified students can open your profile.' },
            { value: 'private', label: 'Only me', description: 'Your profile shows only your name, department and batch.' },
          ]}
        />
      </Field>
      <div className="space-y-5 border-t border-ink-100 pt-5">
        <Switch id="def-anon" label="Post anonymously by default" description="New experiences start with “Post anonymously” turned on. You can change it per post." checked={!!user.default_anonymous} onCheckedChange={(v) => m.mutate({ default_anonymous: v })} />
        <Switch id="def-hide" label="Hide my department on anonymous posts" description="In a small department, batch + company can be enough to identify someone." checked={!!user.default_hide_department} onCheckedChange={(v) => m.mutate({ default_hide_department: v })} />
      </div>
      <p className="flex items-start gap-2 rounded-md bg-ink-50 p-3 text-small text-ink-600">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
        Your email is never shown to other students. Anonymous posts hide your identity from everyone except admins handling abuse, and every such lookup is logged.
      </p>
    </div>
  )
}

function AccountSettings() {
  const { user, reset } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [delOpen, setDelOpen] = useState(false)
  const [mode, setMode] = useState('anonymise')
  const [confirm, setConfirm] = useState('')
  const exp = useMutation({
    mutationFn: exportMyData,
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: `psg-interviewshare-data-${new Date().toISOString().slice(0, 10)}.json` })
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Your data was downloaded.')
    },
    onError: () => toast.error('Couldn’t export. Try again.'),
  })
  const del = useMutation({
    mutationFn: () => deleteAccount(mode),
    onSuccess: async () => { await reset(); navigate('/', { replace: true }); toast.info('Your account was deleted.') },
    onError: () => toast.error('Couldn’t delete your account. Try again.'),
  })
  const row = 'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between'
  return (
    <div className="divide-y divide-ink-100">
      <div className={cn(row, 'pt-0')}>
        <div>
          <p className="text-body font-medium text-ink-900">Signed in as</p>
          <p className="text-body text-ink-600">{user.email} <span className="text-small text-ink-500">(only visible to you)</span></p>
        </div>
      </div>
      <div className={row}>
        <div>
          <p className="text-body font-medium text-ink-900">Sign-in methods</p>
          <ul className="mt-1.5 space-y-1 text-body text-ink-600">
            <li className="flex items-center gap-2"><Mail className="size-4 text-ink-500" aria-hidden /> 6-digit code sent to {user.email}</li>
          </ul>
          <p className="mt-2 text-small text-ink-500">Linking a personal email for access after graduation is coming soon.</p>
        </div>
      </div>
      <div className={row}>
        <div>
          <p className="text-body font-medium text-ink-900">Sign out everywhere</p>
          <p className="text-small text-ink-500">Ends sessions on every device, including this one.</p>
        </div>
        <Button variant="secondary" onClick={async () => { await signOut({ everywhere: true }); await reset(); navigate('/') }}><LogOut /> Sign out of all devices</Button>
      </div>
      <div className={row}>
        <div>
          <p className="text-body font-medium text-ink-900">Export my data</p>
          <p className="text-small text-ink-500">Your profile, experiences, comments, votes and saved list as JSON.</p>
        </div>
        <Button variant="secondary" onClick={() => exp.mutate()} loading={exp.isPending}><Download /> Export</Button>
      </div>
      <div className={row}>
        <div>
          <p className="text-body font-medium text-danger-600">Delete account</p>
          <p className="text-small text-ink-500">Permanently deletes your profile, votes and saved list.</p>
        </div>
        <Button variant="danger-ghost" className="border border-danger-200" onClick={() => setDelOpen(true)}><Trash2 /> Delete account</Button>
      </div>

      <Dialog
        open={delOpen}
        onOpenChange={(o) => { setDelOpen(o); setConfirm('') }}
        title="Delete your account?"
        description="This can’t be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDelOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={confirm !== 'DELETE'} loading={del.isPending} onClick={() => del.mutate()}>Delete account</Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="What should happen to your published experiences?">
            <RadioCards
              columns={1}
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'anonymise', label: 'Keep them, anonymously (recommended)', description: 'Juniors can still learn from them. They’ll show as “Former PSG student”.' },
                { value: 'delete', label: 'Delete them too', description: 'Your experiences and their comments are removed for everyone.' },
              ]}
            />
          </Field>
          <Field label="Type DELETE to confirm">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      </Dialog>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="container-page py-8 md:py-10">
      <h1 className="text-h1">Settings</h1>
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[200px_minmax(0,720px)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="block rounded-md px-3 py-2 text-body font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900">{s.label}</a></li>
            ))}
          </ul>
        </nav>
        <div className="space-y-6">
          <SectionCard id="profile" title="Profile" description="Shown with your experiences and on your profile."><ProfileForm /></SectionCard>
          <SectionCard id="privacy" title="Privacy"><PrivacySettings /></SectionCard>
          <SectionCard id="account" title="Account"><AccountSettings /></SectionCard>
        </div>
      </div>
    </div>
  )
}
