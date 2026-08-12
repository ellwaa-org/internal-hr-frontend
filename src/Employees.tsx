import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  Trash2,
  UserPlus,
} from 'lucide-react'
import {
  deleteUser,
  listDepartmentOptions,
  listOfficeOptions,
  listUsers,
  registerUser,
  resetUserDevice,
  resetUserPassword,
  setUserStatus,
  updateUser,
  type DepartmentOption,
  type OfficeOption,
  type RegisterUserInput,
  type Role,
  type UpdateUserInput,
  type UserRecord,
} from './lib/api'
import { isUnauthorizedError } from './lib/errors'
import { queryKeys, QUERY_STALE_TIME } from './lib/query-client'
import {
  registerUserSchema,
  updateUserSchema,
  zodErrorMessage,
} from './lib/schemas'
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

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'مدير النظام',
  HR: 'موارد بشرية',
  EMPLOYEE: 'موظف',
}

type UpdatePayload = UpdateUserInput

type ModalMode =
  | null
  | { type: 'create' }
  | { type: 'update'; user: UserRecord; draft?: UpdatePayload }
  | { type: 'confirm-update'; user: UserRecord; update: UpdatePayload }
  | { type: 'confirm'; action: ConfirmAction; user: UserRecord }

type ConfirmAction = 'delete' | 'toggle' | 'reset-password' | 'reset-device'

const CONFIRM_SUCCESS: Record<Exclude<ConfirmAction, 'toggle'>, (name: string) => string> = {
  delete: (name) => `تم حذف ${name} بنجاح`,
  'reset-password': (name) => `تمت إعادة تعيين كلمة مرور ${name}`,
  'reset-device': (name) => `تمت إعادة تعيين جهاز ${name}`,
}

const CONFIRM_LOADING: Record<ConfirmAction, string> = {
  delete: 'جارٍ حذف الموظف...',
  toggle: 'جارٍ تحديث الحالة...',
  'reset-password': 'جارٍ إعادة تعيين كلمة المرور...',
  'reset-device': 'جارٍ إعادة تعيين الجهاز...',
}

