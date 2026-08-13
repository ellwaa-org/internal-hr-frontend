import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import {
  assignUserToOffice,
  createOffice,
  listOfficeUsers,
  listOffices,
  listUsers,
  unassignUserFromOffice,
  updateOffice,
  type CreateOfficeInput,
  type OfficeRecord,
  type UpdateOfficeInput,
  type UserRecord,
} from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { queryKeys, QUERY_STALE_TIME_DEFAULT } from '@/lib/query-client'
import { createOfficeSchema, updateOfficeSchema, zodErrorMessage } from '@/lib/schemas'
import { notify } from '@/lib/toast'
import { formatTime12 } from '@/lib/datetime'
import { useDialogState } from '@/lib/use-dialog-state'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { SearchableSelect } from '@/components/ui/searchable-select'

type ModalMode =
  | null
  | { type: 'create' }
  | { type: 'edit'; office: OfficeRecord }
  | { type: 'confirm-create'; payload: CreateOfficeInput }
  | { type: 'confirm-edit'; office: OfficeRecord; payload: UpdateOfficeInput }
  | { type: 'members'; office: OfficeRecord }
  | {
      type: 'confirm-assign'
      office: OfficeRecord
      userId: number
      userLabel: string
    }
  | { type: 'confirm-unassign'; office: OfficeRecord; user: UserRecord }

type OfficeFormState = {
  name: string
  latitude: string
  longitude: string
  radiusMeters: string
  graceMinutes: string
  shiftStartTime: string
  shiftEndTime: string
  requireWifiCheck: boolean
  allowedSsids: string
  acceptRewards: boolean
  dailyRewardPoints: string
  payrollCycleStartDay: string
}

const emptyForm = (): OfficeFormState => ({
  name: '',
  latitude: '',
  longitude: '',
  radiusMeters: '150',
  graceMinutes: '15',
  shiftStartTime: '09:00:00',
  shiftEndTime: '17:00:00',
  requireWifiCheck: false,
  allowedSsids: '',
  acceptRewards: false,
  dailyRewardPoints: '10',
  payrollCycleStartDay: '1',
})

function formFromOffice(office: OfficeRecord): OfficeFormState {
  return {
    name: office.name,
    latitude: office.latitude != null ? String(office.latitude) : '',
    longitude: office.longitude != null ? String(office.longitude) : '',
    radiusMeters: String(office.radiusMeters ?? 150),
    graceMinutes: String(office.graceMinutes ?? 15),
    shiftStartTime: office.shiftStartTime ?? '09:00:00',
    shiftEndTime: office.shiftEndTime ?? '17:00:00',
    requireWifiCheck: Boolean(office.requireWifiCheck),
    allowedSsids: (office.allowedSsids ?? []).join(', '),
    acceptRewards: Boolean(office.acceptRewards),
    dailyRewardPoints: String(office.dailyRewardPoints ?? 10),
    payrollCycleStartDay: String(office.payrollCycleStartDay ?? 1),
  }
}

