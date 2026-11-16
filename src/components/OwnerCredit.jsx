import { OWNER } from '@/lib/constants'

/** "Created and maintained by …" with a contact link. Wraps on small screens. */
export function OwnerCredit({ className }) {
  return (
    <p className={className}>
      Created and maintained by <span className="font-medium text-ink-700">{OWNER.name}</span>
      <span aria-hidden="true"> · </span>
      <span className="sr-only">, </span>
      {OWNER.programme}
      <span aria-hidden="true"> · </span>
      <span className="sr-only">, contact: </span>
      <a href={`mailto:${OWNER.email}`} className="whitespace-nowrap font-medium text-ink-700 underline-offset-2 hover:underline">
        {OWNER.email}
      </a>
    </p>
  )
}
