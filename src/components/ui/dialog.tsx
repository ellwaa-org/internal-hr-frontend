import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import './dialog.css'

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
  return <DialogPrimitive.Overlay className={cn('dialog-overlay', className)} {...props} />
}

export function DialogContent({
  className,
  children,
  nested = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { nested?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay className={nested ? 'dialog-overlay-nested' : undefined} />
      <DialogPrimitive.Content
        className={cn('dialog-content', nested && 'dialog-content-nested', className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="dialog-close" aria-label="إغلاق">
          <X />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('dialog-header', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('dialog-footer', className)} {...props} />
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('dialog-title', className)} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('dialog-description', className)} {...props} />
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('dialog-body', className)}>{children}</div>
}
