import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react'
import {
  getUserAttendanceSecurityLogs,
  getUserDeviceSecurityLogs,
  type OfficeOption,
  type SecurityLogAttempt,
  type UserRecord,
} from '@/lib/api'
import { formatDateTime12 } from '@/lib/datetime'
import { isUnauthorizedError } from '@/lib/errors'
import { queryKeys } from '@/lib/query-client'
import { notify } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type SecurityTab = 'devices' | 'attendance'

const ACTION_LABELS: Record<string, string> = {
  'check-in': 'حضور',
  checkin: 'حضور',
  check_in: 'حضور',
  checkIn: 'حضور',
  'check-out': 'انصراف',
  checkout: 'انصراف',
  check_out: 'انصراف',
  checkOut: 'انصراف',
}

const TYPE_LABELS: Record<string, string> = {
  geofence: 'الموقع',
  geo: 'الموقع',
  location: 'الموقع',
  ssid: 'الشبكة',
  wifi: 'الشبكة',
}

function labelOf(map: Record<string, string>, value?: string | null): string | null {
  if (!value) return null
  return map[value] ?? map[value.toLowerCase()] ?? value
}

function mapsUrl(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function formatCoord(value?: number | null): string {
  if (value == null) return '—'
  return value.toFixed(5)
}

function MetaRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-end font-medium text-foreground">{children}</span>
    </div>
  )
}

function LtrCode({ children }: { children: ReactNode }) {
  return (
    <code dir="ltr" className="break-all font-mono text-xs text-foreground">
      {children}
    </code>
  )
}

