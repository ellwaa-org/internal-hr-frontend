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
} from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { queryKeys, QUERY_STALE_TIME_FREQUENT } from '@/lib/query-client'
import {
  registerUserSchema,
  updateUserSchema,
  zodErrorMessage,
} from '@/lib/schemas'
import { notify } from '@/lib/toast'
import { useDialogState } from '@/lib/use-dialog-state'
import { usePageParam } from '@/lib/use-page-param'
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
  const [page, setPage] = usePageParam()
  const [limit] = useState(20)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modal, setModal] = useState<ModalMode>(null)
  const [busy, setBusy] = useState(false)

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
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () =>
      listUsers(token, {
        page,
        limit,
        search: search.trim() || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
      }),
  })

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.options(),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () => listDepartmentOptions(token, { limit: 100 }),
  })

  const officesQuery = useQuery({
    queryKey: queryKeys.offices.options(),
    staleTime: QUERY_STALE_TIME_FREQUENT,
    refetchInterval: QUERY_STALE_TIME_FREQUENT,
    queryFn: () => listOfficeOptions(token, { limit: 100 }),
  })

  useEffect(() => {
    if (usersQuery.error) {
      handleApiError(usersQuery.error, 'تعذر تحميل قائمة الموظفين')
    }
  }, [usersQuery.error, handleApiError])

  const users = usersQuery.data?.data ?? []
  const total = usersQuery.data?.total ?? 0
  const totalPages = Math.max(1, usersQuery.data?.totalPages ?? 1)
  const loading = usersQuery.isLoading || (usersQuery.isFetching && users.length === 0)
  const departments = departmentsQuery.data ?? []
  const offices = officesQuery.data ?? []

  const invalidateUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
  }, [queryClient])

  const closeModal = () => {
    if (!busy) setModal(null)
  }

  const confirmDialog = useDialogState(modal?.type === 'confirm' ? modal : null)
  const createDialog = useDialogState(modal?.type === 'create' ? modal : null)
  const updateDialog = useDialogState(modal?.type === 'update' ? modal : null)
  const confirmUpdateDialog = useDialogState(modal?.type === 'confirm-update' ? modal : null)

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
    <PageShell>
      <PageHeader
        title="الموظفون"
        subtitle="إدارة حسابات الموظفين والصلاحيات"
        action={
          <Button type="button" onClick={() => setModal({ type: 'create' })} variant="primary" fullOnMobile>
            <Plus />
            إضافة موظف
          </Button>
        }
      />

      <FiltersBar>
        <SearchField
          value={search}
          placeholder="بحث بالاسم أو الكود أو الهاتف..."
          onChange={(e) => {
            setPage(1)
            setSearch(e.target.value)
          }}
        />

        <Select
          value={roleFilter}
          onValueChange={(value) => {
            setPage(1)
            setRoleFilter(value as 'all' | Role)
          }}
        >
          <SelectTrigger className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="تصفية حسب الدور">
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
          <SelectTrigger className="min-w-[150px] max-[720px]:w-full max-[720px]:min-w-0" aria-label="تصفية حسب الحالة">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="inactive">متوقف</SelectItem>
          </SelectContent>
        </Select>

        <div className="ms-auto flex flex-wrap items-center gap-2 max-[720px]:ms-0 max-[720px]:w-full [&_button]:max-[720px]:flex-1">
          <Button
            type="button"
            onClick={() => {
              setSearch('')
              setRoleFilter('all')
              setStatusFilter('all')
              setPage(1)
            }} variant="secondary"
            disabled={!search && roleFilter === 'all' && statusFilter === 'all'}
          >
            <RotateCcw />
            إعادة تعيين
          </Button>
          <Button
            type="button"
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
            }} variant="secondary" className="w-10 p-0"
            disabled={usersQuery.isFetching}
            aria-label="تحديث"
            title="تحديث"
          >
            {usersQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>
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
              <Th>كود الموظف</Th>
              <Th>الدور</Th>
              <Th>الهاتف</Th>
              <Th>البريد</Th>
              <Th>الحالة</Th>
              <Th>النقاط</Th>
              <Th>الجهاز</Th>
              <ThActions>إجراءات</ThActions>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <TableMessage colSpan={9}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل الموظفين...
              </TableMessage>
            ) : users.length === 0 ? (
              <TableMessage colSpan={9}>لا يوجد موظفون مطابقون</TableMessage>
            ) : (
              users.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold text-foreground">{user.fullName}</span>
                      {(user.department?.name || user.office?.name) && (
                        <span className="truncate text-xs text-muted">
                          {[user.department?.name, user.office?.name].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {user.employeeCode}
                    </code>
                  </Td>
                  <Td className="whitespace-nowrap">{ROLE_LABELS[user.role]}</Td>
                  <Td className="whitespace-nowrap text-muted">{user.phoneNumber || '—'}</Td>
                  <Td>
                    <span className="block max-w-[240px] truncate text-muted" title={user.email || undefined}>
                      {user.email || '—'}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                        user.isActive ? 'bg-success-soft text-success' : 'bg-danger-soft text-red-700',
                      )}
                    >
                      {user.isActive ? 'نشط' : 'متوقف'}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{user.points}</Td>
                  <Td className="text-muted">{user.deviceId ? 'مربوط' : '—'}</Td>
                  <TdActions>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label={`إجراءات ${user.fullName}`}
                          title="إجراءات"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-60">
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
                  </TdActions>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableSection>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          {confirmDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmDialog.data.action === 'delete' && 'تأكيد الحذف'}
                  {confirmDialog.data.action === 'toggle' &&
                    (confirmDialog.data.user.isActive ? 'تأكيد الإيقاف' : 'تأكيد التفعيل')}
                  {confirmDialog.data.action === 'reset-password' && 'تأكيد إعادة تعيين كلمة المرور'}
                  {confirmDialog.data.action === 'reset-device' && 'تأكيد إعادة تعيين الجهاز'}
                </DialogTitle>
                <DialogDescription>
                  {confirmDialog.data.action === 'delete' &&
                    `هل أنت متأكد من حذف ${confirmDialog.data.user.fullName}؟ لا يمكن التراجع عن هذا الإجراء.`}
                  {confirmDialog.data.action === 'toggle' &&
                    (confirmDialog.data.user.isActive
                      ? `سيتم إيقاف حساب ${confirmDialog.data.user.fullName} ولن يتمكن من تسجيل الدخول.`
                      : `سيتم تفعيل حساب ${confirmDialog.data.user.fullName}.`)}
                  {confirmDialog.data.action === 'reset-password' &&
                    `سيتم إعادة كلمة مرور ${confirmDialog.data.user.fullName} إلى القيمة الافتراضية.`}
                  {confirmDialog.data.action === 'reset-device' &&
                    `سيتم فك ربط الجهاز الحالي لـ ${confirmDialog.data.user.fullName} ليتمكن من الدخول من جهاز جديد.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" disabled={busy} onClick={closeModal} variant="secondary">
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant={confirmDialog.data.action === 'delete' ? 'danger' : 'primary'}
                  disabled={busy}
                  onClick={() => {
                    const data = confirmDialog.data
                    if (!data) return
                    void runConfirm(data.action, data.user)
                  }}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  تأكيد
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent size="md">
          {createDialog.data ? (
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
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={updateDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent size="md">
          {updateDialog.data ? (
            <EmployeeFormDialog
              key={`update-${updateDialog.data.user.id}-${updateDialog.data.draft ? 'draft' : 'initial'}`}
              mode="update"
              user={updateDialog.data.user}
              draft={updateDialog.data.draft}
              departments={departments}
              offices={offices}
              busy={busy}
              onClose={closeModal}
              onRequestConfirm={(update) => {
                const data = updateDialog.data
                if (!data) return
                setModal({ type: 'confirm-update', user: data.user, update })
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmUpdateDialog.open}
        onOpenChange={(open) => {
          if (!open && !busy && confirmUpdateDialog.data) {
            setModal({
              type: 'update',
              user: confirmUpdateDialog.data.user,
              draft: confirmUpdateDialog.data.update,
            })
          }
        }}
      >
        <DialogContent nested>
          {confirmUpdateDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد حفظ التغييرات</DialogTitle>
                <DialogDescription>
                  هل تريد حفظ التعديلات على بيانات {confirmUpdateDialog.data.user.fullName}؟ سيتم
                  تطبيق التغييرات فوراً.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmUpdateDialog.data
                    if (!data) return
                    setModal({ type: 'update', user: data.user, draft: data.update })
                  }}
                  variant="secondary"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmUpdateDialog.data
                    if (!data) return
                    void runUpdateSave(data.user, data.update)
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
    </PageShell>
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
  const [bio, setBio] = useState(
    (draft?.bio ?? user?.bio ?? '') as string,
  )
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
        bio,
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
      bio,
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
    <>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'إضافة موظف جديد' : 'تحديث بيانات الموظف'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'أدخل بيانات الموظف الجديد لإنشاء حساب في النظام.'
              : `تعديل بيانات ${user?.fullName ?? ''}`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
          {mode === 'create' && (
            <label className="flex flex-col gap-1.5 text-[13px] text-muted">
              <span>الاسم الكامل *</span>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            <span>كود الموظف *</span>
            <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            <span>رقم الهاتف *</span>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            <span>البريد الإلكتروني</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="اختياري"
            />
          </label>

          {mode === 'create' && (
            <>
              <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                <span>كلمة المرور *</span>
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <div className="flex flex-col gap-1.5 text-[13px] text-muted">
                <span>الدور *</span>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger className="w-full" aria-label="الدور">
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
              <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                <span>النقاط</span>
                <Input
                  type="number"
                  min={0}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                />
              </label>
              <label className="flex flex-row items-center gap-2.5 pt-7 text-[13px] text-muted">
                <Checkbox
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                  id="employee-active"
                />
                <span>حساب نشط</span>
              </label>
            </>
          )}

          <div className="flex flex-col gap-1.5 text-[13px] text-muted">
            <span>الإدارة</span>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full" aria-label="الإدارة">
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

          <div className="flex flex-col gap-1.5 text-[13px] text-muted">
            <span>المكتب</span>
            <Select value={officeId} onValueChange={setOfficeId}>
              <SelectTrigger className="w-full" aria-label="المكتب">
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

          <label className="col-span-full flex flex-col gap-1.5 text-[13px] text-muted">
            <span>النبذة</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="اختياري"
              rows={3}
              maxLength={500}
              className="min-h-[84px] w-full resize-y rounded-[10px] border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] disabled:cursor-not-allowed disabled:opacity-55"
            />
          </label>

          {formError && <p className="col-span-full m-0 text-[13px] font-semibold text-red-700">{formError}</p>}
        </DialogBody>

        <DialogFooter>
          <Button type="button" disabled={busy} onClick={onClose} variant="secondary">
            إلغاء
          </Button>
          <Button type="submit" disabled={busy} variant="primary">
            {busy ? <Loader2 className="animate-spin" /> : mode === 'create' ? <UserPlus /> : <Pencil />}
            {mode === 'create' ? 'إضافة' : 'حفظ'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

export default EmployeesPage