function EmployeesPage({
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
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modal, setModal] = useState<ModalMode>(null)
  const [busy, setBusy] = useState(false)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
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
      search: search.trim(),
      role: roleFilter,
      status: statusFilter,
    }),
    [page, limit, search, roleFilter, statusFilter],
  )

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(listParams),
    staleTime: QUERY_STALE_TIME,
    queryFn: () =>
      listUsers(token, {
        page,
        limit,
        search: search.trim() || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
      }),
  })

  useEffect(() => {
    if (usersQuery.error) {
      handleApiError(usersQuery.error, 'تعذر تحميل قائمة الموظفين')
    }
  }, [usersQuery.error, handleApiError])

  const users = usersQuery.data?.data ?? []
  const total = usersQuery.data?.total ?? 0
  const totalPages = Math.max(1, usersQuery.data?.totalPages ?? 1)
  const loading = usersQuery.isLoading || usersQuery.isFetching

  const invalidateUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
  }, [queryClient])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listDepartmentOptions(token, { limit: 100 }),
      listOfficeOptions(token, { limit: 100 }),
    ])
      .then(([deptItems, officeItems]) => {
        if (cancelled) return
        setDepartments(deptItems)
        setOffices(officeItems)
      })
      .catch(() => {
        // Department/office lists are optional helpers for the forms.
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const closeModal = () => {
    if (!busy) setModal(null)
  }

  const runConfirm = async (action: ConfirmAction, user: UserRecord) => {
    setBusy(true)
    const toastId = notify.loading(CONFIRM_LOADING[action])
    try {
      if (action === 'delete') {
        await deleteUser(token, user.id)
      } else if (action === 'toggle') {
        await setUserStatus(token, user.id, !user.isActive)
      } else if (action === 'reset-password') {
        await resetUserPassword(token, user.id)
      } else {
        await resetUserDevice(token, user.id)
      }
      notify.dismiss(toastId)
      if (action === 'toggle') {
        notify.success(
          user.isActive ? `تم إيقاف ${user.fullName}` : `تم تفعيل ${user.fullName}`,
          user.isActive ? 'لن يتمكن من تسجيل الدخول حتى إعادة التفعيل.' : 'يمكنه تسجيل الدخول الآن.',
        )
      } else {
        notify.success(CONFIRM_SUCCESS[action as Exclude<ConfirmAction, 'toggle'>](user.fullName))
      }
      setModal(null)
      await invalidateUsers()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تنفيذ العملية')
    } finally {
      setBusy(false)
    }
  }

  const runUpdateSave = async (user: UserRecord, update: UpdatePayload) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ حفظ التغييرات...')
    try {
      await updateUser(token, user.id, update)
      notify.dismiss(toastId)
      notify.success(`تم تحديث بيانات ${user.fullName}`, 'تم حفظ التغييرات بنجاح.')
      setModal(null)
      await invalidateUsers()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تحديث الموظف')
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

  return (
    <div className="employees-page">
      <div className="employees-toolbar">
        <div className="employees-toolbar-text">
          <h1 className="employees-title">الموظفون</h1>
          <p className="employees-subtitle">إدارة حسابات الموظفين والصلاحيات</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>
          <Plus />
          إضافة موظف
        </button>
      </div>

      <div className="employees-filters">
        <label className="employees-search">
          <Search />
          <input
            type="search"
            value={search}
            placeholder="بحث بالاسم أو الكود أو الهاتف..."
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
          />
        </label>

        <Select
          value={roleFilter}
          onValueChange={(value) => {
            setPage(1)
            setRoleFilter(value as 'all' | Role)
          }}
        >
          <SelectTrigger className="employees-select-trigger" aria-label="تصفية حسب الدور">
            <SelectValue placeholder="كل الأدوار" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأدوار</SelectItem>
            <SelectItem value="ADMIN">مدير النظام</SelectItem>
            <SelectItem value="HR">موارد بشرية</SelectItem>
            <SelectItem value="EMPLOYEE">موظف</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setPage(1)
            setStatusFilter(value as 'all' | 'active' | 'inactive')
          }}
        >
          <SelectTrigger className="employees-select-trigger" aria-label="تصفية حسب الحالة">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="inactive">متوقف</SelectItem>
          </SelectContent>
        </Select>

        <div className="employees-filters-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearch('')
              setRoleFilter('all')
              setStatusFilter('all')
              setPage(1)
            }}
            disabled={!search && roleFilter === 'all' && statusFilter === 'all'}
          >
            <RotateCcw />
            إعادة تعيين
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void (async () => {
                const toastId = notify.loading('جارٍ تحديث الموظفين...')
                try {
                  await queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
                  await usersQuery.refetch()
                  notify.dismiss(toastId)
                  notify.success('تم تحديث قائمة الموظفين')
                } catch (err) {
                  notify.dismiss(toastId)
                  handleApiError(err, 'تعذر تحديث الموظفين')
                }
              })()
            }}
            disabled={usersQuery.isFetching}
            aria-label="تحديث"
          >
            {usersQuery.isFetching ? <Loader2 className="spin" /> : <RefreshCw />}
            تحديث
          </button>
        </div>
      </div>

      <div className="employees-table-wrap">
        <table className="employees-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>كود الموظف</th>
              <th>الدور</th>
              <th>الهاتف</th>
              <th>البريد</th>
              <th>الحالة</th>
              <th>النقاط</th>
              <th>الجهاز</th>
              <th className="col-actions">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={9} className="employees-empty">
                  <Loader2 className="spin" />
                  جارٍ تحميل الموظفين...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={9} className="employees-empty">
                  لا يوجد موظفون مطابقون
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="employee-name-cell">
                      <span className="employee-name">{user.fullName}</span>
                      {(user.department?.name || user.office?.name) && (
                        <span className="employee-dept">
                          {[user.department?.name, user.office?.name].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <code className="employee-code">{user.employeeCode}</code>
                  </td>
                  <td>{ROLE_LABELS[user.role]}</td>
                  <td>{user.phoneNumber || '—'}</td>
                  <td>{user.email || '—'}</td>
                  <td>
                    <span className={`status-pill ${user.isActive ? 'is-active' : 'is-inactive'}`}>
                      {user.isActive ? 'نشط' : 'متوقف'}
                    </span>
                  </td>
                  <td>{user.points}</td>
                  <td>{user.deviceId ? 'مربوط' : '—'}</td>
                  <td className="col-actions">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="btn btn-secondary btn-sm actions-btn">
                          <MoreHorizontal />
                          إجراءات
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="actions-dropdown">
                        <DropdownMenuLabel>
                          {user.fullName} • {user.employeeCode}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setModal({ type: 'update', user })}>
                          <Pencil />
                          تحديث
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setModal({ type: 'confirm', action: 'toggle', user })}
                        >
                          <Power />
                          {user.isActive ? 'إيقاف' : 'تفعيل'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setModal({ type: 'confirm', action: 'reset-password', user })
                          }
                        >
                          <KeyRound />
                          إعادة تعيين كلمة المرور
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setModal({ type: 'confirm', action: 'reset-device', user })
                          }
                        >
                          <Smartphone />
                          إعادة تعيين الجهاز
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="danger"
                          onSelect={() => setModal({ type: 'confirm', action: 'delete', user })}
                        >
                          <Trash2 />
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

      <Dialog open={modal?.type === 'confirm'} onOpenChange={(open) => !open && closeModal()}>
        {modal?.type === 'confirm' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {modal.action === 'delete' && 'تأكيد الحذف'}
                {modal.action === 'toggle' && (modal.user.isActive ? 'تأكيد الإيقاف' : 'تأكيد التفعيل')}
                {modal.action === 'reset-password' && 'تأكيد إعادة تعيين كلمة المرور'}
                {modal.action === 'reset-device' && 'تأكيد إعادة تعيين الجهاز'}
              </DialogTitle>
              <DialogDescription>
                {modal.action === 'delete' &&
                  `هل أنت متأكد من حذف ${modal.user.fullName}؟ لا يمكن التراجع عن هذا الإجراء.`}
                {modal.action === 'toggle' &&
                  (modal.user.isActive
                    ? `سيتم إيقاف حساب ${modal.user.fullName} ولن يتمكن من تسجيل الدخول.`
                    : `سيتم تفعيل حساب ${modal.user.fullName}.`)}
                {modal.action === 'reset-password' &&
                  `سيتم إعادة كلمة مرور ${modal.user.fullName} إلى القيمة الافتراضية.`}
                {modal.action === 'reset-device' &&
                  `سيتم فك ربط الجهاز الحالي لـ ${modal.user.fullName} ليتمكن من الدخول من جهاز جديد.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeModal}>
                إلغاء
              </button>
              <button
                type="button"
                className={`btn ${modal.action === 'delete' ? 'btn-danger' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => void runConfirm(modal.action, modal.user)}
              >
                {busy ? <Loader2 className="spin" /> : null}
                تأكيد
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={modal?.type === 'create'} onOpenChange={(open) => !open && closeModal()}>
        {modal?.type === 'create' && (
          <EmployeeFormDialog
            mode="create"
            departments={departments}
            offices={offices}
            busy={busy}
            onClose={closeModal}
            onSubmit={async (payload) => {
              setBusy(true)
              const toastId = notify.loading('جارٍ إضافة الموظف...')
              try {
                await registerUser(token, payload)
                notify.dismiss(toastId)
                notify.success(
                  'تم إضافة الموظف بنجاح',
                  'يمكن للموظف تسجيل الدخول باستخدام كوده وكلمة المرور.',
                )
                setModal(null)
                setPage(1)
                await invalidateUsers()
              } catch (err) {
                notify.dismiss(toastId)
                handleApiError(err, 'تعذر إضافة الموظف')
              } finally {
                setBusy(false)
              }
            }}
          />
        )}
      </Dialog>

      <Dialog open={modal?.type === 'update'} onOpenChange={(open) => !open && closeModal()}>
        {modal?.type === 'update' && (
          <EmployeeFormDialog
            key={`update-${modal.user.id}-${modal.draft ? 'draft' : 'initial'}`}
            mode="update"
            user={modal.user}
            draft={modal.draft}
            departments={departments}
            offices={offices}
            busy={busy}
            onClose={closeModal}
            onRequestConfirm={(update) =>
              setModal({ type: 'confirm-update', user: modal.user, update })
            }
          />
        )}
      </Dialog>

      <Dialog
        open={modal?.type === 'confirm-update'}
        onOpenChange={(open) => {
          if (!open && !busy && modal?.type === 'confirm-update') {
            setModal({ type: 'update', user: modal.user, draft: modal.update })
          }
        }}
      >
        {modal?.type === 'confirm-update' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد حفظ التغييرات</DialogTitle>
              <DialogDescription>
                هل تريد حفظ التعديلات على بيانات {modal.user.fullName}؟ سيتم تطبيق التغييرات
                فوراً.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  setModal({ type: 'update', user: modal.user, draft: modal.update })
                }
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runUpdateSave(modal.user, modal.update)}
              >
                {busy ? <Loader2 className="spin" /> : <Pencil />}
                تأكيد الحفظ
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

type FormPayload = RegisterUserInput

function EmployeeFormDialog({
  mode,
  user,
  draft,
  departments,
  offices,
  busy,
  onClose,
  onSubmit,
  onRequestConfirm,
}: {
  mode: 'create' | 'update'
  user?: UserRecord
  draft?: UpdatePayload
  departments: DepartmentOption[]
  offices: OfficeOption[]
  busy: boolean
  onClose: () => void
  onSubmit?: (payload: FormPayload) => Promise<void>
  onRequestConfirm?: (update: UpdatePayload) => void
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [employeeCode, setEmployeeCode] = useState(
    draft?.employeeCode ?? user?.employeeCode ?? '',
  )
  const [phoneNumber, setPhoneNumber] = useState(
    draft?.phoneNumber ?? user?.phoneNumber ?? '',
  )
  const [email, setEmail] = useState(
    (draft?.email ?? user?.email ?? '') as string,
  )
  const [password, setPassword] = useState('4444')
  const [role, setRole] = useState<Role>(user?.role ?? 'EMPLOYEE')
  const [points, setPoints] = useState(String(draft?.points ?? user?.points ?? 0))
  const [isActive, setIsActive] = useState(draft?.isActive ?? user?.isActive ?? true)
  const [departmentId, setDepartmentId] = useState(
    draft?.departmentId != null
      ? String(draft.departmentId)
      : user?.departmentId != null
        ? String(user.departmentId)
        : 'none',
  )
  const [officeId, setOfficeId] = useState(
    draft?.officeId != null
      ? String(draft.officeId)
      : user?.officeId != null
        ? String(user.officeId)
        : 'none',
  )
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const resolvedDepartmentId = departmentId === 'none' ? null : Number(departmentId)
    const resolvedOfficeId = officeId === 'none' ? null : Number(officeId)

    if (mode === 'create') {
      const parsed = registerUserSchema.safeParse({
        fullName,
        employeeCode,
        phoneNumber,
        password,
        role,
        email,
        departmentId: resolvedDepartmentId,
        officeId: resolvedOfficeId,
      })
      if (!parsed.success) {
        const msg = zodErrorMessage(parsed.error)
        setFormError(msg)
        notify.error(msg)
        return
      }
      await onSubmit?.(parsed.data)
      return
    }

    const parsed = updateUserSchema.safeParse({
      phoneNumber,
      email,
      employeeCode,
      points: Number(points),
      departmentId: resolvedDepartmentId,
      officeId: resolvedOfficeId,
      isActive,
    })
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setFormError(msg)
      notify.error(msg)
      return
    }
    onRequestConfirm?.(parsed.data)
  }

  return (
    <DialogContent>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'إضافة موظف جديد' : 'تحديث بيانات الموظف'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'أدخل بيانات الموظف الجديد لإنشاء حساب في النظام.'
              : `تعديل بيانات ${user?.fullName ?? ''}`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="employee-form">
          {mode === 'create' && (
            <label className="form-field">
              <span>الاسم الكامل *</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
          )}

          <label className="form-field">
            <span>كود الموظف *</span>
            <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          </label>

          <label className="form-field">
            <span>رقم الهاتف *</span>
            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
          </label>

          <label className="form-field">
            <span>البريد الإلكتروني</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="اختياري"
            />
          </label>

          {mode === 'create' && (
            <>
              <label className="form-field">
                <span>كلمة المرور *</span>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <div className="form-field">
                <span>الدور *</span>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger aria-label="الدور">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">موظف</SelectItem>
                    <SelectItem value="HR">موارد بشرية</SelectItem>
                    <SelectItem value="ADMIN">مدير النظام</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {mode === 'update' && (
            <>
              <label className="form-field">
                <span>النقاط</span>
                <input
                  type="number"
                  min={0}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                />
              </label>
              <label className="form-field form-field-check">
                <Checkbox
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                  id="employee-active"
                />
                <span>حساب نشط</span>
              </label>
            </>
          )}

          <div className="form-field">
            <span>الإدارة</span>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger aria-label="الإدارة">
                <SelectValue placeholder="بدون إدارة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون إدارة</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="form-field">
            <span>المكتب</span>
            <Select value={officeId} onValueChange={setOfficeId}>
              <SelectTrigger aria-label="المكتب">
                <SelectValue placeholder="بدون مكتب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون مكتب</SelectItem>
                {offices.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formError && <p className="form-error">{formError}</p>}
        </DialogBody>

        <DialogFooter>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 className="spin" /> : mode === 'create' ? <UserPlus /> : <Pencil />}
            {mode === 'create' ? 'إضافة' : 'حفظ'}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

export default EmployeesPage
