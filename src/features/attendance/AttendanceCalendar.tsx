import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { getUserAttendance, type AttendanceRecord } from '@/lib/api'
import {
  cycleContainingIso,
  cycleEndIso,
  eachDayIso,
  formatCycleRange,
  formatDate,
  formatTime12,
  parseIsoDate,
  shiftCycleStartIso,
  toIsoDate,
  todayIsoDate,
} from '@/lib/datetime'
import { queryKeys, QUERY_STALE_TIME_FREQUENT } from '@/lib/query-client'
import { notify } from '@/lib/toast'
import { cn } from '@/lib/utils'

export type AttendanceCalendarUser = {
  id: number
  name: string
  employeeCode?: string
}

export type AttendanceDayStatus = 'onTime' | 'late' | 'absent' | 'earlyLeave'

const STATUS_LABELS: Record<AttendanceDayStatus, string> = {
  onTime: 'حضور في الموعد',
  late: 'تأخير حضور',
  absent: 'غياب',
  earlyLeave: 'انصراف مبكر',
}

const STATUS_DOT: Record<AttendanceDayStatus, string> = {
  onTime: 'bg-[#22c55e]',
  late: 'bg-[#f59e0b]',
  absent: 'bg-[#ef4444]',
  earlyLeave: 'bg-[#a855f7]',
}

const LEGEND_ORDER: AttendanceDayStatus[] = ['onTime', 'late', 'absent', 'earlyLeave']

/** Saturday-first, matching RTL Arabic calendars. */
const WEEKDAY_LABELS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

function isFriday(date: Date): boolean {
  return date.getDay() === 5
}

function recordDateIso(record: AttendanceRecord): string | null {
  if (record.date) return record.date.length > 10 ? record.date.slice(0, 10) : record.date
  if (record.checkInAt) {
    const parsed = new Date(record.checkInAt)
    if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed)
  }
  return null
}

function pickOfficeRecords(records: AttendanceRecord[]): AttendanceRecord[] {
  const office = records.filter((record) => record.type !== 'task')
  return office.length > 0 ? office : records
}

function statusesForRecords(
  records: AttendanceRecord[],
  date: string,
  today: string,
): AttendanceDayStatus[] {
  const pool = pickOfficeRecords(records)
  const hasCheckIn = pool.some((record) => Boolean(record.checkInAt))

  if (!hasCheckIn) {
    if (date >= today) return []
    if (isFriday(parseIsoDate(date))) return []
    return ['absent']
  }

  const statuses: AttendanceDayStatus[] = []
  if (pool.some((record) => record.isLate)) statuses.push('late')
  else statuses.push('onTime')
  if (pool.some((record) => record.isEarlyLeave)) statuses.push('earlyLeave')
  return statuses
}

function buildCycleStatus(
  records: AttendanceRecord[],
  from: string,
  to: string,
  today: string,
): Map<string, { statuses: AttendanceDayStatus[]; records: AttendanceRecord[] }> {
  const byDate = new Map<string, AttendanceRecord[]>()
  for (const record of records) {
    const iso = recordDateIso(record)
    if (!iso) continue
    const list = byDate.get(iso) ?? []
    list.push(record)
    byDate.set(iso, list)
  }

  const result = new Map<string, { statuses: AttendanceDayStatus[]; records: AttendanceRecord[] }>()
  for (const iso of eachDayIso(from, to)) {
    const dayRecords = byDate.get(iso) ?? []
    const statuses = statusesForRecords(dayRecords, iso, today)
    if (statuses.length > 0 || dayRecords.length > 0) {
      result.set(iso, { statuses, records: dayRecords })
    }
  }

  return result
}

/** Weeks starting Saturday, padded so the first cycle day lands on the correct weekday. */
function buildCycleWeeks(from: string, to: string): (string | null)[][] {
  const days = eachDayIso(from, to)
  const firstDow = parseIsoDate(from).getDay()
  const leading = (firstDow - 6 + 7) % 7
  const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...days]
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

async function fetchCycleAttendance(
  token: string,
  userId: number,
  from: string,
  to: string,
): Promise<AttendanceRecord[]> {
  const records: AttendanceRecord[] = []
  let page = 1

  for (;;) {
    const res = await getUserAttendance(token, userId, {
      from,
      to,
      type: 'office',
      page,
      limit: 100,
    })
    records.push(...res.data)
    if (page >= Math.max(1, res.totalPages)) break
    page += 1
  }

  return records
}

