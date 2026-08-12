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
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import {
  assignUserToDepartment,
  createDepartment,
  deleteDepartment,
  listDepartmentUsers,
  listDepartments,
  listUsers,
  unassignUserFromDepartment,
  updateDepartment,
  type DepartmentRecord,
  type UserRecord,
} from './lib/api'
import { isUnauthorizedError } from './lib/errors'
import { queryKeys, QUERY_STALE_TIME } from './lib/query-client'
import { createDepartmentSchema, zodErrorMessage } from './lib/schemas'
import { notify } from './lib/toast'
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
  | { type: 'edit'; department: DepartmentRecord }
  | { type: 'confirm-create'; name: string }
  | { type: 'confirm-edit'; department: DepartmentRecord; name: string }
  | { type: 'delete'; department: DepartmentRecord }
  | { type: 'members'; department: DepartmentRecord }
  | {
      type: 'confirm-assign'
      department: DepartmentRecord
      userId: number
      userLabel: string
    }
  | { type: 'confirm-unassign'; department: DepartmentRecord; user: UserRecord }

function DepartmentsPage({
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
  const [modal, setModal] = useState<ModalMode>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
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
    () => ({ page, limit, search: search.trim() }),
    [page, limit, search],
  )

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.list(listParams),
    staleTime: QUERY_STALE_TIME,
    queryFn: () =>
      listDepartments(token, {
        page,
        limit,
        search: search.trim() || undefined,
      }),
  })

  const membersDept =
    modal?.type === 'members' ||
    modal?.type === 'confirm-unassign' ||
    modal?.type === 'confirm-assign'
      ? modal.department
      : null
  const membersDeptId = membersDept?.id ?? null

  const membersQuery = useQuery({
    queryKey: queryKeys.departments.users(membersDeptId ?? 0, {
      search: membersSearch.trim(),
    }),
    staleTime: QUERY_STALE_TIME,
    enabled: membersDeptId != null,
    queryFn: () =>
      listDepartmentUsers(token, membersDeptId!, {
        page: 1,
        limit: 100,
        search: membersSearch.trim() || undefined,
      }),
  })

  const assignCandidatesQuery = useQuery({
    queryKey: [...queryKeys.users.all, 'for-department-assign', membersDeptId],
    staleTime: QUERY_STALE_TIME,
    enabled: membersDeptId != null,
    queryFn: () => listUsers(token, { page: 1, limit: 100 }),
  })

  useEffect(() => {
    if (departmentsQuery.error) {
      handleApiError(departmentsQuery.error, 'تعذر تحميل الإدارات')
    }
  }, [departmentsQuery.error, handleApiError])

  useEffect(() => {
    if (membersQuery.error) {
      handleApiError(membersQuery.error, 'تعذر تحميل موظفي الإدارة')
    }
  }, [membersQuery.error, handleApiError])

  const departments = departmentsQuery.data?.data ?? []
  const total = departmentsQuery.data?.total ?? 0
  const totalPages = Math.max(1, departmentsQuery.data?.totalPages ?? 1)
  const loading = departmentsQuery.isLoading || departmentsQuery.isFetching

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.departments.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
    ])
  }, [queryClient])

  const closeModal = () => {
    if (!busy) {
      setModal(null)
      setName('')
      setAssignUserId('')
      setMembersSearch('')
      setFormError(null)
    }
  }

  const openCreate = () => {
    setName('')
    setFormError(null)
    setModal({ type: 'create' })
  }

  const openEdit = (department: DepartmentRecord) => {
    setName(department.name)
    setFormError(null)
    setModal({ type: 'edit', department })
  }

  const openMembers = (department: DepartmentRecord) => {
    setAssignUserId('')
    setMembersSearch('')
    setFormError(null)
    setModal({ type: 'members', department })
  }

  const requestNameSave = (event: FormEvent) => {
    event.preventDefault()
    if (!modal || (modal.type !== 'create' && modal.type !== 'edit')) return
    setFormError(null)
    const parsed = createDepartmentSchema.safeParse({ name })
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setFormError(msg)
      notify.error(msg)
      return
    }
    if (modal.type === 'create') {
      setModal({ type: 'confirm-create', name: parsed.data.name })
    } else {
      setModal({ type: 'confirm-edit', department: modal.department, name: parsed.data.name })
    }
  }

  const runCreate = async (deptName: string) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ إنشاء الإدارة...')
    try {
      await createDepartment(token, { name: deptName })
      notify.dismiss(toastId)
      notify.success('تم إنشاء الإدارة بنجاح')
      setModal(null)
      setName('')
      setPage(1)
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر حفظ الإدارة')
    } finally {
      setBusy(false)
    }
  }

  const runEdit = async (department: DepartmentRecord, deptName: string) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ حفظ التعديلات...')
    try {
      await updateDepartment(token, department.id, { name: deptName })
      notify.dismiss(toastId)
      notify.success(`تم تحديث ${deptName}`)
      setModal(null)
      setName('')
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر حفظ الإدارة')
    } finally {
      setBusy(false)
    }
  }

  const runDelete = async (department: DepartmentRecord) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ حذف الإدارة...')
    try {
      await deleteDepartment(token, department.id)
      notify.dismiss(toastId)
      notify.success(`تم حذف ${department.name}`, 'تم فك ربط الموظفين بهذه الإدارة.')
      setModal(null)
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر حذف الإدارة')
    } finally {
      setBusy(false)
    }
  }

  const requestAssign = (department: DepartmentRecord) => {
    const userId = Number(assignUserId)
    if (!userId) {
      setFormError('اختر موظفاً للتعيين.')
      return
    }
    const user = (assignCandidatesQuery.data?.data ?? []).find((u) => u.id === userId)
    setFormError(null)
    setModal({
      type: 'confirm-assign',
      department,
      userId,
      userLabel: user ? `${user.fullName} (${user.employeeCode})` : String(userId),
    })
  }

  const runAssign = async (department: DepartmentRecord, userId: number) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ تعيين الموظف...')
    try {
      await assignUserToDepartment(token, department.id, userId)
      notify.dismiss(toastId)
      notify.success('تم تعيين الموظف للإدارة')
      setAssignUserId('')
      setModal({ type: 'members', department })
      await invalidate()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر تعيين الموظف')
    } finally {
      setBusy(false)
    }
  }

  const runUnassign = async (department: DepartmentRecord, user: UserRecord) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ فك التعيين...')
    try {
      await unassignUserFromDepartment(token, user.id)
      notify.dismiss(toastId)
      notify.success(`تم فك تعيين ${user.fullName}`)
      setModal({ type: 'members', department })
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
  const assignCandidates = (assignCandidatesQuery.data?.data ?? []).filter(
    (u) => !memberIds.has(u.id) && u.departmentId !== membersDeptId,
  )

  return (
    <div className="employees-page">
      <div className="employees-toolbar">
        <div className="employees-toolbar-text">
          <h1 className="employees-title">الإدارات</h1>
          <p className="employees-subtitle">إنشاء الإدارات وتعيين الموظفين لها</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus />
          إضافة إدارة
        </button>
      </div>

      <div className="employees-filters">
        <label className="employees-search">
          <Search />
          <input
            type="search"
            value={searchInput}
            placeholder="بحث باسم الإدارة..."
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1)
                setSearch(searchInput)
              }
            }}
          />
        </label>
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
            setPage(1)
          }}
          disabled={!searchInput && !search}
        >
          <RotateCcw />
          إعادة تعيين
        </button>
        <button
          type="button"
          className="btn btn-secondary"
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
          }}
          disabled={departmentsQuery.isFetching}
          aria-label="تحديث"
        >
          {departmentsQuery.isFetching ? <Loader2 className="spin" /> : <RefreshCw />}
          تحديث
        </button>
      </div>

      <div className="employees-table-wrap">
        <table className="employees-table table-compact">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>عدد الموظفين</th>
              <th className="col-actions">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && departments.length === 0 ? (
              <tr>
                <td colSpan={3} className="employees-empty">
                  <Loader2 className="spin" />
                  جارٍ تحميل الإدارات...
                </td>
              </tr>
            ) : departments.length === 0 ? (
              <tr>
                <td colSpan={3} className="employees-empty">
                  لا توجد إدارات
                </td>
              </tr>
            ) : (
              departments.map((dept) => {
                const count = dept.usersCount ?? dept.users?.length ?? 0
                return (
                  <tr key={dept.id}>
                    <td>
                      <span className="employee-name">{dept.name}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="count-link"
                        onClick={() => openMembers(dept)}
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
                          <DropdownMenuLabel>{dept.name}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => openEdit(dept)}>
                            <Pencil />
                            تعديل الاسم
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openMembers(dept)}>
                            <UserPlus />
                            إدارة الموظفين
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="danger"
                            onSelect={() => setModal({ type: 'delete', department: dept })}
                          >
                            <Trash2 />
                            حذف
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
            <form onSubmit={requestNameSave}>
              <DialogHeader>
                <DialogTitle>
                  {modal.type === 'create' ? 'إضافة إدارة' : 'تعديل اسم الإدارة'}
                </DialogTitle>
                <DialogDescription>
                  {modal.type === 'create'
                    ? 'أدخل اسم الإدارة الجديدة.'
                    : `تعديل اسم ${modal.department.name}`}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="employee-form">
                <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <span>اسم الإدارة *</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
            setName(modal.name)
            setModal({ type: 'create' })
          }
        }}
      >
        {modal?.type === 'confirm-create' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الإضافة</DialogTitle>
              <DialogDescription>
                هل تريد إنشاء إدارة باسم «{modal.name}»؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setName(modal.name)
                  setModal({ type: 'create' })
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runCreate(modal.name)}
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
            setName(modal.name)
            setModal({ type: 'edit', department: modal.department })
          }
        }}
      >
        {modal?.type === 'confirm-edit' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد حفظ التغييرات</DialogTitle>
              <DialogDescription>
                هل تريد حفظ الاسم الجديد «{modal.name}» لإدارة {modal.department.name}؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setName(modal.name)
                  setModal({ type: 'edit', department: modal.department })
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runEdit(modal.department, modal.name)}
              >
                {busy ? <Loader2 className="spin" /> : <Pencil />}
                تأكيد الحفظ
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={modal?.type === 'delete'} onOpenChange={(open) => !open && closeModal()}>
        {modal?.type === 'delete' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الحذف</DialogTitle>
              <DialogDescription>
                هل أنت متأكد من حذف إدارة {modal.department.name}؟ سيتم فك ربط الموظفين بها.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeModal}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void runDelete(modal.department)}
              >
                {busy ? <Loader2 className="spin" /> : <Trash2 />}
                حذف
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={modal?.type === 'members'}
        onOpenChange={(open) => !open && closeModal()}
      >
        {modal?.type === 'members' && (
          <DialogContent className="members-overlay">
            <DialogHeader>
              <DialogTitle>موظفو {modal.department.name}</DialogTitle>
              <DialogDescription>
                عيّن موظفين للإدارة أو أزلهم منها. التعيين ينقل الموظف من إدارته الحالية إن وُجدت.
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
                          {u.department?.name ? ` — ${u.department.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !assignUserId}
                  onClick={() => requestAssign(modal.department)}
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
                  <div className="members-empty">لا يوجد موظفون في هذه الإدارة</div>
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
                            department: modal.department,
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
            setModal({ type: 'members', department: modal.department })
          }
        }}
      >
        {modal?.type === 'confirm-assign' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد التعيين</DialogTitle>
              <DialogDescription>
                هل تريد تعيين {modal.userLabel} في إدارة {modal.department.name}؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setModal({ type: 'members', department: modal.department })}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runAssign(modal.department, modal.userId)}
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
            setModal({ type: 'members', department: modal.department })
          }
        }}
      >
        {modal?.type === 'confirm-unassign' && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الإزالة</DialogTitle>
              <DialogDescription>
                هل تريد إزالة {modal.user.fullName} من إدارة {modal.department.name}؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setModal({ type: 'members', department: modal.department })}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runUnassign(modal.department, modal.user)}
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

export default DepartmentsPage
