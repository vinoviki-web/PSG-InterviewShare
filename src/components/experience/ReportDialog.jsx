import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createReport } from '@/api/community'
import { Button, Dialog, Field, RadioCards, Textarea, CharCount, useToast } from '@/components/ui'
import { REPORT_REASONS } from '@/lib/constants'

export function ReportDialog({ open, onOpenChange, target }) {
  const toast = useToast()
  const [reason, setReason] = useState(null)
  const [details, setDetails] = useState('')
  const [error, setError] = useState(null)
  const m = useMutation({
    mutationFn: () => createReport({ target_type: target.type, target_id: target.id, reason, details }),
    onSuccess: () => {
      onOpenChange(false)
      setReason(null)
      setDetails('')
      toast.success('Thanks. Moderators will review this.')
    },
    onError: (e) => setError(e.code === 'network' ? 'Couldn’t send the report. Try again.' : e.message),
  })
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Report this ${target.type}`}
      description="Reports are private. The author won’t know who reported."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => (reason ? m.mutate() : setError('Choose a reason.'))}
            loading={m.isPending}
          >
            Send report
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="What’s wrong?" error={!reason ? error : null}>
          <RadioCards columns={1} options={REPORT_REASONS} value={reason} onValueChange={(v) => { setReason(v); setError(null) }} className="gap-1.5 [&>button]:py-2.5" />
        </Field>
        <Field label="Details" optional hint="Helps moderators decide faster." counter={<CharCount value={details} max={1000} />} error={reason ? error : null}>
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} minRows={3} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  )
}