function AttemptCard({
  attempt,
  variant,
  officeName,
}: {
  attempt: SecurityLogAttempt
  variant: SecurityTab
  officeName?: string | null
}) {
  const isSsid = /ssid|wifi/i.test(attempt.type ?? '')
  const typeLabel = labelOf(TYPE_LABELS, attempt.type)
  const actionLabel = labelOf(ACTION_LABELS, attempt.action)
  const locationUrl = mapsUrl(attempt.lat, attempt.lng)
  const Icon = variant === 'devices' ? Smartphone : isSsid ? Wifi : MapPin

  return (
    <article className="rounded-xl border border-border bg-white p-3.5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            isSsid ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="m-0 text-sm font-semibold text-foreground">
              {variant === 'devices'
                ? 'محاولة دخول من جهاز آخر'
                : typeLabel
                  ? `مخالفة ${typeLabel}`
                  : 'مخالفة حضور'}
            </p>
            {actionLabel ? (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                {actionLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 m-0 text-xs text-muted">{formatDateTime12(attempt.time)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5">
        {variant === 'devices' ? (
          <MetaRow label="الجهاز">
            <LtrCode>{attempt.device || '—'}</LtrCode>
          </MetaRow>
        ) : null}
        {attempt.ip ? (
          <MetaRow label="عنوان IP">
            <LtrCode>{attempt.ip}</LtrCode>
          </MetaRow>
        ) : null}
        {variant === 'attendance' && officeName ? (
          <MetaRow label="المكتب">{officeName}</MetaRow>
        ) : null}
        {variant === 'attendance' && attempt.ssid ? (
          <MetaRow label="الشبكة">
            <LtrCode>{attempt.ssid}</LtrCode>
          </MetaRow>
        ) : null}
        {variant === 'attendance' && (attempt.lat != null || attempt.lng != null) ? (
          <MetaRow label="الموقع">
            {locationUrl ? (
              <a
                href={locationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-info hover:underline"
              >
                <LtrCode>
                  {formatCoord(attempt.lat)}, {formatCoord(attempt.lng)}
                </LtrCode>
              </a>
            ) : (
              <LtrCode>
                {formatCoord(attempt.lat)}, {formatCoord(attempt.lng)}
              </LtrCode>
            )}
          </MetaRow>
        ) : null}
        {attempt.reason ? <MetaRow label="السبب">{attempt.reason}</MetaRow> : null}
      </div>
    </article>
  )
}

function EmptyState({ tab }: { tab: SecurityTab }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-neutral-50 px-4 py-10 text-center">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <p className="m-0 text-sm font-semibold text-foreground">
        {tab === 'devices' ? 'لا توجد محاولات دخول من جهاز آخر' : 'لا توجد مخالفات حضور'}
      </p>
      <p className="m-0 text-xs text-muted">
        {tab === 'devices'
          ? 'لم يُسجَّل دخول من جهاز غير مربوط لهذا الموظف.'
          : 'لم تُسجَّل مخالفات موقع أو شبكة لهذا الموظف.'}
      </p>
    </div>
  )
}

export function SecurityLogsDialog({
  token,
  user,
  offices,
  onClose,
  onUnauthorized,
}: {
  token: string
  user: UserRecord
  offices: OfficeOption[]
  onClose: () => void
  onUnauthorized: () => void
}) {
  const [tab, setTab] = useState<SecurityTab>('devices')
  const officesById = useMemo(
    () => new Map(offices.map((office) => [office.id, office.name])),
    [offices],
  )

  const fallback = {
    id: user.id,
    fullName: user.fullName,
    employeeCode: user.employeeCode,
    deviceId: user.deviceId,
  }

  const devicesQuery = useQuery({
    queryKey: queryKeys.securityLogs.devices(user.id),
    queryFn: () => getUserDeviceSecurityLogs(token, fallback),
  })

  const attendanceQuery = useQuery({
    queryKey: queryKeys.securityLogs.attendance(user.id),
    queryFn: () => getUserAttendanceSecurityLogs(token, fallback),
  })

  useEffect(() => {
    const err = devicesQuery.error ?? attendanceQuery.error
    if (!err || !isUnauthorizedError(err)) return
    notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
    onUnauthorized()
  }, [devicesQuery.error, attendanceQuery.error, onUnauthorized])

  const activeQuery = tab === 'devices' ? devicesQuery : attendanceQuery
  const attempts = activeQuery.data?.attempts ?? []
  const bindingDevice = devicesQuery.data?.bindingDevice ?? user.deviceId
  const deviceCount = devicesQuery.data?.attempts.length ?? 0
  const attendanceCount = attendanceQuery.data?.attempts.length ?? 0

  const handleQueryError = (err: unknown) => {
    if (isUnauthorizedError(err)) {
      notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
      onUnauthorized()
      return
    }
    notify.error(err, 'تعذر تحديث السجلات')
  }

  const refresh = () => {
    void (async () => {
      const toastId = notify.loading('جارٍ تحديث السجلات...')
      const [devices, attendance] = await Promise.all([
        devicesQuery.refetch(),
        attendanceQuery.refetch(),
      ])
      notify.dismiss(toastId)
      const err = devices.error ?? attendance.error
      if (err) {
        handleQueryError(err)
        return
      }
      notify.success('تم تحديث سجلات الأمان')
    })()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-danger" />
          سجلات الأمان
        </DialogTitle>
        <DialogDescription>
          {user.fullName} • {user.employeeCode}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="نوع السجل">
          {(
            [
              { id: 'devices', label: 'الجهاز', count: deviceCount },
              { id: 'attendance', label: 'الحضور', count: attendanceCount },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors',
                tab === item.id
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted hover:text-foreground',
              )}
            >
              {item.label}
              <span
                className={cn(
                  'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                  item.count > 0 ? 'bg-danger-soft text-danger' : 'bg-neutral-200 text-neutral-500',
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        {tab === 'devices' ? (
          <div className="rounded-xl border border-border bg-neutral-50 px-3.5 py-3">
            <p className="m-0 text-xs font-semibold text-muted">الجهاز المربوط</p>
            <p className="mt-1 mb-0">
              {bindingDevice ? (
                <LtrCode>{bindingDevice}</LtrCode>
              ) : (
                <span className="text-sm text-muted">لا يوجد جهاز مربوط</span>
              )}
            </p>
          </div>
        ) : (
          <p className="m-0 text-xs text-muted">
            محاولات الحضور أو الانصراف من خارج النطاق الجغرافي أو على شبكة غير مسموحة.
          </p>
        )}

        {activeQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ تحميل السجلات...
          </div>
        ) : activeQuery.isError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-danger-soft bg-danger-soft px-4 py-8 text-center">
            <p className="m-0 text-sm font-semibold text-red-700">تعذر تحميل هذا السجل</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void activeQuery.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : attempts.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="flex flex-col gap-2.5">
            {attempts.map((attempt, index) => (
              <AttemptCard
                key={`${attempt.time ?? 't'}-${attempt.device ?? 'd'}-${index}`}
                attempt={attempt}
                variant={tab}
                officeName={
                  attempt.officeId != null ? officesById.get(attempt.officeId) ?? `مكتب #${attempt.officeId}` : null
                }
              />
            ))}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={refresh}
          disabled={devicesQuery.isFetching || attendanceQuery.isFetching}
        >
          {devicesQuery.isFetching || attendanceQuery.isFetching ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
          تحديث
        </Button>
        <Button type="button" variant="primary" onClick={onClose}>
          إغلاق
        </Button>
      </DialogFooter>
    </>
  )
}
