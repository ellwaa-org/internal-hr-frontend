import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  ExternalLink,
  Eye,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  exportTaskAttendanceExcel,
  listAttendance,
  listOfficeOptions,
  listUsers,
  type AttendanceRecord,
  type DayStatus,
  type OfficeOption,
  type UserRecord,
} from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { formatDate, formatDateTime12, startOfMonthIso, todayIsoDate } from '@/lib/datetime'
import { queryKeys, QUERY_STALE_TIME_FREQUENT } from '@/lib/query-client'
import { notify } from '@/lib/toast'
import { useDialogState } from '@/lib/use-dialog-state'
import { usePageParam } from '@/lib/use-page-param'
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
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  not_started: 'لم يبدأ',
  checked_in: 'جارٍ التنفيذ',
  completed: 'مكتمل',
}

type TaskRow = {
  id: string
  recordId: string
  userId?: number
  employeeName: string
  employeeCode?: string
  officeName?: string | null
  taskName: string
  date?: string
  addressName?: string | null
  mapLink?: string | null
  lat?: number | null
  lng?: number | null
  startedAt?: string | null
  endedAt?: string | null
  workDurationMinutes?: number | null
  dayStatus?: DayStatus
}

function formatDateTime(value?: string | null): string {
  return formatDateTime12(value)
}

function formatDuration(minutes?: number | null): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—'
  if (minutes < 60) return `${minutes} دقيقة`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} ساعة ${m} دقيقة` : `${h} ساعة`
}

const STATUS_PILL_TONES = {
  neutral: 'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-neutral-100 text-neutral-600',
  success: 'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-success-soft text-success',
  warning: 'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-warning-soft text-warning',
  danger: 'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-danger-soft text-red-700',
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

function buildTaskRows(
  records: AttendanceRecord[],
  usersById: Map<number, UserRecord>,
  officesById: Map<number, OfficeOption>,
): TaskRow[] {
  const rows: TaskRow[] = []

  for (const record of records) {
    const officeName =
      record.office?.name ||
      (record.officeId != null ? officesById.get(record.officeId)?.name : null)

    const tasks =
      record.tasks && record.tasks.length > 0
        ? record.tasks
        : [
            {
              id: record.id,
              taskName: record.taskName,
              lat: record.lat,
              lng: record.lng,
              addressName: record.addressName,
              mapLink: record.mapLink,
              startedAt: record.startedAt ?? record.checkInAt,
              endedAt: record.endedAt ?? record.checkOutAt,
              workDurationMinutes: record.workDurationMinutes,
              userId: record.userId,
              date: record.date,
              user: record.user,
            },
          ]

    for (const task of tasks) {
      const userId = task.userId ?? record.userId
      const fromUser = userId != null ? usersById.get(userId) : undefined
      const employeeName =
        [task.user?.fullName, record.user?.fullName, fromUser?.fullName]
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .find(Boolean) ||
        (userId != null ? `موظف #${userId}` : '—')
      const employeeCode =
        [task.user?.employeeCode, record.user?.employeeCode, fromUser?.employeeCode]
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .find(Boolean) || undefined

      rows.push({
        id: task.id || record.id,
        recordId: record.id,
        userId,
        employeeName,
        employeeCode,
        officeName,
        taskName: task.taskName || record.taskName || '—',
        date: task.date ?? record.date,
        addressName: task.addressName ?? record.addressName,
        mapLink: task.mapLink ?? record.mapLink,
        lat: task.lat ?? record.lat,
        lng: task.lng ?? record.lng,
        startedAt: task.startedAt ?? record.startedAt ?? record.checkInAt,
        endedAt: task.endedAt ?? record.endedAt ?? record.checkOutAt,
        workDurationMinutes: task.workDurationMinutes ?? record.workDurationMinutes,
        dayStatus: record.dayStatus,
      })
    }
  }

  return rows
}

