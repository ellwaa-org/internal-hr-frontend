import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, RefreshCw, X } from 'lucide-react'
import {
  listAttendance,
  listOfficeOptions,
  reviewEarlyLeaveJustification,
  reviewLateJustification,
  type AttendanceRecord,
  type DayStatus,
  type OfficeOption,
} from './lib/api'
import { isUnauthorizedError } from './lib/errors'
import { queryKeys, QUERY_STALE_TIME } from './lib/query-client'
import { notify } from './lib/toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select'
import './Employees.css'

const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  not_started: 'لم يبدأ',
  checked_in: 'تم الحضور',
  completed: 'مكتمل',
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ar-EG', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

function AttendancePage({
  token,
  onUnauthorized,
}: {
  token: string
  onUnauthorized: () => void
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [dayStatus, setDayStatus] = useState<'all' | DayStatus>('all')
  const [officeId, setOfficeId] = useState<'all' | string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [offices, setOffices] = useState<OfficeOption[]>([])

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

  const listParams = useMemo(
    () => ({
      page,
      limit,
      from,
      to,
      dayStatus,
      officeId,
    }),
    [page, limit, from, to, dayStatus, officeId],
  )

  const attendanceQuery = useQuery({
    queryKey: queryKeys.attendance.list(listParams),
    staleTime: QUERY_STALE_TIME,
    queryFn: () =>
      listAttendance(token, {
        page,
        limit,
        from: from || undefined,
        to: to || undefined,
        dayStatus: dayStatus === 'all' ? undefined : dayStatus,
        officeId: officeId === 'all' ? undefined : Number(officeId),
      }),
  })

  useEffect(() => {
    if (attendanceQuery.error) {
      handleApiError(attendanceQuery.error, 'تعذر تحميل سجلات الحضور')
    }
  }, [attendanceQuery.error, handleApiError])

  useEffect(() => {
    let cancelled = false
    listOfficeOptions(token, { limit: 100 })
      .then((items) => {
        if (!cancelled) setOffices(items)
      })
      .catch(() => {
        // optional filter helper
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const records = attendanceQuery.data?.data ?? []
  const total = attendanceQuery.data?.total ?? 0
  const totalPages = Math.max(1, attendanceQuery.data?.totalPages ?? 1)
  const loading = attendanceQuery.isLoading || attendanceQuery.isFetching

  const pageLabel = useMemo(() => {
    if (total === 0) return 'لا توجد نتائج'
    const fromIdx = (page - 1) * limit + 1
    const toIdx = Math.min(page * limit, total)
    return `${fromIdx}–${toIdx} من ${total}`
  }, [page, limit, total])

  const review = async (
    record: AttendanceRecord,
    kind: 'late' | 'early',
    status: 'approved' | 'rejected',
  ) => {
    setBusyId(`${record.id}-${kind}-${status}`)
    const toastId = notify.loading(
      status === 'approved' ? 'جارٍ الموافقة...' : 'جارٍ الرفض...',
    )
    try {
      if (kind === 'late') {
        await reviewLateJustification(token, record.id, status)
      } else {
        await reviewEarlyLeaveJustification(token, record.id, status)
      }
      notify.dismiss(toastId)
      notify.success(status === 'approved' ? 'تمت الموافقة' : 'تم الرفض')
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

  return (
    <div className="employees-page">
      <div className="employees-toolbar">
        <div className="employees-toolbar-text">
          <h1 className="employees-title">الحضور والانصراف</h1>
          <p className="employees-subtitle">مراجعة السجلات والموافقات على التأخير والانصراف المبكر</p>
        </div>
      </div>

      <div className="employees-filters">
        <label className="form-field" style={{ margin: 0, minWidth: 140 }}>
          <span style={{ display: 'none' }}>من</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1)
              setFrom(e.target.value)
            }}
            aria-label="من تاريخ"
            style={{
              height: 40,
              padding: '0 12px',
              border: '1px solid var(--border)',
              borderRadius: 10,
              font: 'inherit',
              fontSize: 14,
            }}
          />
        </label>
        <label className="form-field" style={{ margin: 0, minWidth: 140 }}>
          <span style={{ display: 'none' }}>إلى</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1)
              setTo(e.target.value)
            }}
            aria-label="إلى تاريخ"
            style={{
              height: 40,
              padding: '0 12px',
              border: '1px solid var(--border)',
              borderRadius: 10,
              font: 'inherit',
              fontSize: 14,
            }}
          />
        </label>

        <Select
          value={dayStatus}
          onValueChange={(value) => {
            setPage(1)
            setDayStatus(value as 'all' | DayStatus)
          }}
        >
          <SelectTrigger className="employees-select-trigger" aria-label="حالة اليوم">
            <SelectValue placeholder="حالة اليوم" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="not_started">لم يبدأ</SelectItem>
            <SelectItem value="checked_in">تم الحضور</SelectItem>
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
          <SelectTrigger className="employees-select-trigger" aria-label="المكتب">
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

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void attendanceQuery.refetch()}
          aria-label="تحديث"
        >
          <RefreshCw />
        </button>
      </div>

      <div className="employees-table-wrap">
        <table className="employees-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>التاريخ</th>
              <th>الحضور</th>
              <th>الانصراف</th>
              <th>الحالة</th>
              <th>تبرير التأخير</th>
              <th>تبرير الانصراف المبكر</th>
              <th className="col-actions">مراجعة</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={8} className="employees-empty">
                  <Loader2 className="spin" />
                  جارٍ تحميل السجلات...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={8} className="employees-empty">
                  لا توجد سجلات حضور
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id}>
                  <td>
                    <div className="employee-name-cell">
                      <span className="employee-name">
                        {record.user?.fullName ?? `موظف #${record.userId ?? '—'}`}
                      </span>
                      {record.office?.name && (
                        <span className="employee-dept">{record.office.name}</span>
                      )}
                    </div>
                  </td>
                  <td>{record.date ?? '—'}</td>
                  <td>{formatDateTime(record.checkInAt)}</td>
                  <td>{formatDateTime(record.checkOutAt)}</td>
                  <td>
                    {record.dayStatus ? DAY_STATUS_LABELS[record.dayStatus] : '—'}
                    {record.isLate ? ' · متأخر' : ''}
                    {record.isEarlyLeave ? ' · انصراف مبكر' : ''}
                  </td>
                  <td>
                    <div className="employee-name-cell">
                      <span>{record.lateReason || '—'}</span>
                      {record.lateJustificationStatus && (
                        <span className="employee-dept">{record.lateJustificationStatus}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="employee-name-cell">
                      <span>{record.earlyLeaveReason || '—'}</span>
                      {record.earlyLeaveJustificationStatus && (
                        <span className="employee-dept">
                          {record.earlyLeaveJustificationStatus}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="col-actions">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {needsLateReview(record) && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId !== null}
                            onClick={() => void review(record, 'late', 'approved')}
                            title="موافقة على التأخير"
                          >
                            {busyId === `${record.id}-late-approved` ? (
                              <Loader2 className="spin" />
                            ) : (
                              <Check />
                            )}
                            تأخير
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyId !== null}
                            onClick={() => void review(record, 'late', 'rejected')}
                            title="رفض التأخير"
                          >
                            {busyId === `${record.id}-late-rejected` ? (
                              <Loader2 className="spin" />
                            ) : (
                              <X />
                            )}
                          </button>
                        </div>
                      )}
                      {needsEarlyReview(record) && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId !== null}
                            onClick={() => void review(record, 'early', 'approved')}
                            title="موافقة على الانصراف المبكر"
                          >
                            {busyId === `${record.id}-early-approved` ? (
                              <Loader2 className="spin" />
                            ) : (
                              <Check />
                            )}
                            مبكر
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyId !== null}
                            onClick={() => void review(record, 'early', 'rejected')}
                            title="رفض الانصراف المبكر"
                          >
                            {busyId === `${record.id}-early-rejected` ? (
                              <Loader2 className="spin" />
                            ) : (
                              <X />
                            )}
                          </button>
                        </div>
                      )}
                      {!needsLateReview(record) && !needsEarlyReview(record) && '—'}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="employees-pagination">
        <span className="pagination-info">{pageLabel}</span>
        <div className="pagination-btns">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            السابق
          </button>
          <span className="pagination-page">
            صفحة {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </button>
        </div>
      </div>
    </div>
  )
}

export default AttendancePage
