import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import {
  listAuditLogs,
  listUsers,
  type AuditAction,
} from '@/lib/api'
import { auditActions } from '@/lib/schemas'
import { isForbiddenError, isUnauthorizedError } from '@/lib/errors'
import { queryKeys, QUERY_STALE_TIME_DEFAULT } from '@/lib/query-client'
import { hasPermission, roleLabel } from '@/lib/permissions'
import { notify } from '@/lib/toast'
import { formatDateTime12 } from '@/lib/datetime'
import { usePageParam } from '@/lib/use-page-param'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FiltersBar,
  PageHeader,
  PageShell,
  PaginationBar,
  SearchField,
} from '@/components/ui/page'
import { Table, TableMessage, TableSection, Td, Th, Tr } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'

/* ---------- display maps ---------- */

const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  assign: 'تعيين',
  unassign: 'إلغاء تعيين',
}

const ACTION_BADGE_CLASSES: Record<AuditAction, string> = {
  create: 'bg-success-soft text-success',
  update: 'bg-info-soft text-info',
  delete: 'bg-danger-soft text-danger',
  assign: 'bg-purple-50 text-purple-700',
  unassign: 'bg-orange-50 text-orange-700',
}

/** Unknown action values (added server-side later) render raw with a neutral badge. */
const NEUTRAL_BADGE = 'bg-neutral-100 text-neutral-600'

function actionBadgeClass(action: string): string {
  return ACTION_BADGE_CLASSES[action as AuditAction] ?? NEUTRAL_BADGE
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action as AuditAction] ?? action
}

/** Module values mirror the backend route prefixes (first path segment). */
const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: 'auth', label: 'الحسابات والدخول' },
  { value: 'employees', label: 'الموظفون' },
  { value: 'department', label: 'الإدارات' },
  { value: 'office', label: 'المكاتب' },
  { value: 'attendance', label: 'الحضور والانصراف' },
  { value: 'food', label: 'الوجبات' },
  { value: 'custom-requests', label: 'الطلبات المخصصة' },
  { value: 'roles', label: 'الأدوار والصلاحيات' },
  { value: 'tickets', label: 'التذاكر' },
  { value: 'security-logs', label: 'سجلات الأمان' },
]

const LIMIT_OPTIONS = [10, 20, 50, 100]
const DEFAULT_LIMIT = 20
const COLUMN_COUNT = 7

/* ---------- URL ⇄ filter state ---------- */

type FilterState = {
  action: AuditAction | 'all'
  module: string
  userId: string
  route: string
  from: string
  to: string
}

const emptyFilters = (): FilterState => ({
  action: 'all',
  module: 'all',
  userId: '',
  route: '',
  from: '',
  to: '',
})

