import { useEffect, useMemo, useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  addDaysIso,
  formatDayHeading,
  parseIsoDate,
  toIsoDate,
  todayIsoDate,
} from '@/lib/datetime'
import { cn } from '@/lib/utils'

export function DayPicker({
  date,
  onChange,
  className,
}: {
  date: string
  onChange: (next: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const today = useMemo(() => todayIsoDate(), [])
  const isToday = date === today
  const heading = useMemo(() => formatDayHeading(date), [date])
  const selected = useMemo(() => parseIsoDate(date), [date])
  const [month, setMonth] = useState(selected)

  useEffect(() => {
    setMonth(selected)
  }, [selected])

  return (
    <div className={cn('flex items-center gap-2 max-[720px]:w-full', className)}>
      <Button
        type="button"
        variant="secondary"
        className="h-10 w-10 shrink-0 p-0"
        aria-label="اليوم السابق"
        title="اليوم السابق"
        onClick={() => onChange(addDaysIso(date, -1))}
      >
        <ChevronRight />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="h-10 min-w-0 flex-1 justify-start gap-2.5 px-3 sm:min-w-[240px] sm:flex-none"
            aria-label="فتح التقويم"
            title="فتح التقويم"
          >
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="flex min-w-0 flex-col items-start gap-0.5 text-start leading-none">
              <span className="truncate text-sm font-bold text-foreground">
                {isToday ? 'اليوم' : heading.weekday}
              </span>
              <span className="truncate text-[11px] font-medium text-muted">{heading.rest}</span>
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent align="center" className="w-auto p-0" dir="rtl">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="m-0 text-sm font-bold text-foreground">
                {isToday ? 'اليوم' : heading.weekday}
              </p>
              <p className="m-0 text-[12px] text-muted">{heading.rest}</p>
            </div>
            {!isToday ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  onChange(today)
                  setOpen(false)
                }}
              >
                اليوم
              </Button>
            ) : null}
          </div>

          <div className="p-3">
            <Calendar
              mode="single"
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              onSelect={(next) => {
                if (!next) return
                onChange(toIsoDate(next))
                setOpen(false)
              }}
            />
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="secondary"
        className="h-10 w-10 shrink-0 p-0"
        aria-label="اليوم التالي"
        title="اليوم التالي"
        onClick={() => onChange(addDaysIso(date, 1))}
      >
        <ChevronLeft />
      </Button>
    </div>
  )
}
