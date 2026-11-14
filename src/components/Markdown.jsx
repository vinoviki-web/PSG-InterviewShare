import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

/**
 * Safe Markdown (spec §3.2): no raw HTML (react-markdown ignores it by
 * default and we never add rehype-raw), no images, https-only links,
 * headings demoted to h3/h4.
 */
const ALLOWED = ['p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a', 'h3', 'h4', 'br', 'del']

const safeUrl = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

const components = {
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  a: ({ href, children }) => {
    const url = safeUrl(href)
    if (!url) return <span>{children}</span>
    return (
      <a href={url} target="_blank" rel="nofollow noopener noreferrer">
        {children}
      </a>
    )
  },
}

export function Markdown({ children, className, size = 'lg' }) {
  if (!children) return null
  return (
    <div className={cn('prose-rw', size === 'sm' && 'prose-sm-rw', className)}>
      <ReactMarkdown
        allowedElements={[...ALLOWED, 'h1', 'h2']}
        unwrapDisallowed
        skipHtml
        urlTransform={(url) => safeUrl(url) ?? ''}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
