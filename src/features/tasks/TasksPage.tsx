import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleStop,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import {
  endFieldTask,
  exportTaskAttendanceExcel,
  listAttendance,
  listOfficeOptions,
  listUsers,
  updateFieldTask,
  type AttendanceRecord,
  type DayStatus,
  type OfficeOption,
  type UpdateFieldTaskInput,
  type UserRecord,
} from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import {
  formatDate,
  formatDateTime12,
  formatTime12,
  fromDateTimeLocalInput,
  startOfMonthIso,
  toDateTimeLocalInput,
  todayIsoDate,
} from '@/lib/datetime'
import { queryKeys, QUERY_STALE_TIME_FREQUENT } from '@/lib/query-client'
import { updateFieldTaskSchema, zodErrorMessage } from '@/lib/schemas'
import { notify } from '@/lib/toast'
import { useDialogState } from '@/lib/use-dialog-state'
import { usePageParam } from '@/lib/use-page-param'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DayPicker } from '@/components/ui/day-picker'
import { ExcelExportDialog } from '@/components/ui/excel-export-dialog'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  not_started: 'لم تبدأ',
  checked_in: 'جارية',
  completed: 'مكتملة',
}

type TaskRow = {
  id: string
  recordId: string
  userId?: number
  employeeName: string
  employeeCode?: string
  officeId?: number | null
  officeName?: string | null
  taskName: string
  notes?: string | null
  date?: string
  addressName?: string | null
  mapLink?: string | null
  lat?: number | null
  lng?: number | null
  endLat?: number | null
  endLng?: number | null
  startedAt?: string | null
  endedAt?: string | null
  workDurationMinutes?: number | null
  dayStatus?: DayStatus
}

type ModalMode =
  | null
  | { type: 'detail'; row: TaskRow }
  | { type: 'edit'; row: TaskRow; draft?: UpdateFieldTaskInput }
  | { type: 'confirm-edit'; row: TaskRow; payload: UpdateFieldTaskInput }
  | { type: 'close'; row: TaskRow }

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

function isTaskOpen(row: TaskRow): boolean {
  return !row.endedAt
}