/** Filters live in the URL (`?action=update&user=3&…`) so views are shareable. */
function filtersFromParams(params: URLSearchParams): FilterState {
  const action = params.get('action')
  const userId = params.get('user')
  return {
    action: auditActions.includes(action as AuditAction) ? (action as AuditAction) : 'all',
    module: params.get('module') ?? 'all',
    userId: userId && /^\d+$/.test(userId) ? userId : '',
    route: params.get('route') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
}

function sameFilters(a: FilterState, b: FilterState): boolean {
  return (
    a.action === b.action &&
    a.module === b.module &&
    a.userId === b.userId &&
    a.route.trim() === b.route.trim() &&
    a.from === b.from &&
    a.to === b.to
  )
}

function parseLimitParam(value: string | null): number {
  const n = Number(value)
  return LIMIT_OPTIONS.includes(n) ? n : DEFAULT_LIMIT
}

/* ---------- page ---------- */

function AuditLogsPage({
  token,
  permissions,
  onUnauthorized,
}: {
  token: string
  permissions: string[]
  onUnauthorized: () => void
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = usePageParam()
  const limit = parseLimitParam(searchParams.get('limit'))

  // Committed filters come from the URL; the bar edits a draft until "تطبيق".
  const committed = useMemo(() => filtersFromParams(searchParams), [searchParams])
  const [draft, setDraft] = useState<FilterState>(() => filtersFromParams(searchParams))

  // Keep the bar in sync with external URL changes (back/forward, share links)
  // by adjusting state during render instead of inside an effect.
  const [syncedParams, setSyncedParams] = useState(searchParams)
  if (syncedParams !== searchParams) {
    setSyncedParams(searchParams)
    setDraft(filtersFromParams(searchParams))
  }

  const setDraftField = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const writeFilterParams = (filters: FilterState, keepLimit: string | null) => {
    const params = new URLSearchParams()
    if (filters.action !== 'all') params.set('action', filters.action)
    if (filters.module !== 'all') params.set('module', filters.module)
    if (/^\d+$/.test(filters.userId)) params.set('user', filters.userId)
    const route = filters.route.trim()
    if (route) params.set('route', route)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    if (keepLimit) params.set('limit', keepLimit)
    // page is intentionally dropped — applying filters restarts from page 1.
    setSearchParams(params)
  }

  const applyFilters = () => {
    writeFilterParams(draft, searchParams.get('limit'))
  }

  const resetFilters = () => {
    const next = emptyFilters()
    setDraft(next)
    writeFilterParams(next, searchParams.get('limit'))
  }

  const changeLimit = (next: number) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next === DEFAULT_LIMIT) params.delete('limit')
      else params.set('limit', String(next))
      params.delete('page')
      return params
    })
  }

  const hasActiveFilters = !sameFilters(committed, emptyFilters())

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      // 403 = missing permission: already toasted globally, session stays alive.
      if (isForbiddenError(err)) return
      if (isUnauthorizedError(err)) {
        notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
        onUnauthorized()
        return
      }
      notify.error(err, fallback)
    },
    [onUnauthorized],
  )

  const queryParams = useMemo(
    () => ({
      page,
      limit,
      action: committed.action === 'all' ? undefined : committed.action,
      module: committed.module === 'all' ? undefined : committed.module,
      userId: committed.userId ? Number(committed.userId) : undefined,
      route: committed.route.trim() || undefined,
      from: committed.from || undefined,
      to: committed.to || undefined,
    }),
    [page, limit, committed],
  )

  const logsQuery = useQuery({
    queryKey: queryKeys.auditLogs.list(queryParams),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
    queryFn: () => listAuditLogs(token, queryParams),
  })

  // Options for the user picker; users without user.readAll get a numeric input
  // instead (a picker query would only produce a guaranteed 403).
  const canListUsers = hasPermission(permissions, 'user.readAll')
  const usersQuery = useQuery({
    queryKey: [...queryKeys.users.all, 'for-audit-filter'],
    staleTime: QUERY_STALE_TIME_DEFAULT,
    enabled: canListUsers,
    queryFn: () => listUsers(token, { page: 1, limit: 100 }),
  })
  const useUserPicker = canListUsers && !usersQuery.isError

  useEffect(() => {
    if (logsQuery.error) {
      handleApiError(logsQuery.error, 'تعذر تحميل سجل التغييرات')
    }
  }, [logsQuery.error, handleApiError])

  const logs = logsQuery.data?.data ?? []
  const total = logsQuery.data?.total ?? 0
  const totalPages = Math.max(1, logsQuery.data?.totalPages ?? 1)
  const loading = logsQuery.isLoading || (logsQuery.isFetching && logs.length === 0)
  const forbidden = logsQuery.error != null && isForbiddenError(logsQuery.error)

  const pageLabel = useMemo(() => {
    if (total === 0) return 'لا توجد نتائج'
    const from = (page - 1) * limit + 1
    const to = Math.min(page * limit, total)
    return `${from}–${to} من ${total}`
  }, [page, limit, total])

  const userOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? []).map((user) => ({
        value: String(user.id),
        label: `${user.fullName} (${user.employeeCode})`,
        keywords: `${user.fullName} ${user.employeeCode}`,
      })),
    [usersQuery.data],
  )
  const selectedUserLabel = committed.userId
    ? (userOptions.find((option) => option.value === committed.userId)?.label ??
      `مستخدم #${committed.userId}`)
    : undefined

  return (
    <PageShell>
      <PageHeader
        title="سجل التغييرات"
        subtitle="كل عملية عدّلت البيانات في النظام: من نفّذها، ومتى، وأين."
      />

      <form
        onSubmit={(event) => {
          event.preventDefault()
          applyFilters()
        }}
      >
        <FiltersBar>
          <Select
            value={draft.action}
            onValueChange={(value) => setDraftField('action', value as FilterState['action'])}
          >
            <SelectTrigger className="min-w-[140px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="الإجراء">
              <SelectValue placeholder="الإجراء" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {auditActions.map((action) => (
                <SelectItem key={action} value={action}>
                  {ACTION_LABELS[action]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={draft.module} onValueChange={(value) => setDraftField('module', value)}>
            <SelectTrigger className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="الوحدة">
              <SelectValue placeholder="الوحدة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الوحدات</SelectItem>
              {MODULE_OPTIONS.map((module) => (
                <SelectItem key={module.value} value={module.value}>
                  {module.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!useUserPicker ? (
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              className="w-[150px] max-[720px]:w-full"
              placeholder="رقم المستخدم (ID)"
              value={draft.userId}
              onChange={(e) => setDraftField('userId', e.target.value)}
              aria-label="رقم المستخدم"
            />
          ) : (
            <div className="flex items-center gap-1.5 max-[720px]:w-full">
              <SearchableSelect
                className="min-w-[210px] max-[720px]:w-full max-[720px]:min-w-0"
                value={draft.userId || undefined}
                onValueChange={(value) => setDraftField('userId', value)}
                aria-label="المستخدم"
                placeholder={selectedUserLabel ?? 'كل المستخدمين'}
                searchPlaceholder="بحث بالاسم أو الكود..."
                emptyText="لا يوجد مستخدم مطابق"
                options={userOptions}
              />
              {draft.userId ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-10 shrink-0 p-0"
                  onClick={() => setDraftField('userId', '')}
                  aria-label="مسح فلتر المستخدم"
                  title="مسح فلتر المستخدم"
                >
                  <X />
                </Button>
              ) : null}
            </div>
          )}

          <SearchField
            className="max-[720px]:w-full"
            dir="ltr"
            value={draft.route}
            placeholder="بحث في المسار (مثال: office)..."
            onChange={(e) => setDraftField('route', e.target.value)}
            aria-label="المسار"
          />

          <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] text-muted max-[720px]:w-full">
            <span className="shrink-0">من</span>
            <input
              type="date"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => setDraftField('from', e.target.value)}
              aria-label="من تاريخ"
            />
          </label>

          <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] text-muted max-[720px]:w-full">
            <span className="shrink-0">إلى</span>
            <input
              type="date"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => setDraftField('to', e.target.value)}
              aria-label="إلى تاريخ"
            />
          </label>

          <Button
            type="submit"
            variant="primary"
            fullOnMobile
            disabled={sameFilters(draft, committed)}
          >
            تطبيق
          </Button>

          <Button
            type="button"
            variant="secondary"
            fullOnMobile
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            <RotateCcw />
            إعادة تعيين
          </Button>

          <Button
            type="button"
            variant="secondary"
            className="w-10 p-0"
            disabled={logsQuery.isFetching}
            onClick={() => {
              void (async () => {
                const toastId = notify.loading('جارٍ تحديث السجل...')
                try {
                  await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs.all })
                  await logsQuery.refetch()
                  notify.dismiss(toastId)
                  notify.success('تم تحديث سجل التغييرات')
                } catch (err) {
                  notify.dismiss(toastId)
                  handleApiError(err, 'تعذر تحديث سجل التغييرات')
                }
              })()
            }}
            aria-label="تحديث"
            title="تحديث"
          >
            {logsQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </FiltersBar>
      </form>

      <TableSection
        footer={
          <div className="flex flex-wrap items-center gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
            <div className="min-w-[260px] flex-1">
              <PaginationBar
                info={pageLabel}
                page={page}
                totalPages={totalPages}
                disabled={loading}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            </div>
            <Select value={String(limit)} onValueChange={(value) => changeLimit(Number(value))}>
              <SelectTrigger
                className="h-9 w-[120px] max-[720px]:w-full"
                aria-label="عدد النتائج في الصفحة"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} / صفحة
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>الوقت</Th>
              <Th>المنفّذ</Th>
              <Th>الإجراء</Th>
              <Th>الوحدة</Th>
              <Th>المسار</Th>
              <Th>العنصر</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <TableMessage colSpan={COLUMN_COUNT}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل سجل التغييرات...
              </TableMessage>
            ) : logsQuery.isError ? (
              <TableMessage colSpan={COLUMN_COUNT}>
                {forbidden ? (
                  'لا تملك صلاحية عرض سجل التغييرات.'
                ) : (
                  <span className="inline-flex flex-wrap items-center justify-center gap-2">
                    تعذر تحميل سجل التغييرات.
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void logsQuery.refetch()}
                    >
                      إعادة المحاولة
                    </Button>
                  </span>
                )}
              </TableMessage>
            ) : logs.length === 0 ? (
              <TableMessage colSpan={COLUMN_COUNT}>
                {hasActiveFilters
                  ? 'لا توجد عمليات مطابقة للفلاتر الحالية'
                  : 'لا توجد عمليات مسجلة بعد'}
              </TableMessage>
            ) : (
              logs.map((log) => {
                const actorCode = log.actor?.employeeCode ?? log.employeeCode
                const actorRole = log.actor?.role
                return (
                  <Tr key={log.id}>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime12(log.createdAt)}</Td>
                    <Td>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold text-foreground">
                          {log.fullName ??
                            (log.actor
                              ? (actorCode ?? (log.userId != null ? `مستخدم #${log.userId}` : 'غير معروف'))
                              : 'النظام / غير معروف')}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {log.fullName && actorCode ? <span dir="ltr">{actorCode}</span> : null}
                          {actorRole ? (
                            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                              {roleLabel(actorRole)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                          actionBadgeClass(log.action),
                        )}
                      >
                        {actionLabel(log.action)}
                      </span>
                    </Td>
                    <Td>
                      <span
                        dir="ltr"
                        className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700"
                      >
                        {log.module}
                      </span>
                    </Td>
                    <Td>
                      <code
                        dir="ltr"
                        className="break-all font-mono text-[11px] leading-relaxed text-muted"
                      >
                        {log.route}
                      </code>
                    </Td>
                    <Td className="text-muted">
                      {log.entityId ? (
                        <span dir="ltr" className="font-mono text-xs">
                          #{log.entityId}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      {log.ip ? (
                        <span dir="ltr" className="font-mono text-xs text-muted">
                          {log.ip}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
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

export default AuditLogsPage