function parseSsids(value: string): string[] {
  return value
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toCreatePayload(form: OfficeFormState): CreateOfficeInput {
  return {
    name: form.name,
    latitude: form.latitude.trim() === '' ? null : Number(form.latitude),
    longitude: form.longitude.trim() === '' ? null : Number(form.longitude),
    radiusMeters: Number(form.radiusMeters),
    graceMinutes: Number(form.graceMinutes),
    shiftStartTime: form.shiftStartTime,
    shiftEndTime: form.shiftEndTime,
    requireWifiCheck: form.requireWifiCheck,
    allowedSsids: parseSsids(form.allowedSsids),
    acceptRewards: form.acceptRewards,
    dailyRewardPoints: Number(form.dailyRewardPoints),
    payrollCycleStartDay: Number(form.payrollCycleStartDay),
  }
}

function OfficesPage({
  token,
  onUnauthorized,
}: {
  token: string
  onUnauthorized: () => void
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [search, setSearch] = useState('')
  const [rewardsFilter, setRewardsFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [wifiFilter, setWifiFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [modal, setModal] = useState<ModalMode>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<OfficeFormState>(emptyForm)
  const [assignUserId, setAssignUserId] = useState('')
  const [membersSearch, setMembersSearch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

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
      search: search.trim(),
      acceptRewards: rewardsFilter,
      requireWifiCheck: wifiFilter,
    }),
    [page, limit, search, rewardsFilter, wifiFilter],
  )

  const officesQuery = useQuery({
    queryKey: queryKeys.offices.list(listParams),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
    queryFn: () =>
      listOffices(token, {
        page,
        limit,
        search: search.trim() || undefined,
        acceptRewards: rewardsFilter === 'all' ? undefined : rewardsFilter === 'yes',
        requireWifiCheck: wifiFilter === 'all' ? undefined : wifiFilter === 'yes',
        sortBy: 'id',
        sortOrder: 'desc',
      }),
  })

  const membersOffice =
    modal?.type === 'members' ||
    modal?.type === 'confirm-unassign' ||
    modal?.type === 'confirm-assign'
      ? modal.office
      : null
  const membersOfficeId = membersOffice?.id ?? null

  const membersQuery = useQuery({
    queryKey: queryKeys.offices.users(membersOfficeId ?? 0, {
      search: membersSearch.trim(),
    }),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
    enabled: membersOfficeId != null,
    queryFn: () =>
      listOfficeUsers(token, membersOfficeId!, {
        page: 1,
        limit: 100,
        search: membersSearch.trim() || undefined,
      }),
  })

  const assignUsersQuery = useQuery({
    queryKey: [...queryKeys.users.all, 'for-office-assign', membersOfficeId],
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
    enabled: membersOfficeId != null,
    queryFn: () => listUsers(token, { page: 1, limit: 100 }),
  })

  useEffect(() => {
    if (officesQuery.error) {
      handleApiError(officesQuery.error, 'تعذر تحميل المكاتب')
    }
  }, [officesQuery.error, handleApiError])

  useEffect(() => {
    if (membersQuery.error) {
      handleApiError(membersQuery.error, 'تعذر تحميل موظفي المكتب')
    }
  }, [membersQuery.error, handleApiError])

  const offices = officesQuery.data?.data ?? []
  const total = officesQuery.data?.total ?? 0
  const totalPages = Math.max(1, officesQuery.data?.totalPages ?? 1)
  const loading = officesQuery.isLoading || officesQuery.isFetching

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.offices.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
    ])
  }, [queryClient])

  const closeModal = () => {
    if (!busy) {
      setModal(null)
      setForm(emptyForm())
      setAssignUserId('')
      setMembersSearch('')
      setFormError(null)
    }
  }

  const formDialog = useDialogState(
    modal?.type === 'create' || modal?.type === 'edit' ? modal : null,
  )
  const confirmCreateDialog = useDialogState(modal?.type === 'confirm-create' ? modal : null)
  const confirmEditDialog = useDialogState(modal?.type === 'confirm-edit' ? modal : null)
  const membersDialog = useDialogState(modal?.type === 'members' ? modal : null)
  const confirmAssignDialog = useDialogState(modal?.type === 'confirm-assign' ? modal : null)
  const confirmUnassignDialog = useDialogState(modal?.type === 'confirm-unassign' ? modal : null)

  const openMembers = (office: OfficeRecord) => {
    setAssignUserId('')
    setMembersSearch('')
    setFormError(null)
    setModal({ type: 'members', office })
  }

  const setField = <K extends keyof OfficeFormState>(key: K, value: OfficeFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const requestOfficeSave = (event: FormEvent) => {
    event.preventDefault()
    if (!modal || (modal.type !== 'create' && modal.type !== 'edit')) return
    setFormError(null)

    const raw = toCreatePayload(form)
    if (modal.type === 'create') {
      const parsed = createOfficeSchema.safeParse(raw)
      if (!parsed.success) {
        const msg = zodErrorMessage(parsed.error)
        setFormError(msg)
        notify.error(msg)
        return
      }
      setModal({ type: 'confirm-create', payload: parsed.data })
      return
    }

    const parsed = updateOfficeSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setFormError(msg)
      notify.error(msg)
      return
    }
    setModal({ type: 'confirm-edit', office: modal.office, payload: parsed.data })
  }

  const runCreate = async (payload: CreateOfficeInput) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ إنشاء المكتب...')
    try {
      await createOffice(token, payload)
      notify.dismiss(toastId)
      notify.success('تم إنشاء المكتب بنجاح')
      setModal(null)
      setForm(emptyForm())
      setPage(1)
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر حفظ المكتب')
    } finally {
      setBusy(false)
    }
  }

  const runEdit = async (office: OfficeRecord, payload: UpdateOfficeInput) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ حفظ التعديلات...')
    try {
      await updateOffice(token, office.id, payload)
      notify.dismiss(toastId)
      notify.success(`تم تحديث ${payload.name ?? office.name}`)
      setModal(null)
      setForm(emptyForm())
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر حفظ المكتب')
    } finally {
      setBusy(false)
    }
  }

  const requestAssign = (office: OfficeRecord) => {
    const userId = Number(assignUserId)
    if (!userId) {
      setFormError('اختر موظفاً للتعيين.')
      return
    }
    const user = (assignUsersQuery.data?.data ?? []).find((u) => u.id === userId)
    setFormError(null)
    setModal({
      type: 'confirm-assign',
      office,
      userId,
      userLabel: user ? `${user.fullName} (${user.employeeCode})` : String(userId),
    })
  }

  const runAssign = async (office: OfficeRecord, userId: number) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ تعيين الموظف...')
    try {
      await assignUserToOffice(token, office.id, userId)
      notify.dismiss(toastId)
      notify.success('تم تعيين الموظف للمكتب')
      setAssignUserId('')
      setModal({ type: 'members', office })
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تعيين الموظف')
    } finally {
      setBusy(false)
    }
  }

  const runUnassign = async (office: OfficeRecord, user: UserRecord) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ فك التعيين...')
    try {
      await unassignUserFromOffice(token, user.id)
      notify.dismiss(toastId)
      notify.success(`تم فك تعيين ${user.fullName}`)
      setModal({ type: 'members', office })
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر فك التعيين')
    } finally {
      setBusy(false)
    }
  }

  const pageLabel = useMemo(() => {
    if (total === 0) return 'لا توجد نتائج'
    const from = (page - 1) * limit + 1
    const to = Math.min(page * limit, total)
    return `${from}–${to} من ${total}`
  }, [page, limit, total])

  const memberUsers = membersQuery.data?.data ?? []
  const memberIds = new Set(memberUsers.map((u) => u.id))
  const assignCandidates = (assignUsersQuery.data?.data ?? []).filter(
    (u) => !memberIds.has(u.id) && u.officeId !== membersOfficeId,
  )

  return (
    <PageShell>
      <PageHeader
        title="المكاتب"
        subtitle="مواقع العمل وقواعد الحضور (النطاق، الوردية، الواي فاي، المكافآت)"
        action={
          <Button
            type="button"
            onClick={() => {
              setForm(emptyForm())
              setFormError(null)
              setModal({ type: 'create' })
            }} variant="primary" fullOnMobile
          >
            <Plus />
            إضافة مكتب
          </Button>
        }
      />

      <FiltersBar>
        <SearchField
          value={search}
          placeholder="بحث باسم المكتب..."
          onChange={(e) => {
            setPage(1)
            setSearch(e.target.value)
          }}
        />

        <Select
          value={rewardsFilter}
          onValueChange={(value) => {
            setPage(1)
            setRewardsFilter(value as 'all' | 'yes' | 'no')
          }}
        >
          <SelectTrigger className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="المكافآت">
            <SelectValue placeholder="المكافآت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المكافآت</SelectItem>
            <SelectItem value="yes">يقبل مكافآت</SelectItem>
            <SelectItem value="no">بدون مكافآت</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={wifiFilter}
          onValueChange={(value) => {
            setPage(1)
            setWifiFilter(value as 'all' | 'yes' | 'no')
          }}
        >
          <SelectTrigger className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="الواي فاي">
            <SelectValue placeholder="الواي فاي" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الواي فاي</SelectItem>
            <SelectItem value="yes">يتطلب واي فاي</SelectItem>
            <SelectItem value="no">بدون واي فاي</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          onClick={() => {
            setSearch('')
            setRewardsFilter('all')
            setWifiFilter('all')
            setPage(1)
          }} variant="secondary" fullOnMobile
          disabled={!search && rewardsFilter === 'all' && wifiFilter === 'all'}
        >
          <RotateCcw />
          إعادة تعيين
        </Button>
        <Button
          type="button"
          onClick={() => {
            void (async () => {
              const toastId = notify.loading('جارٍ تحديث المكاتب...')
              try {
                await queryClient.invalidateQueries({ queryKey: queryKeys.offices.all })
                await officesQuery.refetch()
                notify.dismiss(toastId)
                notify.success('تم تحديث المكاتب')
              } catch (err) {
                notify.dismiss(toastId)
                handleApiError(err, 'تعذر تحديث المكاتب')
              }
            })()
          }} variant="secondary" className="w-10 p-0"
          disabled={officesQuery.isFetching}
          aria-label="تحديث"
          title="تحديث"
        >
          {officesQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
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
              <Th>الاسم</Th>
              <Th>الوردية</Th>
              <Th>النطاق</Th>
              <Th>السماح</Th>
              <Th>واي فاي</Th>
              <Th>مكافآت</Th>
              <Th>عدد الموظفين</Th>
              <ThActions>إجراءات</ThActions>
            </tr>
          </thead>
          <tbody>
            {loading && offices.length === 0 ? (
              <TableMessage colSpan={8}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل المكاتب...
              </TableMessage>
            ) : offices.length === 0 ? (
              <TableMessage colSpan={8}>لا توجد مكاتب</TableMessage>
            ) : (
              offices.map((office) => {
                const count = office.usersCount ?? office.users?.length ?? 0
                return (
                  <Tr key={office.id}>
                    <Td>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold text-foreground">{office.name}</span>
                        {office.payrollCycleStartDay != null && (
                          <span className="text-xs text-muted">
                            دورة الرواتب: يوم {office.payrollCycleStartDay}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums text-muted">
                      {formatTime12(office.shiftStartTime)} – {formatTime12(office.shiftEndTime)}
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums text-muted">{office.radiusMeters} متر</Td>
                    <Td className="whitespace-nowrap tabular-nums text-muted">{office.graceMinutes ?? 0} دقيقة</Td>
                    <Td>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                          office.requireWifiCheck
                            ? 'bg-success-soft text-success'
                            : 'bg-danger-soft text-red-700',
                        )}
                      >
                        {office.requireWifiCheck ? 'مطلوب' : 'لا'}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">
                      {office.acceptRewards ? `${office.dailyRewardPoints ?? 0} نقطة` : '—'}
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="inline-flex h-8 min-w-[42px] cursor-pointer items-center justify-center rounded-full border border-border bg-white px-2.5 text-[13px] font-bold tabular-nums text-foreground transition-colors hover:border-neutral-300 hover:bg-hover"
                        onClick={() => openMembers(office)}
                        title="عرض وتعيين الموظفين"
                      >
                        {count}
                      </button>
                    </Td>
                    <TdActions>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={`إجراءات ${office.name}`}
                            title="إجراءات"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-60">
                          <DropdownMenuLabel>{office.name}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => {
                              setForm(formFromOffice(office))
                              setFormError(null)
                              setModal({ type: 'edit', office })
                            }}
                          >
                            <Pencil />
                            تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openMembers(office)}>
                            <UserPlus />
                            إدارة الموظفين
                          </DropdownMenuItem>
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

      <Dialog open={formDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          {formDialog.data ? (
            <form onSubmit={requestOfficeSave}>
              <DialogHeader>
                <DialogTitle>
                  {formDialog.data.type === 'create' ? 'إضافة مكتب' : 'تعديل المكتب'}
                </DialogTitle>
                <DialogDescription>
                  {formDialog.data.type === 'create'
                    ? 'حدد بيانات المكتب وقواعد الحضور.'
                    : `تعديل بيانات ${formDialog.data.office.name}`}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>الاسم *</span>
                  <Input value={form.name} onChange={(e) => setField('name', e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>نطاق الجيوفينس (متر) *</span>
                  <Input
                    type="number"
                    min={1}
                    value={form.radiusMeters}
                    onChange={(e) => setField('radiusMeters', e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>خط العرض</span>
                  <Input
                    type="number"
                    step="any"
                    value={form.latitude}
                    disabled
                    placeholder="اختياري"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>خط الطول</span>
                  <Input
                    type="number"
                    step="any"
                    value={form.longitude}
                    disabled
                    placeholder="اختياري"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>بداية الوردية</span>
                  <Input
                    value={form.shiftStartTime}
                    onChange={(e) => setField('shiftStartTime', e.target.value)}
                    placeholder="09:00:00"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>نهاية الوردية</span>
                  <Input
                    value={form.shiftEndTime}
                    onChange={(e) => setField('shiftEndTime', e.target.value)}
                    placeholder="17:00:00"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>فترة السماح (دقائق)</span>
                  <Input
                    type="number"
                    min={0}
                    value={form.graceMinutes}
                    onChange={(e) => setField('graceMinutes', e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>يوم بداية دورة الرواتب (1–28)</span>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={form.payrollCycleStartDay}
                    onChange={(e) => setField('payrollCycleStartDay', e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted col-span-full">
                  <span>شبكات الواي فاي المسموحة</span>
                  <Input
                    value={form.allowedSsids}
                    disabled
                    placeholder="Office-WiFi, Guest"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  <span>نقاط المكافأة اليومية</span>
                  <Input
                    type="number"
                    min={0}
                    value={form.dailyRewardPoints}
                    onChange={(e) => setField('dailyRewardPoints', e.target.value)}
                  />
                </label>
                <label className="flex flex-row items-center gap-2.5 pt-7 text-[13px] text-muted">
                  <Checkbox
                    checked={form.requireWifiCheck}
                    onCheckedChange={(checked) => setField('requireWifiCheck', checked === true)}
                    id="office-wifi"
                  />
                  <span>يتطلب التحقق من الواي فاي</span>
                </label>
                <label className="flex flex-row items-center gap-2.5 pt-7 text-[13px] text-muted">
                  <Checkbox
                    checked={form.acceptRewards}
                    onCheckedChange={(checked) => setField('acceptRewards', checked === true)}
                    id="office-rewards"
                  />
                  <span>تفعيل المكافآت</span>
                </label>
                {formError && <p className="col-span-full m-0 text-[13px] font-semibold text-red-700">{formError}</p>}
              </DialogBody>
              <DialogFooter>
                <Button type="button" disabled={busy} onClick={closeModal} variant="secondary">
                  إلغاء
                </Button>
                <Button type="submit" disabled={busy} variant="primary">
                  {formDialog.data.type === 'create' ? <Plus /> : <Pencil />}
                  {formDialog.data.type === 'create' ? 'إضافة' : 'حفظ'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmCreateDialog.open}
        onOpenChange={(open) => {
          if (!open && !busy && confirmCreateDialog.data) {
            setModal({ type: 'create' })
          }
        }}
      >
        <DialogContent nested>
          {confirmCreateDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد الإضافة</DialogTitle>
                <DialogDescription>
                  هل تريد إنشاء مكتب «{confirmCreateDialog.data.payload.name}» بهذه الإعدادات؟
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal({ type: 'create' })}
                  variant="secondary"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmCreateDialog.data
                    if (!data) return
                    void runCreate(data.payload)
                  }}
                  variant="primary"
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                  تأكيد الإضافة
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmEditDialog.open}
        onOpenChange={(open) => {
          if (!open && !busy && confirmEditDialog.data) {
            setModal({ type: 'edit', office: confirmEditDialog.data.office })
          }
        }}
      >
        <DialogContent nested>
          {confirmEditDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد حفظ التغييرات</DialogTitle>
                <DialogDescription>
                  هل تريد حفظ التعديلات على مكتب {confirmEditDialog.data.office.name}؟ سيتم تطبيق
                  التغييرات فوراً.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmEditDialog.data
                    if (!data) return
                    setModal({ type: 'edit', office: data.office })
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
                    void runEdit(data.office, data.payload)
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

      <Dialog open={membersDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent size="lg">
          {membersDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>موظفو {membersDialog.data.office.name}</DialogTitle>
                <DialogDescription>
                  عيّن موظفين للمكتب أو أزلهم منه. التعيين يعيد تعيين الموظف من مكتبه الحالي إن وُجد.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-wrap items-end gap-2.5 max-[720px]:flex-col max-[720px]:items-stretch [&_button]:max-[720px]:w-full">
                  <div className="flex min-w-[min(100%,320px)] flex-1 flex-col gap-1.5 text-[13px] text-muted">
                    <span>تعيين / إعادة تعيين موظف</span>
                    <SearchableSelect
                      value={assignUserId || undefined}
                      onValueChange={setAssignUserId}
                      aria-label="الموظف"
                      placeholder="اختر موظفاً"
                      searchPlaceholder="بحث بالاسم أو الكود..."
                      emptyText="لا يوجد موظف مطابق"
                      options={assignCandidates.map((u) => ({
                        value: String(u.id),
                        label: `${u.fullName} (${u.employeeCode})${
                          u.office?.name ? ` — ${u.office.name}` : ''
                        }`,
                        keywords: `${u.fullName} ${u.employeeCode} ${u.office?.name ?? ''}`,
                      }))}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={busy || !assignUserId}
                    onClick={() => {
                      const data = membersDialog.data
                      if (!data) return
                      requestAssign(data.office)
                    }}
                    variant="primary"
                  >
                    <UserPlus />
                    تعيين
                  </Button>
                </div>
                {formError && <p className="col-span-full m-0 text-[13px] font-semibold text-red-700">{formError}</p>}

                <SearchField
                  value={membersSearch}
                  placeholder="بحث بالاسم أو الكود..."
                  onChange={(e) => setMembersSearch(e.target.value)}
                  className="h-10 min-h-10 max-h-10 w-full flex-none"
                />

                <div className="mt-1 flex max-h-[min(48svh,420px)] flex-col gap-2 overflow-auto px-0.5 py-1">
                  {membersQuery.isLoading && memberUsers.length === 0 ? (
                    <div className="p-7 text-center text-[13px] text-muted">
                      <Loader2 className="me-2 inline-block animate-spin align-[-3px]" /> جارٍ التحميل...
                    </div>
                  ) : memberUsers.length === 0 ? (
                    <div className="p-7 text-center text-[13px] text-muted">لا يوجد موظفون في هذا المكتب</div>
                  ) : (
                    memberUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-[#fafafa] px-3 py-2.5 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:gap-2.5 [&_button]:max-[720px]:w-full">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-semibold text-foreground">{user.fullName}</span>
                          <span className="text-xs text-muted">
                            {user.employeeCode}
                            {user.role ? ` · ${user.role}` : ''}
                          </span>
                        </div>
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const data = membersDialog.data
                            if (!data) return
                            setModal({
                              type: 'confirm-unassign',
                              office: data.office,
                              user,
                            })
                          }}
                          variant="secondary"
                          size="sm"
                        >
                          <UserMinus />
                          إزالة
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" disabled={busy} onClick={closeModal} variant="secondary">
                  إغلاق
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmAssignDialog.open}
        onOpenChange={(open) => {
          if (!open && !busy && confirmAssignDialog.data) {
            setModal({ type: 'members', office: confirmAssignDialog.data.office })
          }
        }}
      >
        <DialogContent nested>
          {confirmAssignDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد التعيين</DialogTitle>
                <DialogDescription>
                  هل تريد تعيين {confirmAssignDialog.data.userLabel} في مكتب{' '}
                  {confirmAssignDialog.data.office.name}؟
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmAssignDialog.data
                    if (!data) return
                    setModal({ type: 'members', office: data.office })
                  }}
                  variant="secondary"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmAssignDialog.data
                    if (!data) return
                    void runAssign(data.office, data.userId)
                  }}
                  variant="primary"
                >
                  {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
                  تأكيد التعيين
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmUnassignDialog.open}
        onOpenChange={(open) => {
          if (!open && !busy && confirmUnassignDialog.data) {
            setModal({ type: 'members', office: confirmUnassignDialog.data.office })
          }
        }}
      >
        <DialogContent nested>
          {confirmUnassignDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد الإزالة</DialogTitle>
                <DialogDescription>
                  هل تريد إزالة {confirmUnassignDialog.data.user.fullName} من مكتب{' '}
                  {confirmUnassignDialog.data.office.name}؟
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmUnassignDialog.data
                    if (!data) return
                    setModal({ type: 'members', office: data.office })
                  }}
                  variant="secondary"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmUnassignDialog.data
                    if (!data) return
                    void runUnassign(data.office, data.user)
                  }}
                  variant="primary"
                >
                  {busy ? <Loader2 className="animate-spin" /> : <UserMinus />}
                  تأكيد الإزالة
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

export default OfficesPage
