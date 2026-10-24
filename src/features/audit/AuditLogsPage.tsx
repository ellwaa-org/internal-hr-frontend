import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale } from 'date-fns/locale'
import {
  listAuditLogs,
  listUsers,
  type AuditAction,
  type AuditActorType,
  type AuditLog,
} from '@/lib/api'
import { auditActions, auditActorTypes } from '@/lib/schemas'
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
  restore: 'استعادة',
  activate: 'تفعيل',
  deactivate: 'إيقاف',
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  assign: 'تعيين',
  unassign: 'إلغاء تعيين',
}

const ACTION_BADGE_CLASSES: Record<AuditAction, string> = {
  create: 'bg-success-soft text-success',
  update: 'bg-info-soft text-info',
  delete: 'bg-danger-soft text-danger',
  restore: 'bg-purple-50 text-purple-700',
  activate: 'bg-success-soft text-success',
  deactivate: 'bg-orange-50 text-orange-700',
  login: 'bg-neutral-100 text-neutral-600',
  logout: 'bg-neutral-100 text-neutral-600',
  assign: 'bg-teal-50 text-teal-700',
  unassign: 'bg-teal-50 text-teal-700',
}

/** Unknown action values (added server-side later) render raw with a neutral badge. */
const NEUTRAL_BADGE = 'bg-neutral-100 text-neutral-600'

function actionBadgeClass(action: string): string {
  return ACTION_BADGE_CLASSES[action as AuditAction] ?? NEUTRAL_BADGE
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action as AuditAction] ?? action
}

const ACTOR_TYPE_LABELS: Record<AuditActorType, string> = {
  user: 'مستخدم',
  client: 'عميل',
  system: 'النظام',
}

/**
 * Arabic labels for known backend `entityType` keys (the filter values).
 * The stored keys are not normalized (e.g. "user" but "roles"), so unknown
 * keys fall back to the raw value.
 */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: 'المستخدمون',
  users: 'المستخدمون',
  profile: 'الملف الشخصي',
  role: 'الأدوار',
  roles: 'الأدوار',
  department: 'الإدارات',
  departments: 'الإدارات',
  office: 'المكاتب',
  offices: 'المكاتب',
  attendance: 'الحضور والانصراف',
  food_order: 'طلبات الوجبات',
  custom_request: 'الطلبات المخصصة',
  security_log: 'سجلات الأمان',
  audit_log: 'سجل التغييرات',
}

function entityTypeLabel(value: string): string {
  return ENTITY_TYPE_LABELS[value] ?? value
}

const LIMIT_OPTIONS = [10, 20, 50, 100]
const DEFAULT_LIMIT = 20
const COLUMN_COUNT = 8

/** Relative Arabic time ("منذ ٥ دقائق"); the absolute value rides in a tooltip. */
function relativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return formatDistanceToNow(date, { addSuffix: true, locale: arLocale })
  } catch {
    return formatDateTime12(iso)
  }
}

/** Compact display for an arbitrary `from`/`to` JSON value. */
function changeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

interface DiffRow {
  field: string
  from: unknown
  to: unknown
}

/**
 * Normalizes both `changes` conventions to per-field rows:
 *  - spec: { changes: { field: { from, to } } } — already a diff
 *  - live: { before, after } snapshots — diff computed client-side
 */
function diffRowsOf(log: AuditLog): DiffRow[] {
  const changes = log.changes
  if (!changes) return []
  if (changes.changes && Object.keys(changes.changes).length > 0) {
    return Object.entries(changes.changes).map(([field, pair]) => ({
      field,
      from: pair?.from,
      to: pair?.to,
    }))
  }
  const { before, after } = changes
  if (before && after) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return keys
      .filter((key) => !jsonEqual(before[key], after[key]))
      .map((field) => ({ field, from: before[field], to: after[field] }))
  }
  return []
}

function SnapshotJson({ title, snapshot }: { title: string; snapshot: Record<string, unknown> }) {
  return (
    <details className="min-w-0 rounded-[10px] border border-border bg-[#fafafa] px-3 py-2">
      <summary className="cursor-pointer text-[13px] font-semibold text-foreground">{title}</summary>
      <pre
        dir="ltr"
        className="mt-2 max-h-[280px] overflow-auto rounded-lg bg-white p-2.5 font-mono text-[11px] leading-relaxed text-foreground"
      >
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </details>
  )
}

