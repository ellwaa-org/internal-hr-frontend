import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
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
} from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { queryKeys, QUERY_STALE_TIME_DEFAULT } from '@/lib/query-client'
import { createDepartmentSchema, zodErrorMessage } from '@/lib/schemas'
import { notify } from '@/lib/toast'
import { useDialogState } from '@/lib/use-dialog-state'
import { Button } from '@/components/ui/button'
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
import { SearchableSelect } from '@/components/ui/searchable-select'

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
  const [limit] = useState(20)
  const [search, setSearch] = useState('')
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
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
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
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
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
    staleTime: QUERY_STALE_TIME_DEFAULT,
    refetchInterval: QUERY_STALE_TIME_DEFAULT,
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

  const formDialog = useDialogState(
    modal?.type === 'create' || modal?.type === 'edit' ? modal : null,
  )
  const confirmCreateDialog = useDialogState(modal?.type === 'confirm-create' ? modal : null)
  const confirmEditDialog = useDialogState(modal?.type === 'confirm-edit' ? modal : null)
  const deleteDialog = useDialogState(modal?.type === 'delete' ? modal : null)
  const membersDialog = useDialogState(modal?.type === 'members' ? modal : null)
  const confirmAssignDialog = useDialogState(modal?.type === 'confirm-assign' ? modal : null)
  const confirmUnassignDialog = useDialogState(modal?.type === 'confirm-unassign' ? modal : null)

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
    <PageShell>
      <PageHeader
        title="الإدارات"
        subtitle="إنشاء الإدارات وتعيين الموظفين لها"
        action={
          <Button type="button" onClick={openCreate} variant="primary" fullOnMobile>
            <Plus />
            إضافة إدارة
          </Button>
        }
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
              <ThActions>إجراءات</ThActions>
            </tr>
          </thead>
          <tbody>
            {loading && departments.length === 0 ? (
              <TableMessage colSpan={3}>
                <Loader2 className="me-2 inline-block animate-spin align-[-3px]" />
                جارٍ تحميل الإدارات...
              </TableMessage>
            ) : departments.length === 0 ? (
              <TableMessage colSpan={3}>لا توجد إدارات</TableMessage>
            ) : (
              departments.map((dept) => {
                const count = dept.usersCount ?? dept.users?.length ?? 0
                return (
                  <Tr key={dept.id}>
                    <Td>
                      <span className="font-semibold text-foreground">{dept.name}</span>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="inline-flex h-8 min-w-[42px] cursor-pointer items-center justify-center rounded-full border border-border bg-white px-2.5 text-[13px] font-bold tabular-nums text-foreground transition-colors hover:border-neutral-300 hover:bg-hover"
                        onClick={() => openMembers(dept)}
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
                            aria-label={`إجراءات ${dept.name}`}
                            title="إجراءات"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-60">
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
            <form onSubmit={requestNameSave}>
              <DialogHeader>
                <DialogTitle>
                  {formDialog.data.type === 'create' ? 'إضافة إدارة' : 'تعديل اسم الإدارة'}
                </DialogTitle>
                <DialogDescription>
                  {formDialog.data.type === 'create'
                    ? 'أدخل اسم الإدارة الجديدة.'
                    : `تعديل اسم ${formDialog.data.department.name}`}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
                <label className="flex flex-col gap-1.5 text-[13px] text-muted col-span-full">
                  <span>اسم الإدارة *</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
            setName(confirmCreateDialog.data.name)
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
                  هل تريد إنشاء إدارة باسم «{confirmCreateDialog.data.name}»؟
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmCreateDialog.data
                    if (!data) return
                    setName(data.name)
                    setModal({ type: 'create' })
                  }}
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
                    void runCreate(data.name)
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
            setName(confirmEditDialog.data.name)
            setModal({ type: 'edit', department: confirmEditDialog.data.department })
          }
        }}
      >
        <DialogContent nested>
          {confirmEditDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد حفظ التغييرات</DialogTitle>
                <DialogDescription>
                  هل تريد حفظ الاسم الجديد «{confirmEditDialog.data.name}» لإدارة{' '}
                  {confirmEditDialog.data.department.name}؟
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmEditDialog.data
                    if (!data) return
                    setName(data.name)
                    setModal({ type: 'edit', department: data.department })
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
                    void runEdit(data.department, data.name)
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

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          {deleteDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد الحذف</DialogTitle>
                <DialogDescription>
                  هل أنت متأكد من حذف إدارة {deleteDialog.data.department.name}؟ سيتم فك ربط
                  الموظفين بها.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" disabled={busy} onClick={closeModal} variant="secondary">
                  إلغاء
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = deleteDialog.data
                    if (!data) return
                    void runDelete(data.department)
                  }}
                  variant="danger"
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  حذف
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
                <DialogTitle>موظفو {membersDialog.data.department.name}</DialogTitle>
                <DialogDescription>
                  عيّن موظفين للإدارة أو أزلهم منها. التعيين ينقل الموظف من إدارته الحالية إن وُجدت.
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
                          u.department?.name ? ` — ${u.department.name}` : ''
                        }`,
                        keywords: `${u.fullName} ${u.employeeCode} ${u.department?.name ?? ''}`,
                      }))}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={busy || !assignUserId}
                    onClick={() => {
                      const data = membersDialog.data
                      if (!data) return
                      requestAssign(data.department)
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
                    <div className="p-7 text-center text-[13px] text-muted">لا يوجد موظفون في هذه الإدارة</div>
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
                              department: data.department,
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
            setModal({ type: 'members', department: confirmAssignDialog.data.department })
          }
        }}
      >
        <DialogContent nested>
          {confirmAssignDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد التعيين</DialogTitle>
                <DialogDescription>
                  هل تريد تعيين {confirmAssignDialog.data.userLabel} في إدارة{' '}
                  {confirmAssignDialog.data.department.name}؟
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmAssignDialog.data
                    if (!data) return
                    setModal({ type: 'members', department: data.department })
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
                    void runAssign(data.department, data.userId)
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
            setModal({ type: 'members', department: confirmUnassignDialog.data.department })
          }
        }}
      >
        <DialogContent nested>
          {confirmUnassignDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد الإزالة</DialogTitle>
                <DialogDescription>
                  هل تريد إزالة {confirmUnassignDialog.data.user.fullName} من إدارة{' '}
                  {confirmUnassignDialog.data.department.name}؟
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const data = confirmUnassignDialog.data
                    if (!data) return
                    setModal({ type: 'members', department: data.department })
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
                    void runUnassign(data.department, data.user)
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

export default DepartmentsPage
