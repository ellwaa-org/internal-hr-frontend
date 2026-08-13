import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, Loader2, RefreshCw, X } from 'lucide-react'
import {
  exportOfficeAttendanceExcel,
  listAttendanceUsers,
  listDepartmentOptions,
  listOfficeOptions,
  reviewEarlyLeaveJustification,
  reviewLateJustification,
  type AttendanceRecord,
  type AttendanceUserItem,
  type AttendanceUserStatus,
  type DayStatus,
  type DepartmentOption,
  type JustificationStatus,
  type OfficeOption,
} from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { formatDate, formatTime12, startOfMonthIso, todayIsoDate } from '@/lib/datetime'
import { queryKeys, QUERY_STALE_TIME_FREQUENT } from '@/lib/query-client'
import { notify } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { DayPicker } from '@/components/ui/day-picker'
import { ExcelExportDialog } from '@/components/ui/excel-export-dialog'
import {
  FiltersBar,
  PageHeader,
  PageShell,
  PaginationBar,
  SearchField,
} from '@/components/ui/page'
import { Table, TableMessage, TableSection, Td, TdActions, Th, ThActions, Tr } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  not_started: 'لم يبدأ',
  checked_in: 'تم الحضور',
  completed: 'تم الانصراف',
}

/** UI filter values — "present" means anyone who checked in (API has no single status for that). */
type StatusFilter = 'all' | 'present' | 'checked_in' | 'completed' | 'absent'

const STATUS_FILTER_LABELS: Record<Exclude<StatusFilter, 'all'>, string> = {
  present: 'تم الحضور',
  checked_in: 'لم ينصرف',
  completed: 'تم الانصراف',
  absent: 'غائب',
}

const JUSTIFICATION_LABELS: Record<JustificationStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'مقبول',
  rejected: 'مرفوض',
}

type AttendanceRow = {
  key: string
  userId: number
  employeeName: string
  employeeCode?: string
  officeName?: string | null
  departmentName?: string | null
  date?: string
  isAbsent: boolean
  record: AttendanceRecord | null
}

function formatTime(value?: string | null): string {
  return formatTime12(value)
}

const STATUS_PILL_TONES = {
  neutral:
    'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-neutral-100 text-neutral-600',
  success:
    'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-success-soft text-success',
  warning:
    'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-warning-soft text-warning',
  danger:
    'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-danger-soft text-red-700',
  info: 'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-info-soft text-info',
} as const

function StatusPill({
  tone,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  children: ReactNode
}) {
  return <span className={STATUS_PILL_TONES[tone]}>{children}</span>
}

function dayStatusTone(status?: DayStatus): 'neutral' | 'success' | 'warning' | 'info' {
  if (status === 'completed') return 'success'
  if (status === 'checked_in') return 'info'
  if (status === 'not_started') return 'neutral'
  return 'neutral'
}

