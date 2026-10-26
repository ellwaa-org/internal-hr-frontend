import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { listDepartments } from '@/lib/api'
import { isForbiddenError, isUnauthorizedError } from '@/lib/errors'
import { queryKeys, QUERY_STALE_TIME_DEFAULT } from '@/lib/query-client'
import { notify } from '@/lib/toast'
import { usePageParam } from '@/lib/use-page-param'
import { Button } from '@/components/ui/button'
import { FiltersBar, PageHeader, PageShell, PaginationBar, SearchField } from '@/components/ui/page'
import { Table, TableMessage, TableSection, Td, Th, Tr } from '@/components/ui/table'

function DepartmentsPage({
  token,
  onUnauthorized,
  // permissions kept in the call-site contract; department mutations are now centralized.
}: {
  token: string
  permissions: string[]
  onUnauthorized: () => void
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = usePageParam()
  const [limit] = useState(20)
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

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.list(listParams),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
    queryFn: () =>
      listDepartments(token, {
        page,
        limit,
        search: search.trim() || undefined,
      }),
  })

  useEffect(() => {
    if (departmentsQuery.error) {
      handleApiError(departmentsQuery.error, 'تعذر تحميل الإدارات')
    }
  }, [departmentsQuery.error, handleApiError])

  const departments = departmentsQuery.data?.data ?? []
  const total = departmentsQuery.data?.total ?? 0
  const totalPages = Math.max(1, departmentsQuery.data?.totalPages ?? 1)
  const loading = departmentsQuery.isLoading || departmentsQuery.isFetching

  const pageLabel = useMemo(() => {
    if (total === 0) return 'لا توجد نتائج'
    const from = (page - 1) * limit + 1
    const to = Math.min(page * limit, total)
    return `${from}–${to} من ${total}`
  }, [page, limit, total])

  return (
    <PageShell>
      <PageHeader
        title="الإدارات"
        subtitle="استعراض الإدارات فقط — الأقسام تُدار من مدير الحسابات المركزي"
      />

      <FiltersBar>
        <SearchField
          value={search}
          placeholder="بحث باسم الإدارة..."
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
          }} variant="secondary" fullOnMobile
          disabled={!search}
        >
          <RotateCcw />
          إعادة تعيين
        </Button>
        <Button
          type="button"
          onClick={() => {
            void (async () => {
              const toastId = notify.loading('جارٍ تحديث الإدارات...')
              try {
                await queryClient.invalidateQueries({ queryKey: queryKeys.departments.all })
                await departmentsQuery.refetch()
                notify.dismiss(toastId)
                notify.success('تم تحديث الإدارات')
              } catch (err) {
                notify.dismiss(toastId)
                handleApiError(err, 'تعذر تحديث الإدارات')
              }
            })()
          }} variant="secondary" className="w-10 p-0"
          disabled={departmentsQuery.isFetching}
          aria-label="تحديث"
          title="تحديث"
        >
          {departmentsQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
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
        <Table compact>
          <thead>
            <tr>
              <Th className="w-[55%]">الاسم</Th>
              <Th>عدد الموظفين</Th>
            </tr>
          </thead>
          <tbody>
            {loading && departments.length === 0 ? (
              <TableMessage colSpan={2}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل الإدارات...
              </TableMessage>
            ) : departments.length === 0 ? (
              <TableMessage colSpan={2}>لا توجد إدارات</TableMessage>
            ) : (
              departments.map((dept) => {
                const count = dept.usersCount ?? dept.users?.length ?? 0
                return (
                  <Tr key={dept.id}>
                    <Td>
                      <span className="font-semibold text-foreground">{dept.name}</span>
                    </Td>
                    <Td>
                      <span className="inline-flex h-8 min-w-[42px] items-center justify-center rounded-full border border-border bg-white px-2.5 text-[13px] font-bold tabular-nums text-foreground">
                        {count}
                      </span>
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

export default DepartmentsPage
