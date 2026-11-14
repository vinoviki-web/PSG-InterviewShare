import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/* Teach tailwind-merge our custom type scale so `text-body` is treated as a
   font size (not a colour) and `hidden` correctly overrides `inline-flex`. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ['display', 'h1', 'h2', 'h3', 'body-lg', 'body', 'small', 'caption'] },
  },
})

export const cn = (...args) => twMerge(clsx(...args))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2025-08-01' -> 'Aug 2025' */
export function formatMonth(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** 2027 -> "'27" */
export const batchLabel = (year) => (year ? `’${String(year).slice(-2)}` : '')

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(1, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(mo / 12)}y ago`
}

export function formatDate(iso) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const pluralize = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

/** Rough reading time from a set of text blobs. */
export function readingMinutes(...texts) {
  const words = texts.join(' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

/** Deterministic hash → index (for avatar tints). */
export function hashIndex(str, mod) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h) % mod
}

export const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
