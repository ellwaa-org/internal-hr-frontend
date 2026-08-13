import type { InputHTMLAttributes, ReactNode } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function SearchField({
  className,
  inputClassName,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { inputClassName?: string }) {
  return (
    <label
      className={cn(
        'flex h-10 min-w-[200px] flex-[1_1_240px] items-center gap-2 rounded-[10px] border border-border bg-white px-3 max-[720px]:min-w-0 max-[720px]:w-full max-[720px]:flex-auto',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <input
        type="search"
        className={cn(
          'min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-neutral-400',
          inputClassName,
        )}
        {...props}
      />
    </label>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:gap-3">
      <div>
        <h1 className="m-0 mb-1 text-2xl font-bold text-foreground max-[720px]:text-xl">{title}</h1>
        {subtitle ? (
          <p className="m-0 text-sm text-muted max-[720px]:text-[13px]">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function PageShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-4 max-[720px]:gap-3', className)}>
      {children}
    </div>
  )
}

export function FiltersBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:gap-2">
      {children}
    </div>
  )
}

export function PaginationBar({
  info,
  page,
  totalPages,
  disabled,
  onPrev,
  onNext,
}: {
  info: string
  page: number
  totalPages: number
  disabled?: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:gap-2.5">
      <span className="text-[13px] text-muted">{info}</span>
      <div className="flex items-center gap-2 max-[720px]:w-full max-[720px]:justify-between [&_button]:max-[720px]:flex-1">
        <Button type="button" variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={onPrev}>
          السابق
        </Button>
        <span className="min-w-16 text-center text-[13px] tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={onNext}
        >
          التالي
        </Button>
      </div>
    </div>
  )
}
