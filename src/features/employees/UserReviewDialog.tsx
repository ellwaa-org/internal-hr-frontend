import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, TriangleAlert, X } from 'lucide-react'
import {
  getUserAttendance,
  reviewAbsenceDays,
  reviewAbsenceStreak,
  reviewEarlyLeaveJustification,
  reviewLateJustification,
  type AttendanceRecord,
} from '@/lib/api'
import { isForbiddenError, isUnauthorizedError } from '@/lib/errors'
import { formatDate, formatTime12, todayIsoDate } from '@/lib/datetime'
import { queryKeys, QUERY_STALE_TIME_FREQUENT } from '@/lib/query-client'
import { notify } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ReviewStatus = 'pending' | 'approved' | 'rejected'

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'مقبول',
  rejected: 'مرفوض',
}

const STATUS_TONE: Record<ReviewStatus, string> = {
  pending: 'bg-neutral-100 text-foreground',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-red-700',
}

function StatusPill({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Accept (✓) / refuse (✗) pair shared by all review rows. */
function ReviewButtons({
  disabled,
  onApprove,
  onReject,
}: {
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="h-7 w-7 p-0"
        disabled={disabled}
        onClick={onApprove}
        aria-label="قبول"
        title="قبول"
      >
        {disabled ? <Loader2 className="animate-spin" /> : <Check />}
      </Button>
      <Button
        type="button"
        variant="danger"
        size="sm"
        className="h-7 w-7 p-0"
        disabled={disabled}
        onClick={onReject}
        aria-label="رفض"
        title="رفض"
      >
        {disabled ? <Loader2 className="animate-spin" /> : <X />}
      </Button>
    </span>
  )
}

/** Minimal user shape the dialog needs — satisfied by both UserRecord and
 *  the attendance page's calendar users. */
export type ReviewDialogUser = {
  id: number
  fullName: string
  employeeCode?: string
  consecutiveAbsenceDays?: number
  absentSevenConsecutiveDays?: boolean
  absenceReviewStatus?: 'pending' | 'approved' | 'rejected' | null
  absentDaysThisMonth?: string[]
  absentDayReviews?: Record<
    string,
    { status: 'pending' | 'approved' | 'rejected'; note: string | null; reviewedAt?: string | null }
  >
}

/**
 * Per-user review dialog: accept/refuse the employee's absent days,
 * late-arrival justifications and early-leave justifications.
 */
export function UserReviewDialog({
  open,
  onOpenChange,
  token,
  user,
  onUnauthorized,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  user: ReviewDialogUser | null
  onUnauthorized: () => void
}) {
  const queryClient = useQueryClient()
  const today = todayIsoDate()
  const monthStart = `${today.slice(0, 7)}-01`
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [absentReviews, setAbsentReviews] = useState(user?.absentDayReviews ?? {})

  useEffect(() => {
    setAbsentReviews(user?.absentDayReviews ?? {})
  }, [user])

  // Current-month office attendance → pending late / early-leave requests.
  const attendanceQuery = useQuery({
    queryKey: queryKeys.attendance.user(user?.id ?? 0, {
      page: 1,
      limit: 100,
      from: monthStart,
      to: today,
      type: 'office',
    }),
    enabled: open && Boolean(user),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    queryFn: () =>
      getUserAttendance(token!, user!.id, {
        from: monthStart,
        to: today,
        type: 'office',
        page: 1,
        limit: 100,
      }),
  })

  useEffect(() => {
    if (!attendanceQuery.error) return
    if (isUnauthorizedError(attendanceQuery.error)) {
      notify.error(attendanceQuery.error, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
      onUnauthorized()
      return
    }
    if (!isForbiddenError(attendanceQuery.error)) {
      notify.error(attendanceQuery.error, 'تعذر تحميل سجلات الحضور')
    }
  }, [attendanceQuery.error, onUnauthorized])

  const pendingRecords = useMemo(() => {
    const undecided = (status?: string | null) =>
      status !== 'approved' && status !== 'rejected'
    return (attendanceQuery.data?.data ?? []).filter(
      (record) =>
        (record.isLate && undecided(record.lateJustificationStatus)) ||
        (record.isEarlyLeave && undecided(record.earlyLeaveJustificationStatus)),
    )
  }, [attendanceQuery.data])

  const absentDays = useMemo(() => {
    if (user?.absentDaysThisMonth?.length) return user.absentDaysThisMonth
    // Fallback (e.g. opened from the attendance page): derive absent work
    // days from the fetched records — days of the month with no check-in.
    const present = new Set(
      (attendanceQuery.data?.data ?? [])
        .filter((r) => r.checkInAt)
        .map((r) => (r.date ?? '').slice(0, 10)),
    )
    const out: string[] = []
    const [y, m] = monthStart.split('-').map(Number)
    const cursor = new Date(y, m - 1, 1)
    for (;;) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      if (iso > today) break
      const dow = cursor.getDay() // 5 = Fri, 6 = Sat → weekend
      if (iso < today && dow !== 5 && dow !== 6 && !present.has(iso)) out.push(iso)
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }, [user, attendanceQuery.data, monthStart, today])

  /** Longest run of consecutive absent work days (weekends don't break it). */
  const streakDays = useMemo(() => {
    const nextWorkday = (iso: string): string => {
      const [y, m, d] = iso.split('-').map(Number)
      const cur = new Date(y, m - 1, d)
      do {
        cur.setDate(cur.getDate() + 1)
      } while (cur.getDay() === 5 || cur.getDay() === 6)
      return `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    }
    let best = 0
    let run = 0
    for (let i = 0; i < absentDays.length; i++) {
      run = i > 0 && nextWorkday(absentDays[i - 1]) === absentDays[i] ? run + 1 : 1
      if (run > best) best = run
    }
    return best
  }, [absentDays])

  const hasStreak =
    streakDays >= 7 || Boolean(user?.absentSevenConsecutiveDays)
  const [streakDecision, setStreakDecision] = useState<'approved' | 'rejected' | null>(null)
  const streakStatus = streakDecision ?? user?.absenceReviewStatus ?? 'pending'

  const pendingAbsent = absentDays.filter((d) => {
    const status = absentReviews[d]?.status
    return status !== 'approved' && status !== 'rejected'
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all })
    await queryClient.invalidateQueries({ queryKey: queryKeys.securityLogs.all }).catch(() => undefined)
  }

  const handleApiError = (err: unknown, fallback: string) => {
    if (isForbiddenError(err)) return
    if (isUnauthorizedError(err)) {
      notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
      onUnauthorized()
      return
    }
    notify.error(err, fallback)
  }

  const runWithBusy = async (key: string, action: () => Promise<unknown>, doneMessage: string) => {
    setBusyKey(key)
    const toastId = notify.loading('جارٍ الحفظ...')
    try {
      await action()
      notify.dismiss(toastId)
      notify.success(doneMessage)
      await refresh()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تحديث المراجعة')
    } finally {
      setBusyKey(null)
    }
  }

  const reviewAbsent = async (dates: string[] | undefined, next: 'approved' | 'rejected') => {
    if (!user) return
    const key = `absent-${next}-${dates?.length ?? 'all'}`
    setBusyKey(key)
    const toastId = notify.loading(next === 'approved' ? 'جارٍ القبول...' : 'جارٍ الرفض...')
    try {
      await reviewAbsenceDays(token, user.id, next, dates ? { dates } : undefined)
      notify.dismiss(toastId)
      notify.success(next === 'approved' ? 'تم قبول الغياب' : 'تم رفض الغياب')
      const targets = dates ?? pendingAbsent
      setAbsentReviews((current) => {
        const copy = { ...current }
        for (const date of targets) copy[date] = { status: next, note: null, reviewedAt: null }
        return copy
      })
      await refresh()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تحديث الغياب')
    } finally {
      setBusyKey(null)
    }
  }

  const reviewStreak = (next: 'approved' | 'rejected') => {
    if (!user) return
    void runWithBusy(
      `streak-${next}`,
      async () => {
        await reviewAbsenceStreak(token, user.id, next)
        setStreakDecision(next)
      },
      next === 'approved' ? 'تم قبول الغياب المتواصل' : 'تم رفض الغياب المتواصل',
    )
  }

  const reviewRecord = async (
    record: AttendanceRecord,
    kind: 'late' | 'early',
    next: 'approved' | 'rejected',
  ) => {
    const key = `${record.id}-${kind}-${next}`
    setBusyKey(key)
    const toastId = notify.loading(next === 'approved' ? 'جارٍ القبول...' : 'جارٍ الرفض...')
    try {
      if (kind === 'late') {
        await reviewLateJustification(token, record.id, next)
      } else {
        await reviewEarlyLeaveJustification(token, record.id, next)
      }
      notify.dismiss(toastId)
      notify.success(next === 'approved' ? 'تم القبول' : 'تم الرفض')
      await refresh()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تحديث التبرير')
    } finally {
      setBusyKey(null)
    }
  }

  const nothingToReview =
    absentDays.length === 0 && pendingRecords.length === 0 && !attendanceQuery.isLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {user ? (
          <>
            <DialogHeader>
              <DialogTitle>مراجعة {user.fullName}</DialogTitle>
              <DialogDescription>
                قبول أو رفض أيام الغياب وتبريرات التأخير والانصراف المبكر للشهر الحالي
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {attendanceQuery.isLoading ? (
                <p className="m-0 flex items-center justify-center gap-2 py-6 text-muted">
                  <Loader2 className="animate-spin" /> جارٍ التحميل...
                </p>
              ) : nothingToReview ? (
                <p className="m-0 py-6 text-center text-muted">
                  لا توجد أيام غياب أو تبريرات في انتظار المراجعة لهذا الشهر.
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {/* ---- 7-day consecutive absence banner ---- */}
                  {hasStreak ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-danger-soft px-3 py-2">
                      <span className="flex items-center gap-2 text-[13px] font-bold text-red-700">
                        <TriangleAlert className="h-4 w-4 shrink-0" />
                        غائب {streakDays} يومًا متتاليًا هذا الشهر
                      </span>
                      {streakStatus === 'pending' ? (
                        <ReviewButtons
                          disabled={busyKey !== null}
                          onApprove={() => reviewStreak('approved')}
                          onReject={() => reviewStreak('rejected')}
                        />
                      ) : (
                        <StatusPill status={streakStatus} />
                      )}
                    </div>
                  ) : null}

                  {/* ---- Absent days ---- */}
                  {absentDays.length > 0 ? (
                    <section>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="m-0 text-sm font-bold text-foreground">
                          أيام الغياب
                          <span className="ms-1 font-medium text-muted">({absentDays.length})</span>
                        </h3>
                        {pendingAbsent.length > 0 ? (
                          <span className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={busyKey !== null}
                              onClick={() => reviewAbsent(undefined, 'approved')}
                            >
                              قبول الكل
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={busyKey !== null}
                              onClick={() => reviewAbsent(undefined, 'rejected')}
                            >
                              رفض الكل
                            </Button>
                          </span>
                        ) : null}
                      </div>
                      <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-auto p-0">
                        {absentDays.map((date) => {
                          const status = absentReviews[date]?.status ?? 'pending'
                          return (
                            <li
                              key={date}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5"
                            >
                              <span className="flex items-center gap-2 text-[12px] text-foreground">
                                {formatDate(date)}
                                <StatusPill status={status} />
                              </span>
                              {status === 'pending' ? (
                                <ReviewButtons
                                  disabled={busyKey !== null}
                                  onApprove={() => reviewAbsent([date], 'approved')}
                                  onReject={() => reviewAbsent([date], 'rejected')}
                                />
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ) : null}

                  {/* ---- Late / early-leave justifications ---- */}
                  {pendingRecords.length > 0 ? (
                    <section>
                      <h3 className="m-0 mb-2 text-sm font-bold text-foreground">
                        التأخير والانصراف المبكر
                        <span className="ms-1 font-medium text-muted">({pendingRecords.length})</span>
                      </h3>
                      <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-auto p-0">
                        {pendingRecords.map((record) => (
                          <li
                            key={record.id}
                            className="flex flex-col gap-1 rounded-lg border border-border px-2.5 py-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-foreground">
                                {record.date ? formatDate(record.date.slice(0, 10)) : null}
                                {record.isLate ? (
                                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                                    تأخير {formatTime12(record.checkInAt)}
                                  </span>
                                ) : null}
                                {record.isEarlyLeave ? (
                                  <span className="rounded-full bg-[#f3e8ff] px-2 py-0.5 text-[11px] font-semibold text-[#7e22ce]">
                                    انصراف مبكر {formatTime12(record.checkOutAt)}
                                  </span>
                                ) : null}
                              </span>
                              <span className="flex items-center gap-1.5">
                                {record.isLate && record.lateJustificationStatus !== 'approved' && record.lateJustificationStatus !== 'rejected' ? (
                                  <ReviewButtons
                                    disabled={busyKey !== null}
                                    onApprove={() => reviewRecord(record, 'late', 'approved')}
                                    onReject={() => reviewRecord(record, 'late', 'rejected')}
                                  />
                                ) : null}
                                {record.isEarlyLeave && record.earlyLeaveJustificationStatus !== 'approved' && record.earlyLeaveJustificationStatus !== 'rejected' ? (
                                  <ReviewButtons
                                    disabled={busyKey !== null}
                                    onApprove={() => reviewRecord(record, 'early', 'approved')}
                                    onReject={() => reviewRecord(record, 'early', 'rejected')}
                                  />
                                ) : null}
                              </span>
                            </div>
                            {record.lateReason ? (
                              <p className="m-0 text-[12px] text-muted">
                                تبرير التأخير: <span className="text-foreground">{record.lateReason}</span>
                              </p>
                            ) : record.isLate ? (
                              <p className="m-0 text-[12px] text-muted">لم يقدّم الموظف تبريرًا للتأخير.</p>
                            ) : null}
                            {record.earlyLeaveReason ? (
                              <p className="m-0 text-[12px] text-muted">
                                تبرير الانصراف: <span className="text-foreground">{record.earlyLeaveReason}</span>
                              </p>
                            ) : record.isEarlyLeave ? (
                              <p className="m-0 text-[12px] text-muted">لم يقدّم الموظف تبريرًا للانصراف المبكر.</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              )}
            </DialogBody>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default UserReviewDialog
