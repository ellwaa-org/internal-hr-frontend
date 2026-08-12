import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
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
} from './lib/api'
import { isUnauthorizedError } from './lib/errors'
import { queryKeys, QUERY_STALE_TIME } from './lib/query-client'
import { createOfficeSchema, updateOfficeSchema, zodErrorMessage } from './lib/schemas'
import { notify } from './lib/toast'
import { Checkbox } from './components/ui/checkbox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select'
import './Employees.css'

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
  const [limit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
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
    staleTime: QUERY_STALE_TIME,
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
    staleTime: QUERY_STALE_TIME,
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
    staleTime: QUERY_STALE_TIME,
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
    <div className="employees-page">
      <div className="employees-toolbar">
        <div className="employees-toolbar-text">
          <h1 className="employees-title">المكاتب</h1>
          <p className="employees-subtitle">
            مواقع العمل وقواعد الحضور (النطاق، الوردية، الواي فاي، المكافآت)
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setForm(emptyForm())
            setFormError(null)
            setModal({ type: 'create' })
          }}
        >
          <Plus />
          إضافة مكتب
        </button>
      </div>

      <div className="employees-filters">
        <label className="employees-search">
          <Search />
          <input
            type="search"
            value={searchInput}
            placeholder="بحث باسم المكتب..."
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1)
                setSearch(searchInput)
              }
            }}
          />
        </label>

        <Select
          value={rewardsFilter}
          onValueChange={(value) => {
            setPage(1)
            setRewardsFilter(value as 'all' | 'yes' | 'no')
          }}
        >
          <SelectTrigger className="employees-select-trigger" aria-label="المكافآت">
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
          <SelectTrigger className="employees-select-trigger" aria-label="الواي فاي">
            <SelectValue placeholder="الواي فاي" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الواي فاي</SelectItem>
            <SelectItem value="yes">يتطلب واي فاي</SelectItem>
            <SelectItem value="no">بدون واي فاي</SelectItem>
          </SelectContent>
        </Select>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setPage(1)
            setSearch(searchInput)
          }}
        >
          <Search />
          بحث
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setSearchInput('')
            setSearch('')
            setRewardsFilter('all')
            setWifiFilter('all')
            setPage(1)
          }}
          disabled={
            !searchInput && !search && rewardsFilter === 'all' && wifiFilter === 'all'
          }
        >
          <RotateCcw />
          إعادة تعيين
        </button>
        <button
          type="button"
          className="btn btn-secondary"
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
          }}
          disabled={officesQuery.isFetching}
          aria-label="تحديث"
        >
          {officesQuery.isFetching ? <Loader2 className="spin" /> : <RefreshCw />}
          تحديث
        </button>
      </div>

      <div className="employees-table-wrap">
        <table className="employees-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الوردية</th>
              <th>النطاق</th>
              <th>السماح</th>
              <th>واي فاي</th>
              <th>مكافآت</th>
              <th>عدد الموظفين</th>
              <th className="col-actions">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && offices.length === 0 ? (
              <tr>
                <td colSpan={8} className="employees-empty">
                  <Loader2 className="spin" />
                  جارٍ تحميل المكاتب...
                </td>
              </tr>
            ) : offices.length === 0 ? (
              <tr>
                <td colSpan={8} className="employees-empty">
                  لا توجد مكاتب
                </td>
              </tr>
            ) : (
              offices.map((office) => {
                const count = office.usersCount ?? office.users?.length ?? 0
                return (
                  <tr key={office.id}>
                    <td>
                      <div className="employee-name-cell">
                        <span className="employee-name">{office.name}</span>
                        {office.payrollCycleStartDay != null && (
                          <span className="employee-dept">
                            دورة الرواتب: يوم {office.payrollCycleStartDay}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {(office.shiftStartTime ?? '—').slice(0, 5)} –{' '}
                      {(office.shiftEndTime ?? '—').slice(0, 5)}
                    </td>
                    <td>{office.radiusMeters} م</td>
                    <td>{office.graceMinutes ?? 0} د</td>
                    <td>
                      <span
                        className={`status-pill ${office.requireWifiCheck ? 'is-active' : 'is-inactive'}`}
                      >
                        {office.requireWifiCheck ? 'مطلوب' : 'لا'}
                      </span>
                    </td>
                    <td>
                      {office.acceptRewards
                        ? `${office.dailyRewardPoints ?? 0} نقطة`
                        : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="count-link"
                        onClick={() => openMembers(office)}
                        title="عرض وتعيين الموظفين"
                      >
                        {count}
                      </button>
                    </td>
                    <td className="col-actions">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="btn btn-secondary btn-sm actions-btn">
                            <MoreHorizontal />
                            إجراءات
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="actions-dropdown">
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
                    </td>
                  </tr>
                )
              })
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

      <Dialog
        open={modal?.type === 'create' || modal?.type === 'edit'}
        onOpenChange={(open) => !open && closeModal()}
      >
        {(modal?.type === 'create' || modal?.type === 'edit') && (
          <DialogContent>
            <form onSubmit={requestOfficeSave}>
              <DialogHeader>
                <DialogTitle>
                  {modal.type === 'create' ? 'إضافة مكتب' : 'تعديل المكتب'}
                </DialogTitle>
                <DialogDescription>
                  {modal.type === 'create'
                    ? 'حدد بيانات المكتب وقواعد الحضور.'
                    : `تعديل بيانات ${modal.office.name}`}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="employee-form">
                <label className="form-field">
                  <span>الاسم *</span>
                  <input value={form.name} onChange={(e) => setField('name', e.target.value)} />
                </label>
                <label className="form-field">
                  <span>نطاق الجيوفينس (متر) *</span>
                  <input
                    type="number"
                    min={1}
                    value={form.radiusMeters}
                    onChange={(e) => setField('radiusMeters', e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>خط العرض</span>
                  <input
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) => setField('latitude', e.target.value)}
                    placeholder="اختياري"
                  />
                </label>
                <label className="form-field">
                  <span>خط الطول</span>
                  <input
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) => setField('longitude', e.target.value)}
                    placeholder="اختياري"
                  />
                </label>
                <label className="form-field">
                  <span>بداية الوردية</span>
                  <input
                    value={form.shiftStartTime}
                    onChange={(e) => setField('shiftStartTime', e.target.value)}
                    placeholder="09:00:00"
                  />
                </label>
                <label className="form-field">
                  <span>نهاية الوردية</span>
                  <input
                    value={form.shiftEndTime}
                    onChange={(e) => setField('shiftEndTime', e.target.value)}
                    placeholder="17:00:00"
                  />
                </label>
                <label className="form-field">
                  <span>فترة السماح (دقائق)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.graceMinutes}
                    onChange={(e) => setField('graceMinutes', e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>يوم بداية دورة الرواتب (1–28)</span>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={form.payrollCycleStartDay}
                    onChange={(e) => setField('payrollCycleStartDay', e.target.value)}
                  />
                </label>
                <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <span>شبكات الواي فاي المسموحة (مفصولة بفاصلة)</span>
                  <input
                    value={form.allowedSsids}
                    onChange={(e) => setField('allowedSsids', e.target.value)}
                    placeholder="Office-WiFi, Guest"
                  />
                </label>
                <label className="form-field">
                  <span>نقاط المكافأة اليومية</span>
                  <input
                    type="number"
                    min={0}
                    value={form.dailyRewardPoints}
                    onChange={(e) => setField('dailyRewardPoints', e.target.value)}
                  />
                </label>
                <label className="form-field form-field-check">
                  <Checkbox
                    checked={form.requireWifiCheck}
                    onCheckedChange={(checked) => setField('requireWifiCheck', checked === true)}
                    id="office-wifi"
                  />
                  <span>يتطلب التحقق من الواي فاي</span>
                </label>
                <label className="form-field form-field-check">
                  <Checkbox
                    checked={form.acceptRewards}
                    onCheckedChange={(checked) => setField('acceptRewards', checked === true)}
                    id="office-rewards"
                  />
                  <span>تفعيل المكافآت</span>
                </label>
                {formError && <p className="form-error">{formError}</p>}
              </DialogBody>
              <DialogFooter>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeModal}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {modal.type === 'create' ? <Plus /> : <Pencil />}
                  {modal.type === 'create' ? 'إضافة' : 'حفظ'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={modal?.type === 'confirm-create'}
        onOpenChange={(open) => {
          if (!open && !busy && modal?.type === 'confirm-create') {
            setModal({ type: 'create' })
          }
        }}
      >
        {modal?.type === 'confirm-create' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الإضافة</DialogTitle>
              <DialogDescription>
                هل تريد إنشاء مكتب «{modal.payload.name}» بهذه الإعدادات؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setModal({ type: 'create' })}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runCreate(modal.payload)}
              >
                {busy ? <Loader2 className="spin" /> : <Plus />}
                تأكيد الإضافة
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={modal?.type === 'confirm-edit'}
        onOpenChange={(open) => {
          if (!open && !busy && modal?.type === 'confirm-edit') {
            setModal({ type: 'edit', office: modal.office })
          }
        }}
      >
        {modal?.type === 'confirm-edit' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد حفظ التغييرات</DialogTitle>
              <DialogDescription>
                هل تريد حفظ التعديلات على مكتب {modal.office.name}؟ سيتم تطبيق التغييرات فوراً.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setModal({ type: 'edit', office: modal.office })}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runEdit(modal.office, modal.payload)}
              >
                {busy ? <Loader2 className="spin" /> : <Pencil />}
                تأكيد الحفظ
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={modal?.type === 'members'} onOpenChange={(open) => !open && closeModal()}>
        {modal?.type === 'members' && (
          <DialogContent className="members-overlay">
            <DialogHeader>
              <DialogTitle>موظفو {modal.office.name}</DialogTitle>
              <DialogDescription>
                عيّن موظفين للمكتب أو أزلهم منه. التعيين يعيد تعيين الموظف من مكتبه الحالي إن وُجد.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="members-assign-row">
                <div className="form-field">
                  <span>تعيين / إعادة تعيين موظف</span>
                  <Select value={assignUserId || undefined} onValueChange={setAssignUserId}>
                    <SelectTrigger aria-label="الموظف">
                      <SelectValue placeholder="اختر موظفاً" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignCandidates.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.fullName} ({u.employeeCode})
                          {u.office?.name ? ` — ${u.office.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !assignUserId}
                  onClick={() => requestAssign(modal.office)}
                >
                  <UserPlus />
                  تعيين
                </button>
              </div>
              {formError && <p className="form-error">{formError}</p>}

              <label className="employees-search members-live-search">
                <Search />
                <input
                  type="search"
                  value={membersSearch}
                  placeholder="بحث بالاسم أو الكود..."
                  onChange={(e) => setMembersSearch(e.target.value)}
                />
              </label>

              <div className="members-list">
                {membersQuery.isLoading && memberUsers.length === 0 ? (
                  <div className="members-empty">
                    <Loader2 className="spin" /> جارٍ التحميل...
                  </div>
                ) : memberUsers.length === 0 ? (
                  <div className="members-empty">لا يوجد موظفون في هذا المكتب</div>
                ) : (
                  memberUsers.map((user) => (
                    <div key={user.id} className="members-row">
                      <div className="members-row-meta">
                        <span className="employee-name">{user.fullName}</span>
                        <span className="employee-dept">
                          {user.employeeCode}
                          {user.role ? ` · ${user.role}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() =>
                          setModal({
                            type: 'confirm-unassign',
                            office: modal.office,
                            user,
                          })
                        }
                      >
                        <UserMinus />
                        إزالة
                      </button>
                    </div>
                  ))
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeModal}>
                إغلاق
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={modal?.type === 'confirm-assign'}
        onOpenChange={(open) => {
          if (!open && !busy && modal?.type === 'confirm-assign') {
            setModal({ type: 'members', office: modal.office })
          }
        }}
      >
        {modal?.type === 'confirm-assign' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد التعيين</DialogTitle>
              <DialogDescription>
                هل تريد تعيين {modal.userLabel} في مكتب {modal.office.name}؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setModal({ type: 'members', office: modal.office })}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runAssign(modal.office, modal.userId)}
              >
                {busy ? <Loader2 className="spin" /> : <UserPlus />}
                تأكيد التعيين
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={modal?.type === 'confirm-unassign'}
        onOpenChange={(open) => {
          if (!open && !busy && modal?.type === 'confirm-unassign') {
            setModal({ type: 'members', office: modal.office })
          }
        }}
      >
        {modal?.type === 'confirm-unassign' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الإزالة</DialogTitle>
              <DialogDescription>
                هل تريد إزالة {modal.user.fullName} من مكتب {modal.office.name}؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setModal({ type: 'members', office: modal.office })}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runUnassign(modal.office, modal.user)}
              >
                {busy ? <Loader2 className="spin" /> : <UserMinus />}
                تأكيد الإزالة
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

export default OfficesPage
