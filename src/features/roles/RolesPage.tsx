import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { listCentralRoles } from '@/lib/api'
import { isForbiddenError, isUnauthorizedError } from '@/lib/errors'
import { queryKeys, QUERY_STALE_TIME_DEFAULT } from '@/lib/query-client'
import { formatDate } from '@/lib/datetime'
import { notify } from '@/lib/toast'
import { usePageParam } from '@/lib/use-page-param'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  FiltersBar,
  PageHeader,
  PageShell,
  PaginationBar,
  SearchField,
} from '@/components/ui/page'
import { Table, TableMessage, TableSection, Td, Th, Tr } from '@/components/ui/table'

// Read-only view: role/permission management lives in the central account manager.
// The HR backend only exposes GET /roles, GET /roles/:id and GET /roles/permissions.
function RolesPage({
  token,
  onUnauthorized,
}: {
  token: string
  permissions: string[]
  onUnauthorized: () => void
}) {
  const [page, setPage] = usePageParam()
  const [limit] = useState(10)
  const [search, setSearch] = useState('')

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

  const listParams = useMemo(
    () => ({ page, limit, search: search.trim() }),
    [page, limit, search],
  )

  const rolesQuery = useQuery({
    queryKey: queryKeys.roles.list(listParams),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    queryFn: () =>
      listCentralRoles(token, {
        page,
        limit,
        search: search.trim() || undefined,
      }),
  })

  useEffect(() => {
    if (rolesQuery.error) {
      handleApiError(rolesQuery.error, 'تعذر تحميل قائمة الأدوار')
    }
  }, [rolesQuery.error, handleApiError])

  const roles = rolesQuery.data?.data ?? []
  const total = rolesQuery.data?.total ?? 0
  const totalPages = Math.max(1, rolesQuery.data?.totalPages ?? 1)
  const loading = rolesQuery.isLoading || (rolesQuery.isFetching && roles.length === 0)

  const pageLabel = useMemo(() => {
    if (total === 0) return 'لا توجد نتائج'
    const from = (page - 1) * limit + 1
    const to = Math.min(page * limit, total)
    return `${from}–${to} من ${total}`
  }, [page, limit, total])

  return (
    <PageShell>
      <PageHeader
        title="الأدوار والصلاحيات"
        subtitle="عرض الأدوار وصلاحياتها والمستخدمين المرتبطين بكل دور — الأدوار تُدار من مدير الحسابات المركزي"
      />

      <FiltersBar>
        <SearchField
          value={search}
          placeholder="بحث باسم الدور..."
          onChange={(e) => {
            setPage(1)
            setSearch(e.target.value)
          }}
        />
        <Button
          type="button"
          onClick={() => {
            setSearch('')
            setPage(1)
          }}
          variant="secondary"
          disabled={!search}
        >
          <RotateCcw />
          إعادة تعيين
        </Button>
        <Button
          type="button"
          onClick={() => void rolesQuery.refetch()}
          variant="secondary"
          className="w-10 p-0"
          disabled={rolesQuery.isFetching}
          aria-label="تحديث"
          title="تحديث"
        >
          {rolesQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </FiltersBar>

      <TableSection
        footer={
          <PaginationBar
            info={pageLabel}
            page={page}
            totalPages={totalPages}
            disabled={loading}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>الدور</Th>
              <Th>الوصف</Th>
              <Th>الصلاحيات</Th>
              <Th>المستخدمون</Th>
              <Th>النوع</Th>
              <Th>التواريخ</Th>
            </tr>
          </thead>
          <tbody>
            {loading && roles.length === 0 ? (
              <TableMessage colSpan={6}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل الأدوار...
              </TableMessage>
            ) : roles.length === 0 ? (
              <TableMessage colSpan={6}>لا توجد أدوار مطابقة</TableMessage>
            ) : (
              roles.map((role) => (
                <Tr key={role.id}>
                  <Td>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold text-foreground">{role.name}</span>
                      {role.isSystem && (
                        <span className="text-xs text-muted" title="الأدوار النظامية يديرها الخادم">
                          دور نظامي — يُدار من الخادم
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span
                      className="block max-w-[280px] truncate text-muted"
                      title={role.description || undefined}
                    >
                      {role.description || '—'}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{role.permissions.length}</Td>
                  <Td className="tabular-nums">{role.userCount}</Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                        role.isSystem
                          ? 'bg-info-soft text-info'
                          : 'bg-neutral-100 text-neutral-600',
                      )}
                    >
                      {role.isSystem ? 'نظامي' : 'مخصص'}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div
                      className="flex min-w-0 flex-col gap-0.5 text-xs text-muted"
                      title={
                        role.createdAt || role.updatedAt
                          ? `أُنشئ: ${formatDate(role.createdAt)}${role.updatedAt ? ` · آخر تحديث: ${formatDate(role.updatedAt)}` : ''}`
                          : undefined
                      }
                    >
                      <span>أُنشئ: {formatDate(role.createdAt)}</span>
                      {role.updatedAt && <span>تحديث: {formatDate(role.updatedAt)}</span>}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableSection>
    </PageShell>
  )
}

export default RolesPage
