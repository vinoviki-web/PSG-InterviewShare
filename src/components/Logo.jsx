import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-ink-900" />
      <circle cx="10" cy="16" r="3" fill="#fff" />
      <circle cx="22" cy="16" r="3" className="fill-teal-400" />
      <path d="M13 16h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ to = '/', className }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-md', className)} aria-label={`${APP_NAME} home`}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">{APP_NAME}</span>
    </Link>
  )
}
