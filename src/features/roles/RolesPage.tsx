import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  createRole,
  deleteRole,
  listPermissionCatalog,
  listRoles,
  updateRole,
  type RoleRecord,
} from '@/lib/api'
import type { z } from 'zod'
import { isForbiddenError, isUnauthorizedError } from '@/lib/errors'
import { queryKeys, QUERY_STALE_TIME_DEFAULT } from '@/lib/query-client'
import { createRoleSchema, updateRoleSchema, zodErrorMessage } from '@/lib/schemas'
import { groupPermissions, hasPermission, permissionLabel } from '@/lib/permissions'
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

type ModalMode =
  | null
  | { type: 'create' }
  | { type: 'edit'; role: RoleRecord }
  | { type: 'delete'; role: RoleRecord }

function RolesPage({
  token,
  permissions,
  onUnauthorized,
}: {
  token: string
  permissions: string[]
  onUnauthorized: () => void
}) {
  const queryClient = useQueryClient()
  const [page, setPage] = usePageParam()
  const [limit] = useState(10)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalMode>(null)
  const [busy, setBusy] = useState(false)

  const canCreate = hasPermission(permissions, 'role.create')
  const canUpdate = hasPermission(permissions, 'role.update')
  const canDelete = hasPermission(permissions, 'role.delete')

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
      listRoles(token, {
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

  const invalidateRoles = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.roles.all })
  }, [queryClient])

  const closeModal = () => {
    if (!busy) setModal(null)
  }

  const editorDialog = useDialogState(modal?.type === 'create' || modal?.type === 'edit' ? modal : null)
  const deleteDialog = useDialogState(modal?.type === 'delete' ? modal : null)

  const runSave = async (
    mode: { type: 'create' } | { type: 'edit'; role: RoleRecord },
    input: { name: string; description: string; permissions: string[] },
  ) => {
    setBusy(true)
    const toastId = notify.loading(mode.type === 'create' ? 'جارٍ إنشاء الدور...' : 'جارٍ حفظ الدور...')
    try {
      if (mode.type === 'create') {
        await createRole(token, input)
        notify.dismiss(toastId)
        notify.success('تم إنشاء الدور بنجاح')
      } else {
        // System roles: name is code-owned — never send it.
        const payload = mode.role.isSystem
          ? { description: input.description, permissions: input.permissions }
          : input
        await updateRole(token, mode.role.id, payload)
        notify.dismiss(toastId)
        notify.success('تم حفظ الدور')
      }
      setModal(null)
      await invalidateRoles()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, mode.type === 'create' ? 'تعذر إنشاء الدور' : 'تعذر حفظ الدور')
    } finally {
      setBusy(false)
    }
  }

  const runDelete = async (role: RoleRecord) => {
    setBusy(true)
    const toastId = notify.loading('جارٍ حذف الدور...')
    try {
      await deleteRole(token, role.id)
      notify.dismiss(toastId)
      notify.success(`تم حذف دور ${role.name}`)
      setModal(null)
      setPage(1)
      await invalidateRoles()
    } catch (err) {
      notify.dismiss(toastId)
      handleApiError(err, 'تعذر حذف الدور')
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
        title="الأدوار والصلاحيات"
        subtitle="إنشاء أدوار مخصصة وتحديد صلاحيات كل دور"
        action={
          canCreate ? (
            <Button type="button" onClick={() => setModal({ type: 'create' })} variant="primary" fullOnMobile>
              <Plus />
              إضافة دور
            </Button>
          ) : undefined
        }
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
              <ThActions>إجراءات</ThActions>
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
              roles.map((role) => {
                const deletable = canDelete && !role.isSystem && role.userCount === 0
                const hasActions = canUpdate || canDelete
                return (
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
                    <TdActions>
                      {hasActions ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`إجراءات ${role.name}`}
                              title="إجراءات"
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-60">
                            <DropdownMenuLabel>{role.name}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {canUpdate && (
                              <DropdownMenuItem onSelect={() => setModal({ type: 'edit', role })}>
                                <Pencil />
                                تعديل الصلاحيات
                              </DropdownMenuItem>
                            )}
                            {canDelete &&
                              (deletable ? (
                                <DropdownMenuItem
                                  variant="danger"
                                  onSelect={() => setModal({ type: 'delete', role })}
                                >
                                  <Trash2 />
                                  حذف
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled
                                  title={
                                    role.isSystem
                                      ? 'لا يمكن حذف الأدوار النظامية'
                                      : role.userCount > 0
                                        ? `لا يمكن حذف الدور: ${role.userCount} مستخدم ما زالوا مرتبطين به. أعد تعيينهم أولاً.`
                                        : undefined
                                  }
                                >
                                  <Trash2 />
                                  حذف
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TdActions>
                  </Tr>
                )
              })
            )}
          </tbody>
        </Table>
      </TableSection>

      <Dialog open={editorDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent size="lg">
          {editorDialog.data ? (
            editorDialog.data.type === 'edit' ? (
              <RoleEditorDialog
                key={`role-edit-${editorDialog.data.role.id}`}
                mode="edit"
                role={editorDialog.data.role}
                token={token}
                busy={busy}
                onClose={closeModal}
                onSubmit={(input) => {
                  const data = editorDialog.data
                  if (!data || data.type !== 'edit') return
                  void runSave({ type: 'edit', role: data.role }, input)
                }}
              />
            ) : (
              <RoleEditorDialog
                key="role-create"
                mode="create"
                token={token}
                busy={busy}
                onClose={closeModal}
                onSubmit={(input) => void runSave({ type: 'create' }, input)}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          {deleteDialog.data ? (
            <>
              <DialogHeader>
                <DialogTitle>تأكيد حذف الدور</DialogTitle>
                <DialogDescription>
                  هل أنت متأكد من حذف دور «{deleteDialog.data.role.name}»؟ لا يمكن التراجع عن هذا
                  الإجراء.
                </DialogDescription>
              </DialogHeader>
              {deleteDialog.data.role.userCount > 0 && (
                <p className="m-0 rounded-[10px] border border-red-200 bg-danger-soft px-3 py-2.5 text-sm text-red-700">
                  لا يمكن حذف الدور: {deleteDialog.data.role.userCount} مستخدم ما زالوا مرتبطين به.
                  أعد تعيينهم إلى دور آخر أولاً.
                </p>
              )}
              <DialogFooter>
                <Button type="button" disabled={busy} onClick={closeModal} variant="secondary">
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy || deleteDialog.data.role.userCount > 0}
                  onClick={() => void runDelete(deleteDialog.data!.role)}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  حذف الدور
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

/** Parse against a zod schema, surfacing the first Arabic error via notify. */
function validateOrNotify<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false } {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    notify.error(zodErrorMessage(parsed.error))
    return { ok: false }
  }
  return { ok: true, data: parsed.data }
}

function RoleEditorDialog({
  mode,
  role,
  token,
  busy,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  role?: RoleRecord
  token: string
  busy: boolean
  onClose: () => void
  onSubmit: (input: { name: string; description: string; permissions: string[] }) => void
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []))
  const [formError, setFormError] = useState<string | null>(null)

  const catalogQuery = useQuery({
    queryKey: queryKeys.roles.catalog(),
    staleTime: QUERY_STALE_TIME_DEFAULT,
    queryFn: () => listPermissionCatalog(token),
  })

  const groups = useMemo(
    () => groupPermissions(catalogQuery.data ?? []),
    [catalogQuery.data],
  )

  const catalogSelectedCount = useMemo(
    () => (catalogQuery.data ?? []).filter((key) => selected.has(key)).length,
    [catalogQuery.data, selected],
  )
  const catalogSize = catalogQuery.data?.length ?? 0
  const allSelected = catalogSize > 0 && catalogSelectedCount === catalogSize
  const someSelected = catalogSelectedCount > 0 && !allSelected

  const togglePermission = (key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleGroup = (keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  const toggleAll = (on: boolean) => toggleGroup(catalogQuery.data ?? [], on)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const schema = mode === 'create' ? createRoleSchema : updateRoleSchema
    const raw =
      mode === 'create' || !role?.isSystem
        ? { name: name.trim(), description: description.trim(), permissions: [...selected] }
        : { description: description.trim(), permissions: [...selected] }

    const result = validateOrNotify(schema, raw)
    if (!result.ok) {
      setFormError('يرجى تصحيح الأخطاء في النموذج.')
      return
    }
    // For system roles the name never leaves the form; for others pass it through.
    onSubmit(raw as { name: string; description: string; permissions: string[] })
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'إضافة دور جديد' : `تعديل دور ${role?.name ?? ''}`}</DialogTitle>
        <DialogDescription>
          {mode === 'create'
            ? 'أدخل اسم الدور وحدد الصلاحيات التي يمنحها للمستخدمين.'
            : 'حدد الصلاحيات الممنوحة لهذا الدور. التغييرات تنطبق فوراً على المستخدمين المرتبطين به.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        {role?.isSystem && (
          <div className="m-0 flex items-start gap-2.5 rounded-[10px] border border-warning-soft bg-warning-soft/40 px-3.5 py-3 text-[13px] leading-relaxed text-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              هذا دور نظامي. أي تعديل على صلاحياته سيُعاد إلى الإعدادات الافتراضية عند إعادة تشغيل
              الخادم، ولا يمكن تغيير اسمه أو حذفه.
            </span>
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>اسم الدور *</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy || (mode === 'edit' && role?.isSystem)}
            placeholder="مثال: TEAM_LEAD"
            dir="ltr"
            className="text-start"
          />
          {mode === 'edit' && (
            <span className="text-xs text-muted">
              {role?.isSystem
                ? 'دور نظامي — لا يمكن تغيير الاسم.'
                : 'اسم الدور يُستخدم عند تعيينه للموظفين.'}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span>الوصف</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر لدور هذا الدور (اختياري)"
            rows={2}
            maxLength={255}
            disabled={busy}
            className="min-h-[56px] w-full resize-y rounded-[10px] border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] disabled:cursor-not-allowed disabled:opacity-55"
          />
        </label>

        <div className="flex flex-col gap-2 text-[13px] text-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground">الصلاحيات *</span>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-hover">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) => toggleAll(checked === true)}
                disabled={busy || catalogSize === 0}
                id="role-permissions-all"
                aria-label="تحديد كل الصلاحيات"
              />
              <span>تحديد الكل ({catalogSelectedCount}/{catalogSize})</span>
            </label>
          </div>

          {catalogQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-border px-3.5 py-4 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل دليل الصلاحيات...
            </div>
          ) : catalogQuery.error ? (
            <div className="rounded-[10px] border border-red-200 bg-danger-soft px-3.5 py-3 text-sm text-red-700">
              تعذر تحميل دليل الصلاحيات. أغلق النافذة وحاول مرة أخرى.
            </div>
          ) : catalogSize === 0 ? (
            <div className="rounded-[10px] border border-border px-3.5 py-3 text-sm text-muted">
              لا توجد صلاحيات متاحة في النظام.
            </div>
          ) : (
            <div className="flex max-h-[320px] flex-col gap-2.5 overflow-auto rounded-[10px] border border-border p-2.5">
              {groups.map((group) => {
                const groupSelected = group.permissions.filter((key) => selected.has(key)).length
                const groupAll = groupSelected === group.permissions.length
                const groupSome = groupSelected > 0 && !groupAll
                return (
                  <div key={group.module} className="rounded-lg border border-border">
                    <label className="flex cursor-pointer items-center gap-2.5 border-b border-border bg-hover/40 px-2.5 py-2 text-sm font-semibold text-foreground">
                      <Checkbox
                        checked={groupAll ? true : groupSome ? 'indeterminate' : false}
                        onCheckedChange={(checked) => toggleGroup(group.permissions, checked === true)}
                        disabled={busy}
                        id={`role-group-${group.module}`}
                        aria-label={`تحديد كل صلاحيات ${group.label}`}
                      />
                      <ShieldCheck className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{group.label}</span>
                      <span className="shrink-0 text-xs font-normal text-muted">
                        {groupSelected}/{group.permissions.length}
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1.5 max-[720px]:grid-cols-1">
                      {group.permissions.map((key) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm text-foreground hover:bg-hover"
                        >
                          <Checkbox
                            checked={selected.has(key)}
                            onCheckedChange={(checked) => togglePermission(key, checked === true)}
                            disabled={busy}
                            id={`role-perm-${key}`}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate" title={permissionLabel(key)}>
                              {permissionLabel(key)}
                            </span>
                            <code className="truncate font-mono text-[11px] text-muted" dir="ltr">
                              {key}
                            </code>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {formError && <p className="m-0 text-[13px] font-semibold text-red-700">{formError}</p>}
      </DialogBody>

      <DialogFooter>
        <Button type="button" disabled={busy} onClick={onClose} variant="secondary">
          إلغاء
        </Button>
        <Button type="submit" disabled={busy} variant="primary">
          {busy ? <Loader2 className="animate-spin" /> : mode === 'create' ? <Plus /> : <Pencil />}
          {mode === 'create' ? 'إضافة' : 'حفظ'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export default RolesPage
