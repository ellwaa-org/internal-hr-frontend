import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />
}

export function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />
}

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in',
        className,
      )}
      {...props}
    />
  )
}

const sizeClasses = {
  sm: 'max-w-[420px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[880px]',
} as const

export function DialogContent({
  className,
  children,
  size = 'md',
  showClose = true,
  nested = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  size?: keyof typeof sizeClasses
  showClose?: boolean
  nested?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay className={nested ? 'z-[60]' : undefined} />
      <DialogPrimitive.Content
        dir="rtl"
        className={cn(
          // Center with inset + margin auto — no translate, so no animation position jump
          'fixed inset-0 z-50 m-auto flex h-fit max-h-[min(90svh,720px)] w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-elevated outline-none',
          'data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out',
          'max-[720px]:max-h-[min(92svh,720px)] max-[720px]:w-[calc(100vw-16px)] max-[720px]:rounded-[14px]',
          sizeClasses[size],
          nested && 'z-[61]',
          className,
        )}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onCloseAutoFocus?.(event)
        }}
        {...props}
      >
        <div className="min-h-0 flex-1 overflow-auto p-6 max-[720px]:px-4 max-[720px]:py-[18px]">
          {children}
        </div>
        {showClose ? (
          <DialogPrimitive.Close
            className="absolute end-3.5 top-3.5 z-10 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-4 flex flex-col gap-1.5 pe-7', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-5 flex flex-wrap justify-end gap-2.5 max-[720px]:flex-col-reverse max-[720px]:items-stretch [&_button]:max-[720px]:w-full',
        className,
      )}
      {...props}
    />
  )
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('m-0 text-lg font-bold text-foreground', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('m-0 text-[13px] leading-normal text-muted', className)}
      {...props}
    />
  )
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3', className)}>{children}</div>
}
