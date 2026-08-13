import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  formatDate,
  parseIsoDate,
  startOfMonthIso,
  toIsoDate,
} from '@/lib/datetime'

export function ExcelExportDialog({
  open,
  onOpenChange,
  defaultFrom,
  defaultTo,
  exporting,
  onExport,
  title = 'تصدير Excel',
  description = 'اختر الفترة الزمنية لتصدير الجدول الكامل لجميع الأيام ضمن النطاق.',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultFrom: string
  defaultTo: string
  exporting: boolean
  onExport: (range: { from: string; to: string }) => void | Promise<void>
  title?: string
  description?: string
}) {
  const initialRange = useMemo<DateRange>(
    () => ({
      from: parseIsoDate(defaultFrom || startOfMonthIso(defaultTo)),
      to: parseIsoDate(defaultTo || defaultFrom),
    }),
    [defaultFrom, defaultTo],
  )
  const [range, setRange] = useState<DateRange | undefined>(initialRange)
  const [month, setMonth] = useState(initialRange.from ?? new Date())

  useEffect(() => {
    if (!open) return
    setRange(initialRange)
    setMonth(initialRange.from ?? new Date())
  }, [open, initialRange])

  const fromIso = range?.from ? toIsoDate(range.from) : ''
  const toIso = range?.to ? toIsoDate(range.to) : range?.from ? toIsoDate(range.from) : ''
  const canExport = Boolean(fromIso && toIso && !exporting)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (exporting && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent size="sm" showClose={!exporting}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="rounded-xl border border-border bg-[#fcfcfc] p-2">
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={range}
              month={month}
              onMonthChange={setMonth}
              onSelect={setRange}
            />
          </div>

          <p className="m-0 text-[13px] text-muted">
            {fromIso && toIso
              ? `الفترة: ${formatDate(fromIso)} — ${formatDate(toIso)}`
              : 'حدد تاريخ البداية ثم تاريخ النهاية'}
          </p>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={exporting}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canExport}
            onClick={() => {
              if (!fromIso || !toIso) return
              void onExport({ from: fromIso, to: toIso })
            }}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            تنزيل الملف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
