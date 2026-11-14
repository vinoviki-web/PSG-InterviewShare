import { useEffect, useRef, useState } from 'react'
import { Field, Textarea, RadioCards, CharCount } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { FormDialog, focusFirstError } from './AdminUi'

const DURATIONS = [
  { days: '1', label: '1 day' },
  { days: '7', label: '7 days' },
  { days: '30', label: '30 days' },
  { days: '0', label: 'Until lifted' },
]

/**
 * Suspension: duration + reason (spec §9.14). The reason is shown to the
 * student on their suspended page, so the copy asks for plain language.
 */
export function SuspendDialog({ open, onOpenChange, subject, masked, onConfirm }) {
  const [days, setDays] = useState('7')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const formRef = useRef(null)

  useEffect(() => {
    if (open) {
      setDays('7')
      setReason('')
      setErrors({})
    }
  }, [open])

  const options = DURATIONS.map((d) => ({
    value: d.days,
    label: d.label,
    description: d.days === '0' ? 'An admin lifts it manually' : `Ends ${formatDate(new Date(Date.now() + Number(d.days) * 86400000))}`,
  }))

  const submit = async () => {
    const e = {}
    if (reason.trim().length < 10) e.reason = 'Give a reason of at least 10 characters. The student sees it when they sign in.'
    else if (reason.trim().length > 300) e.reason = 'Keep the reason under 300 characters.'
    setErrors(e)
    if (Object.keys(e).length) return focusFirstError(formRef.current)
    setLoading(true)
    try {
      await onConfirm({ days: Number(days), reason: reason.trim() })
      onOpenChange(false)
    } catch (err) {
      if (err?.fields) setErrors(err.fields)
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Suspend ${subject}?`}
      description={
        masked
          ? 'They can’t read, post or comment while suspended. Their identity stays masked: this doesn’t reveal who they are.'
          : 'They can’t read, post or comment while suspended. Their published experiences stay up.'
      }
      confirmLabel="Suspend"
      tone="danger"
      loading={loading}
      onSubmit={submit}
    >
      <div ref={formRef} className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 text-body font-medium text-ink-800">Duration</legend>
          <RadioCards options={options} value={days} onValueChange={setDays} className="grid-cols-2" aria-label="Duration" />
        </fieldset>
        <Field label="Reason" required error={errors.reason} hint="Shown to the student. Be specific and neutral." counter={<CharCount value={reason} max={300} />}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} minRows={3} maxRows={8} placeholder="e.g. Repeated spam comments promoting a paid course" />
        </Field>
      </div>
    </FormDialog>
  )
}