function justificationTone(
  status?: JustificationStatus | null,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

function pickOfficeRecords(item: AttendanceUserItem): AttendanceRecord[] {
  const officeRecords = item.attendance.filter((r) => r.type !== 'task')
  const pool = officeRecords.length > 0 ? officeRecords : item.attendance
  return [...pool]
    .filter((r) => Boolean(r.checkInAt) || Boolean(r.checkOutAt) || Boolean(r.dayStatus))
    .sort((a, b) => {
      const aTime = a.checkInAt || a.date || ''
      const bTime = b.checkInAt || b.date || ''
      return bTime.localeCompare(aTime)
    })
}

function itemIsAbsent(item: AttendanceUserItem): boolean {
  if (item.isAbsent === true) return true
  const records = pickOfficeRecords(item)
  if (records.length === 0) return true
  return records.every((r) => !r.checkInAt)
}

function itemIsPresent(item: AttendanceUserItem): boolean {
  return !itemIsAbsent(item) && pickOfficeRecords(item).some((r) => Boolean(r.checkInAt))
}

function buildRows(
  items: AttendanceUserItem[],
  officesById: Map<number, OfficeOption>,
  departmentsById: Map<number, DepartmentOption>,
  fallbackDate: string,
): AttendanceRow[] {
  const rows: AttendanceRow[] = []

  for (const item of items) {
    const officeId = item.user.officeId ?? null
    const departmentId = item.user.departmentId ?? null
    const officeName =
      item.user.office?.name ||
      (officeId != null ? officesById.get(officeId)?.name : null) ||
      null
    const departmentName =
      item.user.department?.name ||
      (departmentId != null ? departmentsById.get(departmentId)?.name : null) ||
      null
    const employeeName = item.user.fullName || `موظف #${item.user.id}`
    const absent = itemIsAbsent(item)
    const records = pickOfficeRecords(item)

    if (absent || records.length === 0) {
      rows.push({
        key: `${item.user.id}-absent`,
        userId: item.user.id,
        employeeName,
        employeeCode: item.user.employeeCode,
        officeName,
        departmentName,
        date: item.from || fallbackDate,
        isAbsent: true,
        record: null,
      })
      continue
    }

    for (const record of records) {
      rows.push({
        key: `${item.user.id}-${record.id}`,
        userId: item.user.id,
        employeeName,
        employeeCode: item.user.employeeCode,
        officeName:
          record.office?.name ||
          (record.officeId != null ? officesById.get(record.officeId)?.name : null) ||
          officeName,
        departmentName,
        date: record.date || item.from || fallbackDate,
        isAbsent: false,
        record,
      })
    }
  }

  return rows
}

function resolveRowStatus(row: AttendanceRow): {
  label: string
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
} {
  if (row.isAbsent || !row.record) {
    return { label: 'غائب', tone: 'danger' }
  }
  const record = row.record
  if (record.checkInAt && !record.checkOutAt) {
    return { label: 'تم الحضور', tone: 'info' }
  }
  if (record.checkOutAt || record.dayStatus === 'completed') {
    return { label: 'تم الانصراف', tone: 'success' }
  }
  if (record.dayStatus) {
    return {
      label: DAY_STATUS_LABELS[record.dayStatus],
      tone: dayStatusTone(record.dayStatus),
    }
  }
  return { label: '—', tone: 'neutral' }
}

function apiStatusForFilter(filter: StatusFilter): AttendanceUserStatus | undefined {
  if (filter === 'checked_in') return 'checked_in'
  if (filter === 'completed') return 'completed'
  if (filter === 'absent') return 'absent'
  // present/all: no API status — present is filtered client-side
  return undefined
}

function AttendancePage({
  token,
  onUnauthorized,
}: {
  token: string
  onUnauthorized: () => void
}) {
  const queryClient = useQueryClient()
  const today = useMemo(() => todayIsoDate(), [])
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [officeId, setOfficeId] = useState<'all' | string>('all')
  const [departmentId, setDepartmentId] = useState<'all' | string>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (isUnauthorizedError(err)) {
        notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
        onUnauthorized()
        return
      }
      notify.error(err, fallback)
    },
    [onUnauthorized],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, from, to, status])

  const searching = Boolean(debouncedSearch)
  const needsClientStatusFilter = status === 'present'
  const fetchLimit = searching || needsClientStatusFilter ? 100 : limit
  const isTodayView = from === today && to === today
  const apiStatus = apiStatusForFilter(status)

  const listParams = useMemo(
    () => ({
      page: searching || needsClientStatusFilter ? 1 : page,
      limit: fetchLimit,
      today: isTodayView,
      from,
      to,
      status,
      officeId,
      departmentId,
      type: 'office',
      search: debouncedSearch,
    }),
    [
      page,
      fetchLimit,
      searching,
      needsClientStatusFilter,
      isTodayView,
      from,
      to,
      status,
      officeId,
      departmentId,
      debouncedSearch,
    ],
  )

  const attendanceQuery = useQuery({
    queryKey: queryKeys.attendance.users(listParams),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () =>
      listAttendanceUsers(token, {
        today: isTodayView,
        from: isTodayView ? undefined : from || undefined,
        to: isTodayView ? undefined : to || undefined,
        page: searching || needsClientStatusFilter ? 1 : page,
        limit: fetchLimit,
        type: 'office',
        status: apiStatus,
        officeId: officeId === 'all' ? undefined : Number(officeId),
        departmentId: departmentId === 'all' ? undefined : Number(departmentId),
      }),
  })

  const officesQuery = useQuery({
    queryKey: queryKeys.offices.options(),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () => listOfficeOptions(token, { limit: 100 }),
  })

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.options(),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () => listDepartmentOptions(token, { limit: 100 }),
  })

  useEffect(() => {
    if (attendanceQuery.error) {
      handleApiError(attendanceQuery.error, 'تعذر تحميل سجلات الحضور')
    }
  }, [attendanceQuery.error, handleApiError])

  const offices = officesQuery.data ?? []
  const departments = departmentsQuery.data ?? []

  const officesById = useMemo(() => {
    const map = new Map<number, OfficeOption>()
    for (const office of offices) map.set(office.id, office)
    return map
  }, [offices])

  const departmentsById = useMemo(() => {
    const map = new Map<number, DepartmentOption>()
    for (const department of departments) map.set(department.id, department)
    return map
  }, [departments])

  const items = attendanceQuery.data?.data ?? []
  const filteredItems = useMemo(() => {
    // "تم الحضور" = anyone who checked in (API has no single status for this)
    if (status === 'present') return items.filter(itemIsPresent)
    return items
  }, [items, status])

  const fallbackDate = from || today
  const allRows = useMemo(
    () => buildRows(filteredItems, officesById, departmentsById, fallbackDate),
    [filteredItems, officesById, departmentsById, fallbackDate],
  )

  const rows = useMemo(() => {
    if (!debouncedSearch) return allRows
    const q = debouncedSearch.toLowerCase()
    return allRows.filter((row) => {
      const name = row.employeeName.toLowerCase()
      const code = (row.employeeCode || '').toLowerCase()
      return name.includes(q) || code.includes(q)
    })
  }, [allRows, debouncedSearch])

  const clientFiltered = searching || needsClientStatusFilter
  const total = clientFiltered ? rows.length : (attendanceQuery.data?.total ?? 0)
  const totalPages = clientFiltered
    ? 1
    : Math.max(1, attendanceQuery.data?.totalPages ?? 1)
  const loading = attendanceQuery.isLoading || (attendanceQuery.isFetching && rows.length === 0)

  const pageLabel = useMemo(() => {
    if (rows.length === 0) return 'لا توجد نتائج'
    if (clientFiltered) return `${rows.length} نتيجة`
    const fromIdx = (page - 1) * limit + 1
    const toIdx = Math.min(page * limit, total)
    return `${fromIdx}–${toIdx} من ${total}`
  }, [rows.length, clientFiltered, page, limit, total])

  const review = async (
    record: AttendanceRecord,
    kind: 'late' | 'early',
    nextStatus: 'approved' | 'rejected',
  ) => {
    setBusyId(`${record.id}-${kind}-${nextStatus}`)
    const toastId = notify.loading(
      nextStatus === 'approved' ? 'جارٍ الموافقة...' : 'جارٍ الرفض...',
    )
    try {
      if (kind === 'late') {
        await reviewLateJustification(token, record.id, nextStatus)
      } else {
        await reviewEarlyLeaveJustification(token, record.id, nextStatus)
      }
      notify.dismiss(toastId)
      notify.success(nextStatus === 'approved' ? 'تمت الموافقة' : 'تم الرفض')
      await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all })
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تحديث التبرير')
    } finally {
      setBusyId(null)
    }
  }

  const needsLateReview = (r: AttendanceRecord) =>
    Boolean(r.lateReason) &&
    (r.lateJustificationStatus === 'pending' || r.lateJustificationStatus == null)

  const needsEarlyReview = (r: AttendanceRecord) =>
    Boolean(r.earlyLeaveReason) &&
    (r.earlyLeaveJustificationStatus === 'pending' ||
      r.earlyLeaveJustificationStatus == null)

  const exportExcel = async (range: { from: string; to: string }) => {
    setExporting(true)
    const toastId = notify.loading('جارٍ تصدير ملف Excel...')
    try {
      await exportOfficeAttendanceExcel(token, range)
      notify.dismiss(toastId)
      notify.success('تم تنزيل ملف الحضور')
      setExportOpen(false)
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تصدير الحضور')
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="الحضور والانصراف"
        subtitle="متابعة الحضور مع فلترة التاريخ والحالة والمكتب والإدارة والبحث بالاسم"
        action={
          <Button
            type="button"
            disabled={exporting}
            onClick={() => setExportOpen(true)}
            variant="primary"
            fullOnMobile
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            تصدير Excel
          </Button>
        }
      />

      <ExcelExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultFrom={startOfMonthIso(from)}
        defaultTo={to}
        exporting={exporting}
        onExport={exportExcel}
        title="تصدير حضور المكتب"
        description="اختر الفترة الزمنية لتصدير جدول الحضور والانصراف الكامل لجميع الأيام ضمن النطاق."
      />

      <FiltersBar>
        <DayPicker
          date={from}
          onChange={(next) => {
            setPage(1)
            setFrom(next)
            setTo(next)
          }}
        />

        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم الموظف أو الكود..."
          aria-label="بحث باسم الموظف"
        />

        <Select
          value={status}
          onValueChange={(value) => {
            setPage(1)
            setStatus(value as StatusFilter)
          }}
        >
          <SelectTrigger
            className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0"
            aria-label="الحالة"
          >
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="present">{STATUS_FILTER_LABELS.present}</SelectItem>
            <SelectItem value="checked_in">{STATUS_FILTER_LABELS.checked_in}</SelectItem>
            <SelectItem value="completed">{STATUS_FILTER_LABELS.completed}</SelectItem>
            <SelectItem value="absent">{STATUS_FILTER_LABELS.absent}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={officeId}
          onValueChange={(value) => {
            setPage(1)
            setOfficeId(value)
          }}
        >
          <SelectTrigger
            className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0"
            aria-label="المكتب"
          >
            <SelectValue placeholder="المكتب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المكاتب</SelectItem>
            {offices.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={departmentId}
          onValueChange={(value) => {
            setPage(1)
            setDepartmentId(value)
          }}
        >
          <SelectTrigger
            className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0"
            aria-label="الإدارة"
          >
            <SelectValue placeholder="الإدارة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الإدارات</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          onClick={() => void attendanceQuery.refetch()} variant="secondary" className="w-10 p-0"
          aria-label="تحديث"
          title="تحديث"
        >
          {attendanceQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </FiltersBar>

      <TableSection
        footer={
          <PaginationBar
            info={pageLabel}
            page={clientFiltered ? 1 : page}
            totalPages={totalPages}
            disabled={loading || clientFiltered}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        }
      >
        <Table>
          <thead>
            <tr>
              <Th className="min-w-[168px]">الموظف</Th>
              <Th>التاريخ</Th>
              <Th>الحضور</Th>
              <Th>الانصراف</Th>
              <Th>الحالة</Th>
              <Th>تبرير التأخير</Th>
              <Th>تبرير الانصراف المبكر</Th>
              <ThActions>مراجعة</ThActions>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <TableMessage colSpan={8}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل السجلات...
              </TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={8}>لا توجد سجلات حضور</TableMessage>
            ) : (
              rows.map((row) => {
                const record = row.record
                const rowStatus = resolveRowStatus(row)
                return (
                  <Tr key={row.key}>
                    <Td className="min-w-[168px] max-w-[240px]">
                      <span className="block truncate font-semibold text-foreground" title={row.employeeName}>
                        {row.employeeName}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{formatDate(row.date)}</Td>
                    <Td>
                      {row.isAbsent || !record ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="tabular-nums">{formatTime(record.checkInAt)}</span>
                          {record.isLate && <StatusPill tone="warning">متأخر</StatusPill>}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {row.isAbsent || !record ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="tabular-nums">{formatTime(record.checkOutAt)}</span>
                          {record.isEarlyLeave && (
                            <StatusPill tone="warning">انصراف مبكر</StatusPill>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <StatusPill tone={rowStatus.tone}>{rowStatus.label}</StatusPill>
                    </Td>
                    <Td>
                      {!record ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex min-w-0 flex-col gap-1">
                          <span
                            className="line-clamp-2 leading-[1.35] text-muted"
                            title={record.lateReason || undefined}
                          >
                            {record.lateReason || '—'}
                          </span>
                          {record.lateJustificationStatus && (
                            <StatusPill
                              tone={justificationTone(record.lateJustificationStatus)}
                            >
                              {JUSTIFICATION_LABELS[record.lateJustificationStatus]}
                            </StatusPill>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {!record ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex min-w-0 flex-col gap-1">
                          <span
                            className="line-clamp-2 leading-[1.35] text-muted"
                            title={record.earlyLeaveReason || undefined}
                          >
                            {record.earlyLeaveReason || '—'}
                          </span>
                          {record.earlyLeaveJustificationStatus && (
                            <StatusPill
                              tone={justificationTone(record.earlyLeaveJustificationStatus)}
                            >
                              {JUSTIFICATION_LABELS[record.earlyLeaveJustificationStatus]}
                            </StatusPill>
                          )}
                        </div>
                      )}
                    </Td>
                    <TdActions>
                      {!record ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {needsLateReview(record) && (
                            <div className="flex gap-1.5">
                              <Button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() => void review(record, 'late', 'approved')}
                                variant="primary"
                                size="sm"
                                title="موافقة على التأخير"
                              >
                                {busyId === `${record.id}-late-approved` ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Check />
                                )}
                                تأخير
                              </Button>
                              <Button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() => void review(record, 'late', 'rejected')}
                                variant="danger"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title="رفض التأخير"
                              >
                                {busyId === `${record.id}-late-rejected` ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <X />
                                )}
                              </Button>
                            </div>
                          )}
                          {needsEarlyReview(record) && (
                            <div className="flex gap-1.5">
                              <Button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() => void review(record, 'early', 'approved')}
                                variant="primary"
                                size="sm"
                                title="موافقة على الانصراف المبكر"
                              >
                                {busyId === `${record.id}-early-approved` ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <Check />
                                )}
                                مبكر
                              </Button>
                              <Button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() => void review(record, 'early', 'rejected')}
                                variant="danger"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title="رفض الانصراف المبكر"
                              >
                                {busyId === `${record.id}-early-rejected` ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <X />
                                )}
                              </Button>
                            </div>
                          )}
                          {!needsLateReview(record) && !needsEarlyReview(record) && (
                            <span className="text-muted">—</span>
                          )}
                        </div>
                      )}
                    </TdActions>
                  </Tr>
                )
              })
            )}
          </tbody>
        </Table>
      </TableSection>
    </PageShell>
  )
}

export default AttendancePage