function StatusDots({
  statuses,
  className,
}: {
  statuses: AttendanceDayStatus[]
  className?: string
}) {
  if (statuses.length === 0) return null
  return (
    <span className={cn('flex items-center justify-center gap-0.5', className)}>
      {statuses.map((status) => (
        <span
          key={status}
          className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])}
          aria-hidden
        />
      ))}
    </span>
  )
}

export function AttendanceCalendar({
  token,
  user,
  initialDate,
}: {
  token: string
  user: AttendanceCalendarUser
  initialDate: string
}) {
  const today = useMemo(() => todayIsoDate(), [])
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [cycleFrom, setCycleFrom] = useState(() => cycleContainingIso(initialDate).from)
  const cycleTo = cycleEndIso(cycleFrom)
  const [activeStatus, setActiveStatus] = useState<AttendanceDayStatus | null>(null)

  const cycleQuery = useQuery({
    queryKey: queryKeys.attendance.user(user.id, {
      page: 1,
      limit: 100,
      from: cycleFrom,
      to: cycleTo,
      type: 'office',
    }),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    queryFn: () => fetchCycleAttendance(token, user.id, cycleFrom, cycleTo),
  })

  useEffect(() => {
    if (cycleQuery.error) {
      notify.error(cycleQuery.error, 'تعذر تحميل تقويم الحضور')
    }
  }, [cycleQuery.error])

  const statusByDate = useMemo(
    () => buildCycleStatus(cycleQuery.data ?? [], cycleFrom, cycleTo, today),
    [cycleQuery.data, cycleFrom, cycleTo, today],
  )

  const weeks = useMemo(() => buildCycleWeeks(cycleFrom, cycleTo), [cycleFrom, cycleTo])
  const selectedDay = statusByDate.get(selectedDate)
  const filteredDays = useMemo(() => {
    if (!activeStatus) return []
    return [...statusByDate.entries()]
      .filter(([, info]) => info.statuses.includes(activeStatus))
      .map(([iso, info]) => ({ iso, ...info }))
      .sort((a, b) => a.iso.localeCompare(b.iso))
  }, [activeStatus, statusByDate])

  const shiftCycle = (months: number) => {
    setCycleFrom((current) => shiftCycleStartIso(current, months))
    setActiveStatus(null)
  }

  return (
    <div className="flex flex-col">
      <div className="relative">
        {cycleQuery.isFetching ? (
          <div className="absolute start-0 top-0 z-10 inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/90 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : null}

        <div className="relative mb-3 flex h-10 items-center justify-between">
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-white text-foreground transition-colors hover:bg-hover"
            onClick={() => shiftCycle(-1)}
            aria-label="الدورة السابقة"
            title="الدورة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <p className="m-0 px-2 text-center text-sm font-bold text-foreground">
            {formatCycleRange(cycleFrom, cycleTo)}
          </p>
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-white text-foreground transition-colors hover:bg-hover"
            onClick={() => shiftCycle(1)}
            aria-label="الدورة التالية"
            title="الدورة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className={cn(
                'pb-1 text-center text-[10px] font-semibold text-muted',
                label === 'الجمعة' && 'text-neutral-400',
              )}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="flex flex-col">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7">
              {week.map((iso, dayIndex) => {
                if (!iso) {
                  return <div key={`empty-${weekIndex}-${dayIndex}`} className="h-11" />
                }

                const date = parseIsoDate(iso)
                const friday = isFriday(date)
                const info = statusByDate.get(iso)
                const statuses = info?.statuses ?? []
                const visible = activeStatus
                  ? statuses.filter((status) => status === activeStatus)
                  : statuses
                const dimmed = Boolean(activeStatus && !statuses.includes(activeStatus))
                const isSelected = iso === selectedDate
                const isToday = iso === today

                return (
                  <div
                    key={iso}
                    className={cn(
                      'relative flex h-11 flex-col items-center justify-start p-0',
                      dimmed && 'opacity-35',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDate(iso)}
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-sm font-medium transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900',
                        friday && !isSelected && 'text-muted',
                        isToday && !isSelected && 'font-bold',
                        isSelected && 'bg-neutral-900 font-bold text-white hover:bg-black',
                      )}
                      aria-label={formatDate(iso)}
                      aria-pressed={isSelected}
                      title={friday ? `${formatDate(iso)} · عطلة` : formatDate(iso)}
                    >
                      {date.getDate()}
                    </button>
                    <StatusDots statuses={visible} className="absolute inset-x-0 bottom-0.5" />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
        {LEGEND_ORDER.map((status) => {
          const active = activeStatus === status
          return (
            <button
              key={status}
              type="button"
              onClick={() => setActiveStatus((current) => (current === status ? null : status))}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none px-2 py-1 text-[11px] font-medium text-foreground transition-colors',
                active ? 'bg-neutral-100' : 'bg-transparent hover:bg-hover',
              )}
              aria-pressed={active}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} aria-hidden />
              {STATUS_LABELS[status]}
            </button>
          )
        })}
      </div>

      <p className="m-0 mt-1 text-center text-[11px] text-muted">اضغط لوناً لعرض التفاصيل</p>

      {activeStatus ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="m-0 mb-2 text-[13px] font-semibold text-foreground">
            {STATUS_LABELS[activeStatus]}
            <span className="ms-1 font-medium text-muted">({filteredDays.length})</span>
          </p>
          {filteredDays.length === 0 ? (
            <p className="m-0 text-[12px] text-muted">لا توجد أيام بهذه الحالة في هذه الدورة.</p>
          ) : (
            <ul className="m-0 flex max-h-44 list-none flex-col gap-1.5 overflow-auto p-0">
              {filteredDays.map((day) => (
                <li key={day.iso}>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(day.iso)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-none bg-transparent px-1.5 py-1 text-start text-[12px] text-foreground hover:bg-hover',
                      day.iso === selectedDate && 'bg-neutral-100',
                    )}
                  >
                    <span>{formatDate(day.iso)}</span>
                    <DaySummary records={day.records} status={activeStatus} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : selectedDay ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="m-0 mb-2 text-[13px] font-semibold text-foreground">
            {formatDate(selectedDate)}
          </p>
          <DayDetails records={selectedDay.records} statuses={selectedDay.statuses} />
        </div>
      ) : null}
    </div>
  )
}

function DaySummary({
  records,
  status,
}: {
  records: AttendanceRecord[]
  status: AttendanceDayStatus
}) {
  const pool = pickOfficeRecords(records)
  if (status === 'absent') return <span className="text-muted">غائب</span>
  if (status === 'late') {
    const late = pool.find((record) => record.isLate)
    return <span className="tabular-nums text-muted">{formatTime12(late?.checkInAt)}</span>
  }
  if (status === 'earlyLeave') {
    const early = pool.find((record) => record.isEarlyLeave)
    return <span className="tabular-nums text-muted">{formatTime12(early?.checkOutAt)}</span>
  }
  const onTime = pool.find((record) => record.checkInAt && !record.isLate)
  return <span className="tabular-nums text-muted">{formatTime12(onTime?.checkInAt)}</span>
}

function DayDetails({
  records,
  statuses,
}: {
  records: AttendanceRecord[]
  statuses: AttendanceDayStatus[]
}) {
  const pool = pickOfficeRecords(records)
  if (statuses.includes('absent') && pool.every((record) => !record.checkInAt)) {
    return <p className="m-0 text-[12px] text-muted">لم يسجّل حضور في هذا اليوم.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {pool.map((record) => (
        <div
          key={record.id}
          className="flex flex-col gap-1 rounded-lg border border-border bg-[#fcfcfc] px-2.5 py-2"
        >
          <span className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-muted">الحضور</span>
            <span className="tabular-nums font-medium text-foreground">
              {formatTime12(record.checkInAt)}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-muted">الانصراف</span>
            <span className="tabular-nums font-medium text-foreground">
              {formatTime12(record.checkOutAt)}
            </span>
          </span>
          <span className="flex flex-wrap gap-1 pt-0.5">
            {record.isLate ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                تأخير حضور
              </span>
            ) : record.checkInAt ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                حضور في الموعد
              </span>
            ) : null}
            {record.isEarlyLeave ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#7e22ce]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#a855f7]" />
                انصراف مبكر
              </span>
            ) : null}
          </span>
          {record.lateReason ? (
            <p className="m-0 text-[12px] text-muted">
              تبرير التأخير: <span className="text-foreground">{record.lateReason}</span>
            </p>
          ) : null}
          {record.earlyLeaveReason ? (
            <p className="m-0 text-[12px] text-muted">
              تبرير الانصراف: <span className="text-foreground">{record.earlyLeaveReason}</span>
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
