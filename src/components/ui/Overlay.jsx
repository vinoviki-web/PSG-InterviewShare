import { Dialog as D, DropdownMenu as DM, Tooltip as T, Popover as P } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { Button, IconButton } from './Button'

/**
 * Dialog that renders centered on ≥ md and as a bottom sheet on mobile.
 * Pass `side="right"` for a drawer (full-screen on mobile).
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', side, trigger, className }) {
  const desktop = useIsDesktop()
  const asSheet = !desktop
  const widths = { sm: 'md:max-w-[440px]', md: 'md:max-w-[560px]', lg: 'md:max-w-[720px]' }
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink-900/40 animate-fade-in" />
        <D.Content
          {...(!description && { 'aria-describedby': undefined })}
          className={cn(
            'fixed z-50 flex flex-col bg-white shadow-lg outline-none',
            side === 'right'
              ? 'inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-[min(560px,100vw)] md:border-l md:border-ink-200 animate-fade-in'
              : asSheet
                ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl animate-sheet-up pb-safe'
                : cn('left-1/2 top-1/2 max-h-[85dvh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-xl animate-rise', widths[size]),
            className,
          )}
        >
          {asSheet && side !== 'right' && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink-200" aria-hidden />}
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 md:px-6 md:pt-5">
            <div className="min-w-0">
              <D.Title className="text-h3 font-semibold text-ink-900">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-body text-ink-600">{description}</D.Description>
              ) : (
                null
              )}
            </div>
            <D.Close asChild>
              <IconButton label="Close" size="sm" className="-mr-1.5 -mt-0.5">
                <X />
              </IconButton>
            </D.Close>
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div> : <div className="pb-3" />}
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-ink-200 px-5 py-3 sm:flex-row sm:justify-end md:px-6">{footer}</div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, onConfirm, tone = 'danger', loading }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={body}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
    </Dialog>
  )
}

/* ---------- Dropdown menu ---------- */
export const Menu = DM.Root
export const MenuTrigger = DM.Trigger

export function MenuContent({ children, align = 'end', className }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn('z-[55] min-w-[200px] rounded-lg border border-ink-200 bg-white p-1 shadow-md animate-rise', className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  )
}

export function MenuItem({ icon: Icon, children, tone, onSelect, asChild, ...props }) {
  return (
    <DM.Item
      onSelect={onSelect}
      asChild={asChild}
      className={cn(
        'flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-body outline-none data-[highlighted]:bg-ink-100',
        tone === 'danger' ? 'text-danger-600 data-[highlighted]:bg-danger-50' : 'text-ink-800',
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {Icon && <Icon className="size-4 shrink-0 opacity-80" aria-hidden />}
          {children}
        </>
      )}
    </DM.Item>
  )
}

export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-ink-200" />
export const MenuLabel = ({ children }) => <DM.Label className="px-2.5 pb-1 pt-1.5 text-caption text-ink-500">{children}</DM.Label>

/* ---------- Tooltip ---------- */
export function Tooltip({ content, children, side = 'top' }) {
  if (!content) return children
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-60 max-w-[260px] rounded-md bg-ink-900 px-2.5 py-1.5 text-small text-white shadow-md animate-fade-in">
          {content}
          <T.Arrow className="fill-ink-900" />
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
export const TooltipProvider = T.Provider

/* ---------- Popover ---------- */
export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor
export function PopoverContent({ children, className, align = 'start', ...props }) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={6}
        className={cn('z-[55] rounded-lg border border-ink-200 bg-white shadow-md outline-none animate-rise', className)}
        {...props}
      >
        {children}
      </P.Content>
    </P.Portal>
  )
}
