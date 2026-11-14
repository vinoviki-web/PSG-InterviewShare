import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { prepareAvatar } from '@/lib/image'

export function AvatarPicker({ name, value, onChange }) {
  const input = useRef(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || '?'} src={value} size={64} />
      <div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
            <Upload /> {value ? 'Change photo' : 'Upload photo'}
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
        <p className={error ? 'mt-1.5 text-small text-danger-600' : 'mt-1.5 text-small text-ink-500'} role={error ? 'alert' : undefined}>
          {error ?? 'Optional. PNG, JPEG or WebP, up to 2 MB.'}
        </p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setBusy(true)
            setError(null)
            try {
              onChange(await prepareAvatar(f))
            } catch (err) {
              setError(err.message)
            } finally {
              setBusy(false)
            }
          }}
        />
      </div>
    </div>
  )
}
