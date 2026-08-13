import type { CSSProperties, ComponentProps } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { arEG } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import 'react-day-picker/style.css'

const calendarVars = {
  '--rdp-accent-color': '#111111',
  '--rdp-accent-background-color': '#f5f5f5',
  '--rdp-day-height': '2.25rem',
  '--rdp-day-width': '2.25rem',
  '--rdp-day_button-height': '2rem',
  '--rdp-day_button-width': '2rem',
  '--rdp-day_button-border-radius': '0.625rem',
  '--rdp-selected-border': '2px solid #111111',
  '--rdp-today-color': '#111111',
  '--rdp-nav_button-height': '2rem',
  '--rdp-nav_button-width': '2rem',
  '--rdp-nav-height': '2.5rem',
} as CSSProperties

function NavButton({
  className,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-white text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

export function Calendar({ className, showOutsideDays = true, style, ...props }: DayPickerProps) {
  return (
    <DayPicker
      dir="rtl"
      locale={arEG}
      showOutsideDays={showOutsideDays}
      className={cn('text-sm text-foreground', className)}
      style={{ ...calendarVars, ...style }}
      classNames={{
        root: 'rdp-root',
        months: 'relative',
        month: 'space-y-3',
        month_caption: 'flex h-10 items-center justify-center px-10',
        caption_label: 'text-sm font-bold text-foreground',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: 'rdp-button_previous',
        button_next: 'rdp-button_next',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[11px] font-semibold text-muted',
        week: 'mt-1 flex w-full',
        day: 'relative flex h-9 w-9 items-center justify-center p-0 text-sm',
        day_button:
          'inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-transparent text-sm font-medium text-foreground transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900',
        selected:
          '[&>button]:border-transparent [&>button]:bg-neutral-900 [&>button]:font-bold [&>button]:text-white [&>button]:hover:bg-black',
        range_start:
          '[&>button]:border-transparent [&>button]:bg-neutral-900 [&>button]:font-bold [&>button]:text-white',
        range_end:
          '[&>button]:border-transparent [&>button]:bg-neutral-900 [&>button]:font-bold [&>button]:text-white',
        range_middle: '[&>button]:rounded-none [&>button]:bg-neutral-100 [&>button]:text-foreground',
        today: '[&>button]:font-bold [&>button]:ring-1 [&>button]:ring-neutral-900/20',
        outside: 'opacity-40',
        disabled: 'opacity-40',
        hidden: 'invisible',
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
        PreviousMonthButton: (buttonProps) => <NavButton {...buttonProps} />,
        NextMonthButton: (buttonProps) => <NavButton {...buttonProps} />,
      }}
      {...props}
    />
  )
}