const STATUS_PILL_TONES = {
  neutral:
    'inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold bg-neutral-100 text-neutral-600',
  success:
    'inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold bg-success-soft text-success',
  warning:
    'inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold bg-warning-soft text-warning',
  danger:
    'inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold bg-danger-soft text-red-700',
  info: 'inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold bg-info-soft text-info',
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

function resolveTaskStatus(row: TaskRow): {
  label: string
  tone: 'neutral' | 'success' | 'info'
} {
  if (row.endedAt) return { label: 'مكتملة', tone: 'success' }
  if (row.startedAt) return { label: 'جارية', tone: 'info' }
  if (row.dayStatus) {
    return {
      label: DAY_STATUS_LABELS[row.dayStatus],
      tone:
        row.dayStatus === 'completed' ? 'success' : row.dayStatus === 'checked_in' ? 'info' : 'neutral',
    }
  }
  return { label: 'لم تبدأ', tone: 'neutral' }
}

function buildTaskRows(
  records: AttendanceRecord[],
  usersById: Map<number, UserRecord>,
  officesById: Map<number, OfficeOption>,
): TaskRow[] {
  const rows: TaskRow[] = []

  for (const record of records) {
    const tasks =
      record.tasks && record.tasks.length > 0
        ? record.tasks
        : [
            {
              id: record.id,
              taskName: record.taskName,
              notes: record.notes,
              lat: record.lat,
              lng: record.lng,
              addressName: record.addressName,
              mapLink: record.mapLink,
              startedAt: record.startedAt ?? record.checkInAt,
              endedAt: record.endedAt ?? record.checkOutAt,
              workDurationMinutes: record.workDurationMinutes,
              userId: record.userId,
              officeId: record.officeId,
              office: record.office,
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
      const officeId = task.officeId ?? record.officeId ?? null
      const officeName =
        task.office?.name ||
        record.office?.name ||
        (officeId != null ? officesById.get(officeId)?.name : null) ||
        null

      rows.push({
        id: task.id || record.id,
        recordId: record.id,
        userId,
        employeeName,
        employeeCode,
        officeId,
        officeName,
        taskName: task.taskName || record.taskName || '—',
        notes: task.notes ?? record.notes,
        date: task.date ?? record.date,
        addressName: task.addressName ?? record.addressName,
        mapLink: task.mapLink ?? record.mapLink,
        lat: task.lat ?? record.lat,
        lng: task.lng ?? record.lng,
        endLat: task.endLat,
        endLng: task.endLng,
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
  const queryClient = useQueryClient()
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
  const [modal, setModal] = useState<ModalMode>(null)
  const [busy, setBusy] = useState(false)

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

  const offices = useMemo(() => officesQuery.data ?? [], [officesQuery.data])
  const allUsers = useMemo(() => usersDirectoryQuery.data?.data ?? [], [usersDirectoryQuery.data])

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
  const records = useMemo(() => tasksQuery.data?.data ?? [], [tasksQuery.data])
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

  const closeModal = () => {
    if (!busy) setModal(null)
  }

  const invalidateTasks = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all })
  }, [queryClient])

  const detailDialog = useDialogState(modal?.type === 'detail' ? modal.row : null)
  const editDialog = useDialogState(modal?.type === 'edit' ? modal : null)
  const confirmEditDialog = useDialogState(modal?.type === 'confirm-edit' ? modal : null)
  const closeDialog = useDialogState(modal?.type === 'close' ? modal.row : null)

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

  const runEdit = async (row: TaskRow, payload: UpdateFieldTaskInput) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ حفظ المهمة...')
    try {
      await updateFieldTask(token, row.id, payload)
      notify.dismiss(toastId)
      notify.success('تم تحديث المهمة')
      setModal(null)
      await invalidateTasks()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تحديث المهمة')
    } finally {
      setBusy(false)
    }
  }

  const runClose = async (
    row: TaskRow,
    input: { notes?: string; endTime?: string },
  ) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ إغلاق المهمة...')
    try {
      await endFieldTask(token, row.id, input)
      notify.dismiss(toastId)
      notify.success('تم إغلاق المهمة')
      setModal(null)
      await invalidateTasks()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر إغلاق المهمة')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="المهام الخارجية"
        subtitle="متابعة مهام الموظفين خارج المكتب، مع إمكانية التعديل والإغلاق من الإدارة"
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
            <SelectItem value="not_started">لم تبدأ</SelectItem>
            <SelectItem value="checked_in">جارية</SelectItem>
            <SelectItem value="completed">مكتملة</SelectItem>
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
              <Th className="min-w-[200px]">المهمة</Th>
              <Th>التاريخ</Th>
              <Th>البداية</Th>
              <Th>النهاية</Th>
              <Th>المدة</Th>
              <Th>الحالة</Th>
              <ThActions>إجراءات</ThActions>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <TableMessage colSpan={8}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل المهام...
              </TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={8}>لا توجد مهام خارجية</TableMessage>
            ) : (
              rows.map((row) => {
                const status = resolveTaskStatus(row)
                return (
                <Tr key={`${row.recordId}-${row.id}`}>
                  <Td className="min-w-[168px] max-w-[240px]">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="block truncate font-semibold text-foreground" title={row.employeeName}>
                        {row.employeeName}
                      </span>
                      {row.officeName ? (
                        <span className="truncate text-xs text-muted" title={row.officeName}>
                          {row.officeName}
                        </span>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="min-w-[200px] max-w-[320px]">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="block truncate font-medium leading-[1.35]" title={row.taskName}>
                        {row.taskName}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs text-muted" title={row.addressName || undefined}>
                          {row.addressName || 'بدون عنوان'}
                        </span>
                        {row.mapLink ? (
                          <a
                            href={row.mapLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-0.5 text-xs text-info no-underline hover:underline"
                          >
                            الخريطة <ExternalLink size={11} />
                          </a>
                        ) : null}
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(row.date)}</Td>
                  <Td className="whitespace-nowrap text-muted" title={formatDateTime(row.startedAt)}>
                    {formatTime12(row.startedAt)}
                  </Td>
                  <Td className="whitespace-nowrap text-muted" title={formatDateTime(row.endedAt)}>
                    {formatTime12(row.endedAt)}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-muted">
                    {formatDuration(row.workDurationMinutes)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </Td>
                  <TdActions>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label={`إجراءات ${row.taskName}`}
                          title="إجراءات"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-56">
                        <DropdownMenuLabel>
                          {row.employeeName}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setModal({ type: 'detail', row })}>
                          <Eye />
                          عرض التفاصيل
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setModal({ type: 'edit', row })}>
                          <Pencil />
                          تعديل
                        </DropdownMenuItem>
                        {isTaskOpen(row) ? (
                          <DropdownMenuItem onSelect={() => setModal({ type: 'close', row })}>
                            <CircleStop />
                            إغلاق المهمة
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TdActions>
                </Tr>
                )
              })
            )}
          </tbody>
        </Table>
      </TableSection>

      <Dialog open={detailDialog.open} onOpenChange={(open) => !open && closeModal()}>
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
                <DetailRow label="الموظف">
                  {detailDialog.data.employeeName}
                  {detailDialog.data.employeeCode ? ` · ${detailDialog.data.employeeCode}` : ''}
                </DetailRow>
                <DetailRow label="المهمة">{detailDialog.data.taskName}</DetailRow>
                <DetailRow label="المكتب">{detailDialog.data.officeName || '—'}</DetailRow>
                <DetailRow label="التاريخ">{formatDate(detailDialog.data.date)}</DetailRow>
                <DetailRow label="الموقع">{detailDialog.data.addressName || '—'}</DetailRow>
                <DetailRow label="الإحداثيات">
                  {detailDialog.data.lat != null && detailDialog.data.lng != null
                    ? `${detailDialog.data.lat}, ${detailDialog.data.lng}`
                    : '—'}
                </DetailRow>
                <DetailRow label="البداية">{formatDateTime(detailDialog.data.startedAt)}</DetailRow>
                <DetailRow label="النهاية">{formatDateTime(detailDialog.data.endedAt)}</DetailRow>
                <DetailRow label="المدة">{formatDuration(detailDialog.data.workDurationMinutes)}</DetailRow>
                {detailDialog.data.notes ? (
                  <DetailRow label="ملاحظات">{detailDialog.data.notes}</DetailRow>
                ) : null}
                {detailDialog.data.mapLink && (
                  <a
                    href={detailDialog.data.mapLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-fit cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-3.5 text-sm font-semibold text-foreground transition-[background,border-color,opacity] hover:enabled:bg-hover disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
                  >
                    <ExternalLink />
                    فتح الخريطة
                  </a>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {detailDialog.data ? (
              <>
                <Button type="button" onClick={closeModal} variant="secondary">
                  إغلاق
                </Button>
                <Button
                  type="button"
                  onClick={() => setModal({ type: 'edit', row: detailDialog.data! })}
                  variant="primary"
                >
                  <Pencil />
                  تعديل
                </Button>
              </>
            ) : (
              <Button type="button" onClick={closeModal} variant="secondary">
                إغلاق
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent size="lg">
          {editDialog.data ? (
            <TaskEditForm
              key={`${editDialog.data.row.id}-${editDialog.data.draft ? 'draft' : 'initial'}`}
              row={editDialog.data.row}
              draft={editDialog.data.draft}
              offices={offices}
              busy={busy}
              onClose={closeModal}
              onSubmit={(payload) =>
                setModal({ type: 'confirm-edit', row: editDialog.data!.row, payload })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmEditDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          {confirmEditDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد تعديل المهمة</DialogTitle>
                <DialogDescription>
                  سيتم حفظ تعديلات مهمة {confirmEditDialog.data.row.taskName} للموظف{' '}
                  {confirmEditDialog.data.row.employeeName}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmEditDialog.data
                    if (!data) return
                    setModal({ type: 'edit', row: data.row, draft: data.payload })
                  }}
                  variant="secondary"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmEditDialog.data
                    if (!data) return
                    void runEdit(data.row, data.payload)
                  }}
                  variant="primary"
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Pencil />}
                  تأكيد الحفظ
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          {closeDialog.data ? (
            <TaskCloseForm
              row={closeDialog.data}
              busy={busy}
              onClose={closeModal}
              onSubmit={(input) => void runClose(closeDialog.data!, input)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-2">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="break-words text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

function TaskEditForm({
  row,
  draft,
  offices,
  busy,
  onClose,
  onSubmit,
}: {
  row: TaskRow
  draft?: UpdateFieldTaskInput
  offices: OfficeOption[]
  busy: boolean
  onClose: () => void
  onSubmit: (payload: UpdateFieldTaskInput) => void
}) {
  const [taskName, setTaskName] = useState(
    draft?.taskName ?? (row.taskName === '—' ? '' : row.taskName),
  )
  const [notes, setNotes] = useState((draft?.notes ?? (draft ? '' : row.notes)) || '')
  const [date, setDate] = useState(draft?.date ?? row.date?.slice(0, 10) ?? todayIsoDate())
  const [selectedOfficeId, setSelectedOfficeId] = useState(
    draft?.officeId != null
      ? String(draft.officeId)
      : draft && draft.officeId === null
        ? 'none'
        : row.officeId != null
          ? String(row.officeId)
          : 'none',
  )
  const [addressName, setAddressName] = useState(
    (draft?.addressName ?? (draft ? '' : row.addressName)) || '',
  )
  const [mapLink, setMapLink] = useState((draft?.mapLink ?? (draft ? '' : row.mapLink)) || '')
  const [startTime, setStartTime] = useState(
    draft?.startTime ? toDateTimeLocalInput(draft.startTime) : toDateTimeLocalInput(row.startedAt),
  )
  const [endTime, setEndTime] = useState(
    draft?.endTime ? toDateTimeLocalInput(draft.endTime) : toDateTimeLocalInput(row.endedAt),
  )
  const [reopen, setReopen] = useState(draft ? draft.endTime === null : false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const payload: UpdateFieldTaskInput = {
      taskName: taskName.trim(),
      notes: notes.trim() || null,
      date,
      officeId: selectedOfficeId === 'none' ? null : Number(selectedOfficeId),
      addressName: addressName.trim() || null,
      mapLink: mapLink.trim() || null,
    }

    const startIso = fromDateTimeLocalInput(startTime)
    if (startIso) payload.startTime = startIso

    if (reopen) {
      payload.endTime = null
    } else {
      const endIso = fromDateTimeLocalInput(endTime)
      if (endIso) payload.endTime = endIso
    }

    const parsed = updateFieldTaskSchema.safeParse(payload)
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setFormError(msg)
      notify.error(msg)
      return
    }
    if (!parsed.data.taskName) {
      const msg = 'اسم المهمة مطلوب.'
      setFormError(msg)
      notify.error(msg)
      return
    }
    onSubmit(parsed.data)
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>تعديل المهمة</DialogTitle>
        <DialogDescription>
          تعديل بيانات مهمة {row.employeeName}
          {row.employeeCode ? ` · ${row.employeeCode}` : ''}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
        <label className="col-span-full flex flex-col gap-1.5 text-[13px] text-muted">
          <span>اسم المهمة *</span>
          <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>التاريخ</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>المكتب</span>
          <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
            <SelectTrigger className="w-full" aria-label="المكتب">
              <SelectValue placeholder="بدون مكتب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مكتب</SelectItem>
              {offices.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>وقت البداية</span>
          <Input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>وقت النهاية</span>
          <Input
            type="datetime-local"
            value={endTime}
            disabled={reopen}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>

        {row.endedAt ? (
          <label className="col-span-full flex flex-row items-center gap-2.5 text-[13px] text-muted">
            <Checkbox
              checked={reopen}
              onCheckedChange={(checked) => setReopen(checked === true)}
              id="task-reopen"
            />
            <span>إعادة فتح المهمة (إلغاء وقت النهاية)</span>
          </label>
        ) : null}

        <label className="col-span-full flex flex-col gap-1.5 text-[13px] text-muted">
          <span>العنوان</span>
          <Input
            value={addressName}
            onChange={(e) => setAddressName(e.target.value)}
            placeholder="اختياري"
          />
        </label>

        <label className="col-span-full flex flex-col gap-1.5 text-[13px] text-muted">
          <span>رابط الخريطة</span>
          <Input
            value={mapLink}
            onChange={(e) => setMapLink(e.target.value)}
            placeholder="https://maps.google.com/..."
            dir="ltr"
          />
        </label>

        <label className="col-span-full flex flex-col gap-1.5 text-[13px] text-muted">
          <span>ملاحظات</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="اختياري"
            rows={3}
            maxLength={1000}
            className="min-h-[84px] w-full resize-y rounded-[10px] border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] disabled:cursor-not-allowed disabled:opacity-55"
          />
        </label>

        {formError && <p className="col-span-full m-0 text-[13px] font-semibold text-red-700">{formError}</p>}
      </DialogBody>

      <DialogFooter>
        <Button type="button" disabled={busy} onClick={onClose} variant="secondary">
          إلغاء
        </Button>
        <Button type="submit" disabled={busy} variant="primary">
          {busy ? <Loader2 className="animate-spin" /> : <Pencil />}
          حفظ
        </Button>
      </DialogFooter>
    </form>
  )
}

function TaskCloseForm({
  row,
  busy,
  onClose,
  onSubmit,
}: {
  row: TaskRow
  busy: boolean
  onClose: () => void
  onSubmit: (input: { notes?: string; endTime?: string }) => void
}) {
  const [notes, setNotes] = useState('')
  const [endTime, setEndTime] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const endIso = fromDateTimeLocalInput(endTime)
    onSubmit({
      notes: notes.trim() || undefined,
      endTime: endIso,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>إغلاق المهمة</DialogTitle>
        <DialogDescription>
          سيتم إنهاء مهمة {row.taskName} للموظف {row.employeeName}. يمكن ترك الوقت فارغاً لاستخدام الوقت الحالي.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>وقت النهاية (اختياري)</span>
          <Input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>ملاحظات (اختياري)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="سبب الإغلاق أو ملاحظة للإدارة"
            rows={3}
            maxLength={1000}
            className="min-h-[84px] w-full resize-y rounded-[10px] border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] disabled:cursor-not-allowed disabled:opacity-55"
          />
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" disabled={busy} onClick={onClose} variant="secondary">
          إلغاء
        </Button>
        <Button type="submit" disabled={busy} variant="primary">
          {busy ? <Loader2 className="animate-spin" /> : <CircleStop />}
          تأكيد الإغلاق
        </Button>
      </DialogFooter>
    </form>
  )
}

export default TasksPage
