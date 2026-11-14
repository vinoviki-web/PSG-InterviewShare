import { useState } from 'react'
import { Plus, Search, Trash2, Inbox } from 'lucide-react'
import {
  Button, IconButton, Field, Input, Textarea, Select, Switch, Checkbox, RadioCards, Segmented, DifficultyInput, DifficultyMeter, MonthYearPicker,
  Badge, OutcomePill, Chip, Tag, Avatar, CompanyLogo, Kbd, Skeleton, EmptyState, ErrorState, ProgressBar, ConfirmDialog, Combobox, TagPicker, useToast,
} from '@/components/ui'
import { RoundPipeline } from '@/components/experience/Pipeline'
import { OUTCOMES, OPPORTUNITY_TYPES } from '@/lib/constants'
import { TOPICS } from '@/mocks/lookups'

const SWATCHES = {
  Ink: ['25', '50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((s) => `ink-${s}`),
  Teal: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((s) => `teal-${s}`),
  Semantic: ['success-50', 'success-600', 'warning-50', 'warning-600', 'danger-50', 'danger-600'],
}

function Block({ title, children }) {
  return (
    <section className="border-t border-ink-200 py-8">
      <h2 className="mb-5 text-h2">{title}</h2>
      {children}
    </section>
  )
}

/** Component showcase (spec §3), dev builds only. */
export default function DevUi() {
  const toast = useToast()
  const [sw, setSw] = useState(true)
  const [cb, setCb] = useState(false)
  const [rc, setRc] = useState('internship')
  const [seg, setSeg] = useState('online')
  const [diff, setDiff] = useState(3)
  const [month, setMonth] = useState('')
  const [combo, setCombo] = useState(null)
  const [tags, setTags] = useState(['graphs'])
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="container-page py-10">
      <h1 className="text-h1">Design system</h1>
      <p className="mt-1 text-body text-ink-600">Tokens and components from docs/02 §2–3.</p>

      <Block title="Colour">
        {Object.entries(SWATCHES).map(([g, list]) => (
          <div key={g} className="mb-4">
            <p className="mb-2 text-small font-medium text-ink-700">{g}</p>
            <div className="flex flex-wrap gap-2">
              {list.map((c) => (
                <div key={c} className="w-20">
                  <div className="h-12 rounded-md border border-ink-200" style={{ background: `var(--color-${c})` }} />
                  <p className="mt-1 font-mono text-[11px] text-ink-600">{c}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Block>

      <Block title="Typography">
        <div className="space-y-3">
          <p className="text-display font-semibold text-ink-900">Display 40</p>
          <p className="text-h1 font-semibold text-ink-900">Heading 1 · 30</p>
          <p className="text-h2 font-semibold text-ink-900">Heading 2 · 22</p>
          <p className="text-h3 font-semibold text-ink-900">Heading 3 · 18</p>
          <p className="text-body-lg">Body large 16/27, used for reading experiences.</p>
          <p className="text-body">Body 14/22, the default UI text.</p>
          <p className="text-small text-ink-600">Small 13/20, for meta and helper text.</p>
          <p className="text-caption text-ink-500">Caption 12/16</p>
          <p className="font-mono text-small">Mono 13 · const x = 42</p>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button><Plus /> Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="danger-ghost"><Trash2 /> Delete</Button>
          <Button variant="link">Link</Button>
          <Button loading>Saving…</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <IconButton label="Search"><Search /></IconButton>
          <IconButton label="Search" variant="secondary"><Search /></IconButton>
        </div>
      </Block>

      <Block title="Inputs">
        <div className="grid max-w-[720px] gap-5 md:grid-cols-2">
          <Field label="Default" hint="Helper text"><Input placeholder="Placeholder" /></Field>
          <Field label="Error" error="This field is required."><Input /></Field>
          <Field label="With suffix"><Input suffix="@psgtech.ac.in" /></Field>
          <Field label="Select"><Select options={OPPORTUNITY_TYPES} placeholder="Choose" /></Field>
          <Field label="Month"><MonthYearPicker value={month} onChange={setMonth} /></Field>
          <Field label="Combobox">
            <Combobox items={[{ value: 'a', label: 'Amazon', meta: '6 experiences' }, { value: 'z', label: 'Zoho Corporation', meta: '7 experiences' }]} value={combo} onChange={setCombo} allowCreate onCreate={(n) => toast.info(`Would add ${n}`)} renderLeading={(o) => <CompanyLogo name={o.label} size={32} />} />
          </Field>
          <Field label="Textarea" className="md:col-span-2"><Textarea placeholder="Auto-grows…" /></Field>
          <Field label="Tag picker" className="md:col-span-2"><TagPicker options={TOPICS} value={tags} onChange={setTags} suggestions={['dbms', 'operating-systems']} /></Field>
        </div>
      </Block>

      <Block title="Choice controls">
        <div className="max-w-[720px] space-y-6">
          <Switch id="dev-sw" label="Post anonymously" description="Readers won’t see your name." checked={sw} onCheckedChange={setSw} />
          <Checkbox id="dev-cb" label="This is my own experience" checked={cb} onCheckedChange={setCb} />
          <RadioCards options={OPPORTUNITY_TYPES} value={rc} onValueChange={setRc} />
          <Segmented options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]} value={seg} onValueChange={setSeg} />
          <DifficultyInput value={diff} onChange={setDiff} />
        </div>
      </Block>

      <Block title="Badges, chips, avatars">
        <div className="flex flex-wrap items-center gap-2">
          {OUTCOMES.map((o) => <OutcomePill key={o.value} outcome={o.value} />)}
          <Badge tone="teal">Teal</Badge>
          <Badge tone="outline">Outline</Badge>
          <Tag>Dynamic programming</Tag>
          <Chip>Toggle</Chip>
          <Chip selected>Selected</Chip>
          <Chip onRemove={() => {}}>Removable</Chip>
          <Kbd>⌘K</Kbd>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name="Priya Raman" size={24} />
          <Avatar name="Karthik S" size={32} />
          <Avatar name="Divya N" size={40} />
          <Avatar anonymous size={40} />
          <CompanyLogo name="Zoho Corporation" size={40} />
          <CompanyLogo name="Amazon" size={48} />
          <DifficultyMeter value={4} />
          <RoundPipeline steps={['online_assessment', 'technical', 'technical', 'hr']} />
        </div>
      </Block>

      <Block title="Feedback">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
          <ProgressBar value={3} max={5} />
          <ErrorState onRetry={() => {}} />
          <EmptyState compact icon={Inbox} title="Nothing here yet" action={<Button size="sm">Do something</Button>}>A short explanation of why.</EmptyState>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => toast.success('Saved. Find it under Saved.')}>Success toast</Button>
            <Button variant="secondary" onClick={() => toast.error('Couldn’t save. Try again.')}>Error toast</Button>
            <Button variant="secondary" onClick={() => toast.info('Removed from saved', { action: { label: 'Undo', onClick: () => {} } })}>Undo toast</Button>
            <Button variant="secondary" onClick={() => setConfirm(true)}>Confirm dialog</Button>
          </div>
        </div>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this comment?" body="It will be removed for everyone." confirmLabel="Delete" onConfirm={() => setConfirm(false)} />
      </Block>
    </div>
  )
}
