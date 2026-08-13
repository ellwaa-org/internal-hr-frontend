import { Slot } from '@radix-ui/react-slot'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  primary: 'border-transparent bg-neutral-900 text-white hover:enabled:bg-black',
  secondary: 'border-border bg-white text-foreground hover:enabled:bg-hover',
  ghost: 'w-10 border-transparent bg-transparent p-0 text-foreground hover:enabled:bg-hover',
  danger: 'border-transparent bg-danger text-white hover:enabled:bg-red-700',
} as const

const sizes = {
  md: 'h-10 px-3.5 text-sm',
  sm: 'h-[34px] px-2.5 text-[13px]',
} as const

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  asChild?: boolean
  fullOnMobile?: boolean
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  asChild = false,
  fullOnMobile = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      {...(!asChild ? { type } : {})}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border font-semibold transition-[background,border-color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
        sizes[size],
        variants[variant],
        fullOnMobile && 'max-[720px]:w-full',
        className,
      )}
      {...props}
    />
  )
}
