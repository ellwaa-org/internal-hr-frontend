import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ClipboardCheck, TriangleAlert } from 'lucide-react'
import { listUsers, type UserRecord } from '@/lib/api'
import { formatDate } from '@/lib/datetime'
import { queryKeys, QUERY_STALE_TIME_FREQUENT } from '@/lib/query-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Table, TableSection, Td, TdActions, Th, ThActions, Tr } from '@/components/ui/table'

const REVIEW_STATUS_LABELS: Record<'pending' | 'approved' | 'rejected', string> = {
  pending: 'بانتظار المراجعة',
  approved: 'مقبول',
  rejected: 'مرفوض',
}

/**
 * Collapsible alert panel above the employees table: ACTIVE employees with
 * 7+ consecutive absent work days this month. Collapsed by default and
 * hidden entirely when there is nothing to show.
 */
export function AbsenceStreakPanel({
  token,
  onOpenReview,
  canReview,
}: {
  token: string
  onOpenReview: (user: UserRecord) => void
  canReview: boolean
}) {
  const [open, setOpen] = useState(false)

  const streakQuery = useQuery({
    queryKey: queryKeys.users.list({
      page: 1,
      limit: 100,
      search: '',
      role: 'all',
      status: 'all',
      absentStreak: 7,
    }),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () => listUsers(token, { page: 1, limit: 100, absentStreak: 7, isActive: true }),
  })

  const users = streakQuery.data?.data ?? []
  if (streakQuery.isLoading || users.length === 0) return null

  return (
    <TableSection className="border-red-200 bg-red-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-none bg-transparent px-1 py-1 text-start"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-red-700">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          موظفون غائبون ٧ أيام متتالية أو أكثر
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
            {users.length}
          </span>
          <span className="text-[11px] font-medium text-red-600/80">
            (موظفون نشطون فقط — الشهر الحالي)
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-red-700 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <Table className="mt-2">
          <thead>
            <tr>
              <Th>الاسم</Th>
              <Th>كود الموظف</Th>
              <Th>أيام الغياب المتتالية</Th>
              <Th>الفترة</Th>
              <Th>حالة المراجعة</Th>
              <ThActions>إجراءات</ThActions>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <Tr key={user.id} className="bg-white/60">
                <Td className="font-semibold text-foreground">{user.fullName}</Td>
                <Td>
                  <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {user.employeeCode}
                  </code>
                </Td>
                <Td>
                  <span className="inline-flex items-center rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-red-700">
                    {user.consecutiveAbsenceDays ?? '—'} يومًا متتاليًا
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-muted">
                  {user.consecutiveAbsence
                    ? `${formatDate(user.consecutiveAbsence.startDate)} — ${formatDate(user.consecutiveAbsence.endDate)}`
                    : '—'}
                </Td>
                <Td>
                  {user.absenceReviewStatus ? (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                        user.absenceReviewStatus === 'pending' && 'bg-amber-100 text-amber-700',
                        user.absenceReviewStatus === 'approved' && 'bg-success-soft text-success',
                        user.absenceReviewStatus === 'rejected' && 'bg-red-100 text-red-800',
                      )}
                    >
                      {REVIEW_STATUS_LABELS[user.absenceReviewStatus]}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <TdActions>
                  {canReview ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onOpenReview(user)}
                    >
                      <ClipboardCheck />
                      قبول/رفض
                    </Button>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TdActions>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </TableSection>
  )
}

export default AbsenceStreakPanel
