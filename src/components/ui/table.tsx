import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function TableSection({
  children,
  footer,
  className,
}: {
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] max-[720px]:rounded-xl',
        className,
      )}
    >
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain" dir="rtl">
        {children}
      </div>
      {footer ? (
        <div className="border-t border-border bg-[#fcfcfc] px-4 py-3 max-[720px]:px-3">{footer}</div>
      ) : null}
    </div>
  )
}

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] max-[720px]:rounded-xl',
        className,
      )}
      {...props}
    />
  )
}

export function Table({
  className,
  compact = false,
  ...props
}: HTMLAttributes<HTMLTableElement> & { compact?: boolean }) {
  return (
    <table
      className={cn(
        'w-full border-collapse text-sm',
        compact ? 'min-w-[520px]' : 'min-w-[960px]',
        className,
      )}
      {...props}
    />
  )
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'sticky top-0 z-[1] whitespace-nowrap border-b border-border bg-[#f7f7f8] px-4 py-3 text-start align-middle text-xs font-semibold tracking-wide text-muted max-[720px]:px-3 max-[720px]:py-2.5',
        className,
      )}
      {...props}
    />
  )
}

export function ThActions({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <Th
      className={cn(
        'sticky end-0 z-[2] w-[1%] bg-[#f7f7f8] ps-2 shadow-[6px_0_10px_-8px_rgba(0,0,0,0.12)]',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'border-b border-border px-4 py-3.5 text-start align-middle text-[13px] text-foreground max-[720px]:px-3 max-[720px]:py-3 max-[720px]:text-xs',
        className,
      )}
      {...props}
    />
  )
}

export function TdActions({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <Td
      className={cn(
        'sticky end-0 z-[1] w-[1%] whitespace-nowrap bg-white ps-2 shadow-[6px_0_10px_-8px_rgba(0,0,0,0.08)]',
        className,
      )}
      {...props}
    />
  )
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'hover:bg-[#fafafa] [&:last-child_td]:border-b-0 [&:hover_td]:bg-[#fafafa]',
        className,
      )}
      {...props}
    />
  )
}

export function TableMessage({
  colSpan,
  children,
}: {
  colSpan: number
  children: ReactNode
}) {
  return (
    <tr>
      <Td colSpan={colSpan} className="px-4 py-14 text-center text-sm text-muted">
        {children}
      </Td>
    </tr>
  )
}