/** `changes` rows: diffs render as a table; snapshots as collapsible JSON. */
function ChangesDetails({ log }: { log: AuditLog }) {
  const changes = log.changes
  const rows = diffRowsOf(log)
  const { before, after, entity } = changes ?? {}

  if (!changes) {
    return <p className="m-0 text-sm text-muted">لا توجد تفاصيل تغييرات لهذا السجل.</p>
  }

  const isFlatMetadata =
    rows.length === 0 &&
    !before &&
    !after &&
    !entity &&
    Object.values(changes).every((value) => value === null || typeof value !== 'object')

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {changes.self && (
        <span className="inline-flex w-fit items-center rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
          عملية ذاتية — قام المستخدم بنفسه
        </span>
      )}
      {rows.length > 0 ? (
        <div className="min-w-0 overflow-x-auto" dir="rtl">
          <table className="w-full min-w-[360px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="border-b border-border bg-[#f7f7f8] px-3 py-2 text-start text-xs font-semibold text-muted">
                  الحقل
                </th>
                <th className="border-b border-border bg-[#f7f7f8] px-3 py-2 text-start text-xs font-semibold text-muted">
                  من
                </th>
                <th className="border-b border-border bg-[#f7f7f8] px-3 py-2 text-start text-xs font-semibold text-muted">
                  إلى
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ field, from, to }) => (
                <tr key={field}>
                  <td className="border-b border-border px-3 py-2 font-mono text-xs text-foreground" dir="ltr">
                    {field}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-muted" dir="auto">
                    {changeValue(from)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-foreground" dir="auto">
                    {changeValue(to)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {after && Object.keys(after).length > 0 ? (
        <SnapshotJson title={before ? 'البيانات بعد التعديل (JSON)' : 'لقطة البيانات (JSON)'} snapshot={after} />
      ) : null}
      {before && Object.keys(before).length > 0 ? (
        <SnapshotJson title="البيانات قبل التعديل (JSON)" snapshot={before} />
      ) : null}
      {entity && Object.keys(entity).length > 0 ? (
        <SnapshotJson title="لقطة البيانات (JSON)" snapshot={entity} />
      ) : null}
      {isFlatMetadata && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[10px] border border-border bg-[#fafafa] px-3 py-2 text-[13px]">
          {Object.entries(changes)
            .filter(([key]) => key !== 'self')
            .map(([key, value]) => (
              <span key={key} className="text-muted">
                {key}:{' '}
                <span className="font-semibold text-foreground" dir="auto">
                  {changeValue(value)}
                </span>
              </span>
            ))}
        </div>
      )}
      {!isFlatMetadata && rows.length === 0 && !before && !after && !entity && (
        <pre
          dir="ltr"
          className="m-0 max-h-[280px] overflow-auto rounded-[10px] border border-border bg-[#fafafa] p-2.5 font-mono text-[11px] leading-relaxed text-foreground"
        >
          {JSON.stringify(changes, null, 2)}
        </pre>
      )}
    </div>
  )
}

/* ---------- URL ⇄ filter state ---------- */

type FilterState = {
  action: AuditAction | 'all'
  module: string
  actorType: AuditActorType | 'all'
  actorId: string
  startDate: string
  endDate: string
  sortOrder: 'asc' | 'desc'
}

const emptyFilters = (): FilterState => ({
  action: 'all',
  module: 'all',
  actorType: 'all',
  actorId: '',
  startDate: '',
  endDate: '',
  sortOrder: 'desc',
})

/** Filters live in the URL (`?action=update&actorType=user&…`) so views are shareable. */
function filtersFromParams(params: URLSearchParams): FilterState {
  const action = params.get('action')
  const actorType = params.get('actorType')
  const sortOrder = params.get('sortOrder')
  const actorId = params.get('actor')
  return {
    action: auditActions.includes(action as AuditAction) ? (action as AuditAction) : 'all',
    module: params.get('module') ?? 'all',
    actorType: auditActorTypes.includes(actorType as AuditActorType)
      ? (actorType as AuditActorType)
      : 'all',
    actorId: actorId && /^\d+$/.test(actorId) ? actorId : '',
    startDate: params.get('startDate') ?? '',
    endDate: params.get('endDate') ?? '',
    sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
  }
}

function sameFilters(a: FilterState, b: FilterState): boolean {
  return (
    a.action === b.action &&
    a.module === b.module &&
    a.actorType === b.actorType &&
    a.actorId === b.actorId &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.sortOrder === b.sortOrder
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

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
    if (filters.actorType !== 'all') params.set('actorType', filters.actorType)
    if (/^\d+$/.test(filters.actorId)) params.set('actor', filters.actorId)
    if (filters.startDate) params.set('startDate', filters.startDate)
    if (filters.endDate) params.set('endDate', filters.endDate)
    if (filters.sortOrder !== 'desc') params.set('sortOrder', filters.sortOrder)
    if (keepLimit) params.set('limit', keepLimit)
    // page is intentionally dropped — applying filters restarts from page 1.
    setSearchParams(params)
    setExpanded(new Set())
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
    setExpanded(new Set())
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
      actorType: committed.actorType === 'all' ? undefined : committed.actorType,
      actorId: committed.actorId ? Number(committed.actorId) : undefined,
      startDate: committed.startDate || undefined,
      endDate: committed.endDate || undefined,
      sortOrder: committed.sortOrder,
    }),
    [page, limit, committed],
  )

  const logsQuery = useQuery({
    queryKey: queryKeys.auditLogs.list(queryParams),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    queryFn: () => listAuditLogs(token, queryParams),
  })

  // The backend's entityType keys aren't normalized ("user" but "roles"), so
  // the module filter is derived from what actually appears in recent rows.
  const moduleOptionsQuery = useQuery({
    queryKey: queryKeys.auditLogs.modules(),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    queryFn: () => listAuditLogs(token, { page: 1, limit: 500 }),
  })
  const moduleOptions = useMemo(() => {
    const types = new Set<string>()
    for (const row of moduleOptionsQuery.data?.data ?? []) {
      if (row.target?.type) types.add(row.target.type)
    }
    if (committed.module !== 'all') types.add(committed.module)
    return [...types].sort().map((value) => ({ value, label: entityTypeLabel(value) }))
  }, [moduleOptionsQuery.data, committed.module])

  // Options for the actor picker; users without user.readAll get a numeric input
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
      handleApiError(logsQuery.error, 'تعذر تحميل سجل النشاط')
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
  const selectedUserLabel = committed.actorId
    ? (userOptions.find((option) => option.value === committed.actorId)?.label ??
      `مستخدم #${committed.actorId}`)
    : undefined

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="سجل النشاط"
        subtitle="كل ما جرى في النظام: من نفّذه، ومتى، وعلى أي عنصر."
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
              {moduleOptions.map((module) => (
                <SelectItem key={module.value} value={module.value}>
                  {module.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={draft.actorType}
            onValueChange={(value) => setDraftField('actorType', value as FilterState['actorType'])}
          >
            <SelectTrigger className="min-w-[130px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="نوع المنفّذ">
              <SelectValue placeholder="نوع المنفّذ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              {auditActorTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {ACTOR_TYPE_LABELS[type]}
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
              placeholder="رقم المنفّذ (ID)"
              value={draft.actorId}
              onChange={(e) => setDraftField('actorId', e.target.value)}
              aria-label="رقم المنفّذ"
            />
          ) : (
            <div className="flex items-center gap-1.5 max-[720px]:w-full">
              <SearchableSelect
                className="min-w-[210px] max-[720px]:w-full max-[720px]:min-w-0"
                value={draft.actorId || undefined}
                onValueChange={(value) => setDraftField('actorId', value)}
                aria-label="المنفّذ"
                placeholder={selectedUserLabel ?? 'كل المنفّذين'}
                searchPlaceholder="بحث بالاسم أو الكود..."
                emptyText="لا يوجد مستخدم مطابق"
                options={userOptions}
              />
              {draft.actorId ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-10 shrink-0 p-0"
                  onClick={() => setDraftField('actorId', '')}
                  aria-label="مسح فلتر المنفّذ"
                  title="مسح فلتر المنفّذ"
                >
                  <X />
                </Button>
              ) : null}
            </div>
          )}

          <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] text-muted max-[720px]:w-full">
            <span className="shrink-0">من</span>
            <input
              type="date"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
              value={draft.startDate}
              max={draft.endDate || undefined}
              onChange={(e) => setDraftField('startDate', e.target.value)}
              aria-label="من تاريخ"
            />
          </label>

          <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-white px-3 text-[13px] text-muted max-[720px]:w-full">
            <span className="shrink-0">إلى</span>
            <input
              type="date"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
              value={draft.endDate}
              min={draft.startDate || undefined}
              onChange={(e) => setDraftField('endDate', e.target.value)}
              aria-label="إلى تاريخ"
            />
          </label>

          <Select
            value={draft.sortOrder}
            onValueChange={(value) => setDraftField('sortOrder', value as FilterState['sortOrder'])}
          >
            <SelectTrigger className="min-w-[140px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="الترتيب">
              <SelectValue placeholder="الترتيب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">الأحدث أولاً</SelectItem>
              <SelectItem value="asc">الأقدم أولاً</SelectItem>
            </SelectContent>
          </Select>

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
                  notify.success('تم تحديث سجل النشاط')
                } catch (err) {
                  notify.dismiss(toastId)
                  handleApiError(err, 'تعذر تحديث سجل النشاط')
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
              <Th className="w-[1%]" aria-label="تفاصيل" />
              <Th>الوقت</Th>
              <Th>الإجراء</Th>
              <Th>المنفّذ</Th>
              <Th>الوحدة</Th>
              <Th>العنصر</Th>
              <Th>التغييرات</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <TableMessage colSpan={COLUMN_COUNT}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل سجل النشاط...
              </TableMessage>
            ) : logsQuery.isError ? (
              <TableMessage colSpan={COLUMN_COUNT}>
                {forbidden ? (
                  'لا تملك صلاحية عرض سجل النشاط.'
                ) : (
                  <span className="inline-flex flex-wrap items-center justify-center gap-2">
                    تعذر تحميل سجل النشاط.
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
                {hasActiveFilters ? 'لا توجد عمليات مطابقة للفلاتر الحالية' : 'لا يوجد نشاط مسجل بعد'}
              </TableMessage>
            ) : (
              logs.map((log) => {
                const isOpen = expanded.has(log.id)
                const diffCount = diffRowsOf(log).length
                const hasSnapshot = Boolean(
                  log.changes?.entity || log.changes?.before || log.changes?.after,
                )
                const hasChanges = Boolean(log.changes)
                return (
                  <Fragment key={log.id}>
                    <Tr>
                      <Td className="w-[1%] ps-3">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(log.id)}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 text-muted transition-colors hover:bg-hover hover:text-foreground"
                          aria-label={isOpen ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronLeft className="h-4 w-4" />
                          )}
                        </button>
                      </Td>
                      <Td className="whitespace-nowrap text-muted" title={formatDateTime12(log.createdAt)}>
                        {relativeTime(log.createdAt)}
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
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-semibold text-foreground">
                            {log.actor?.name ?? 'غير معروف'}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                            {log.actor?.role ? <span>{roleLabel(log.actor.role)}</span> : null}
                            {log.actor && (
                              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                                {ACTOR_TYPE_LABELS[log.actor.type]}
                              </span>
                            )}
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{log.module || '—'}</Td>
                      <Td>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-semibold text-foreground">
                            {log.target?.label || '—'}
                          </span>
                          {log.target?.subtitle && (
                            <span className="truncate text-xs text-muted" title={log.target.subtitle}>
                              {log.target.subtitle}
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        {hasChanges ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(log.id)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-hover"
                          >
                            {diffCount > 0
                              ? `${diffCount} حقل معدّل`
                              : hasSnapshot
                                ? 'لقطة بيانات'
                                : 'تفاصيل'}
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {log.changes?.self && (
                          <span className="ms-1.5 inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                            ذاتي
                          </span>
                        )}
                      </Td>
                      <Td>
                        {log.ipAddress ? (
                          <span dir="ltr" className="font-mono text-xs text-muted">
                            {log.ipAddress}
                          </span>
                        ) : (
                          '—'
                        )}
                      </Td>
                    </Tr>
                    {isOpen && (
                      <tr className="bg-[#fcfcfc]">
                        <Td colSpan={COLUMN_COUNT} className="px-4 py-4">
                          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5 max-[720px]:grid-cols-1">
                            <ChangesDetails log={log} />
                            <div className="flex min-w-0 flex-col gap-2.5 text-[13px]">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                                معلومات الطلب
                              </span>
                              <div className="flex flex-col gap-1 text-muted">
                                <span>
                                  المنفّذ:{' '}
                                  <span className="font-semibold text-foreground">
                                    {log.actor?.name ?? 'غير معروف'}
                                    {log.actor?.id != null ? ` (#${log.actor.id})` : ''}
                                  </span>
                                </span>
                                {log.target?.id && (
                                  <span dir="auto">
                                    معرّف العنصر:{' '}
                                    <span dir="ltr" className="font-mono text-foreground">
                                      {log.target.id}
                                    </span>
                                    {log.target.type ? ` · ${log.target.type}` : ''}
                                  </span>
                                )}
                                <span dir="auto">
                                  العنوان IP:{' '}
                                  <span dir="ltr" className="font-mono text-foreground">
                                    {log.ipAddress || '—'}
                                  </span>
                                </span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-muted">وكيل المستخدم (User Agent):</span>
                                <p
                                  dir="ltr"
                                  className="m-0 mt-1 max-h-[120px] overflow-auto break-all rounded-lg border border-border bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted"
                                >
                                  {log.userAgent || '—'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </Td>
                      </tr>
                    )}
                  </Fragment>
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