function TasksPage({
  token,
  onUnauthorized,
}: {
  token: string
  onUnauthorized: () => void
}) {
  const [page, setPage] = usePageParam()
  const [limit] = useState(20)
  const today = useMemo(() => todayIsoDate(), [])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [dayStatus, setDayStatus] = useState<'all' | DayStatus>('all')
  const [officeId, setOfficeId] = useState<'all' | string>('all')
  const [userSearch, setUserSearch] = useState('')
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState<TaskRow | null>(null)
  const detailDialog = useDialogState(selected)

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
    const timer = window.setTimeout(() => setDebouncedUserSearch(userSearch.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [userSearch])

  const listParams = useMemo(
    () => ({
      page,
      limit,
      from,
      to,
      dayStatus,
      officeId,
      type: 'task',
    }),
    [page, limit, from, to, dayStatus, officeId],
  )

  const tasksQuery = useQuery({
    queryKey: queryKeys.attendance.list(listParams),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () =>
      listAttendance(token, {
        page,
        limit,
        from: from || undefined,
        to: to || undefined,
        dayStatus: dayStatus === 'all' ? undefined : dayStatus,
        officeId: officeId === 'all' ? undefined : Number(officeId),
        type: 'task',
      }),
  })

  const officesQuery = useQuery({
    queryKey: queryKeys.offices.options(),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () => listOfficeOptions(token, { limit: 100 }),
  })

  const usersDirectoryQuery = useQuery({
    queryKey: queryKeys.users.directory({ limit: 500, role: 'EMPLOYEE' }),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: async () => {
      const first = await listUsers(token, { page: 1, limit: 100, role: 'EMPLOYEE' })
      if (first.totalPages <= 1) return first
      const pages = await Promise.all(
        Array.from({ length: Math.min(first.totalPages, 5) - 1 }, (_, index) =>
          listUsers(token, { page: index + 2, limit: 100, role: 'EMPLOYEE' }),
        ),
      )
      const data = [...first.data, ...pages.flatMap((page) => page.data)]
      return {
        ...first,
        data,
        total: data.length,
        totalPages: 1,
        limit: data.length,
      }
    },
  })

  useEffect(() => {
    if (tasksQuery.error) {
      handleApiError(tasksQuery.error, 'تعذر تحميل سجلات المهام')
    }
  }, [tasksQuery.error, handleApiError])

  const offices = officesQuery.data ?? []
  const allUsers = usersDirectoryQuery.data?.data ?? []

  const usersById = useMemo(() => {
    const map = new Map<number, UserRecord>()
    for (const user of allUsers) map.set(user.id, user)
    return map
  }, [allUsers])

  const officesById = useMemo(() => {
    const map = new Map<number, OfficeOption>()
    for (const office of offices) map.set(office.id, office)
    return map
  }, [offices])

  const lookupsReady = usersDirectoryQuery.isFetched
  const records = tasksQuery.data?.data ?? []
  const allRows = useMemo(
    () => (lookupsReady ? buildTaskRows(records, usersById, officesById) : []),
    [lookupsReady, records, usersById, officesById],
  )
  const rows = useMemo(() => {
    if (!debouncedUserSearch) return allRows
    const q = debouncedUserSearch.toLowerCase()
    return allRows.filter((row) => {
      const name = row.employeeName.toLowerCase()
      const code = (row.employeeCode || '').toLowerCase()
      return name.includes(q) || code.includes(q)
    })
  }, [allRows, debouncedUserSearch])

  const searching = Boolean(debouncedUserSearch)
  const total = searching ? rows.length : (tasksQuery.data?.total ?? 0)
  const totalPages = searching ? 1 : Math.max(1, tasksQuery.data?.totalPages ?? 1)
  const loading =
    !lookupsReady ||
    usersDirectoryQuery.isLoading ||
    tasksQuery.isLoading ||
    (tasksQuery.isFetching && rows.length === 0)

  const pageLabel = useMemo(() => {
    if (rows.length === 0) return 'لا توجد نتائج'
    if (searching) return `${rows.length} نتيجة`
    const fromIdx = (page - 1) * limit + 1
    const toIdx = Math.min(page * limit, total)
    return `${fromIdx}–${toIdx} من ${total}`
  }, [rows.length, searching, page, limit, total])

  const exportExcel = async (range: { from: string; to: string }) => {
    setExporting(true)
    const toastId = notify.loading('جارٍ تصدير ملف Excel...')
    try {
      await exportTaskAttendanceExcel(token, range)
      notify.dismiss(toastId)
      notify.success('تم تنزيل ملف المهام')
      setExportOpen(false)
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تصدير المهام')
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="المهام الخارجية"
        subtitle="متابعة مهام الموظفين خارج المكتب والمواقع والمدد الزمنية"
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
        title="تصدير المهام الخارجية"
        description="اختر الفترة الزمنية لتصدير جدول المهام الخارجية الكامل لجميع الأيام ضمن النطاق."
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

        <Select
          value={dayStatus}
          onValueChange={(value) => {
            setPage(1)
            setDayStatus(value as 'all' | DayStatus)
          }}
        >
          <SelectTrigger className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="حالة المهمة">
            <SelectValue placeholder="حالة المهمة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="not_started">لم يبدأ</SelectItem>
            <SelectItem value="checked_in">جارٍ التنفيذ</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={officeId}
          onValueChange={(value) => {
            setPage(1)
            setOfficeId(value)
          }}
        >
          <SelectTrigger className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="المكتب">
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

        <SearchField
          value={userSearch}
          onChange={(e) => {
            setPage(1)
            setUserSearch(e.target.value)
          }}
          placeholder="بحث عن موظف للتصفية..."
          aria-label="بحث عن موظف"
          className="flex-[1_1_220px]"
        />

        <Button
          type="button"
          onClick={() => void tasksQuery.refetch()} variant="secondary" className="w-10 p-0"
          aria-label="تحديث"
          title="تحديث"
        >
          {tasksQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </FiltersBar>

      <TableSection
        footer={
          <PaginationBar
            info={pageLabel}
            page={searching ? 1 : page}
            totalPages={totalPages}
            disabled={loading || searching}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        }
      >
        <Table>
          <thead>
            <tr>
              <Th className="min-w-[168px]">الموظف</Th>
              <Th>المهمة</Th>
              <Th>التاريخ</Th>
              <Th>الموقع</Th>
              <Th>البداية</Th>
              <Th>النهاية</Th>
              <Th>المدة</Th>
              <Th>الحالة</Th>
              <ThActions>تفاصيل</ThActions>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <TableMessage colSpan={9}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل المهام...
              </TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={9}>لا توجد مهام خارجية</TableMessage>
            ) : (
              rows.map((row) => (
                <Tr key={`${row.recordId}-${row.id}`}>
                  <Td className="min-w-[168px] max-w-[240px]">
                    <span className="block truncate font-semibold text-foreground" title={row.employeeName}>
                      {row.employeeName}
                    </span>
                  </Td>
                  <Td>
                    <span className="line-clamp-2 leading-[1.35]" title={row.taskName}>
                      {row.taskName}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(row.date)}</Td>
                  <Td>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className="line-clamp-2 leading-[1.35] text-muted"
                        title={row.addressName || undefined}
                      >
                        {row.addressName || '—'}
                      </span>
                      {row.mapLink && (
                        <a
                          href={row.mapLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-fit items-center gap-1 text-xs text-info no-underline hover:underline"
                        >
                          الخريطة <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(row.startedAt)}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(row.endedAt)}</Td>
                  <Td className="whitespace-nowrap tabular-nums text-muted">
                    {formatDuration(row.workDurationMinutes)}
                  </Td>
                  <Td>
                    {row.dayStatus ? (
                      <StatusPill tone={dayStatusTone(row.dayStatus)}>
                        {DAY_STATUS_LABELS[row.dayStatus]}
                      </StatusPill>
                    ) : row.endedAt ? (
                      <StatusPill tone="success">مكتمل</StatusPill>
                    ) : row.startedAt ? (
                      <StatusPill tone="info">جارٍ التنفيذ</StatusPill>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <TdActions>
                    <Button
                      type="button"
                      onClick={() => setSelected(row)}
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="عرض التفاصيل"
                      aria-label="عرض التفاصيل"
                    >
                      <Eye />
                    </Button>
                  </TdActions>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableSection>

      <Dialog open={detailDialog.open} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تفاصيل المهمة</DialogTitle>
            <DialogDescription>سجل المهمة الخارجية للموظف</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {!detailDialog.data ? (
              <p className="m-0 text-sm text-muted">لا توجد تفاصيل متاحة</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">الموظف</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {detailDialog.data.employeeName}
                    {detailDialog.data.employeeCode ? ` · ${detailDialog.data.employeeCode}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">المهمة</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {detailDialog.data.taskName}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">التاريخ</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {formatDate(detailDialog.data.date)}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">الموقع</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {detailDialog.data.addressName || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">الإحداثيات</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {detailDialog.data.lat != null && detailDialog.data.lng != null
                      ? `${detailDialog.data.lat}, ${detailDialog.data.lng}`
                      : '—'}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">البداية</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {formatDateTime(detailDialog.data.startedAt)}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">النهاية</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {formatDateTime(detailDialog.data.endedAt)}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] items-start gap-2">
                  <span className="text-[13px] text-muted">المدة</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {formatDuration(detailDialog.data.workDurationMinutes)}
                  </span>
                </div>
                {detailDialog.data.mapLink && (
                  <a
                    href={detailDialog.data.mapLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-transparent px-3.5 text-sm font-semibold transition-[background,border-color,opacity] disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 h-[34px] px-2.5 text-[13px] border-border bg-white text-foreground hover:enabled:bg-hover w-fit"
                  >
                    <ExternalLink />
                    فتح الخريطة
                  </a>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setSelected(null)} variant="secondary">
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

export default TasksPage
