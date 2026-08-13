import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-[10px] border border-border bg-white px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    />
  )
}

export function Field({
  className,
  label,
  htmlFor,
  children,
  error,
}: {
  className?: string
  label?: string
  htmlFor?: string
  children: React.ReactNode
  error?: string | null
}) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-[13px] text-muted', className)} htmlFor={htmlFor}>
      {label ? <span>{label}</span> : null}
      {children}
      {error ? <span className="text-[13px] font-semibold text-red-700">{error}</span> : null}
    </label>
  )
}
