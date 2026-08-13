import * as SelectPrimitive from '@radix-ui/react-select'
import type { ComponentProps } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root dir="rtl" {...props} />
}

export function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value {...props} />
}

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'inline-flex h-10 min-w-[140px] cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-border bg-white px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] hover:bg-[#fafafa] focus-visible:border-neutral-900 focus-visible:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55 data-[state=open]:border-neutral-900 data-[state=open]:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] [&>span]:line-clamp-1',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          'z-[100] overflow-hidden rounded-xl border border-border bg-white shadow-popover outline-none data-[state=open]:animate-dropdown-in',
          position === 'popper' &&
            'w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-h-[min(280px,var(--radix-select-content-available-height))]',
          className,
        )}
        position={position}
        sideOffset={6}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 cursor-default items-center justify-center bg-white text-muted [&_svg]:h-3.5 [&_svg]:w-3.5">
          <ChevronUp />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 cursor-default items-center justify-center bg-white text-muted [&_svg]:h-3.5 [&_svg]:w-3.5">
          <ChevronDown />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-lg py-2 pe-2.5 ps-7 text-sm text-foreground outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-hover',
        className,
      )}
      {...props}
    >
      <span className="absolute start-2 inline-flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export function SelectGroup(props: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group {...props} />
}

export function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2.5 pt-2 pb-1 text-xs font-semibold text-muted', className)}
      {...props}
    />
  )
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn('mx-1 my-1.5 h-px bg-border', className)}
      {...props}
    />
  )
}
