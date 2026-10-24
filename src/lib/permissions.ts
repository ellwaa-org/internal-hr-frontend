/**
 * Permission-based access control (RBAC).
 *
 * Access decisions must ALWAYS go through these helpers — never compare
 * `role` names. `role` stays for display only (badges, labels).
 */

export type Permission = string

export interface PermissionHolder {
  permissions?: string[] | null
}

/** Accepts either the raw permission array or an object carrying it (e.g. Profile). */
export type PermissionSource = string[] | PermissionHolder | null | undefined

function permissionsOf(source: PermissionSource): string[] {
  if (!source) return []
  if (Array.isArray(source)) return source
  return source.permissions ?? []
}

export function hasPermission(user: PermissionSource, perm: Permission): boolean {
  return permissionsOf(user).includes(perm)
}

/** Allow if the user holds ANY of the listed permissions (matches backend requirePermission). */
export function hasAnyPermission(user: PermissionSource, ...perms: Permission[]): boolean {
  return permissionsOf(user).some((p) => perms.includes(p))
}

/**
 * Permission guard hook — resolves against the session's permission list.
 * Pages that already receive `permissions` as a prop can pass it directly.
 */
export function usePermission(permissions: PermissionSource, perm: Permission): boolean {
  return hasAnyPermission(permissions, perm)
}

/** Any-of variant: true when the user holds at least one listed permission. */
export function useAnyPermission(
  permissions: PermissionSource,
  ...required: Permission[]
): boolean {
  return hasAnyPermission(permissions, ...required)
}

/* ---------- Display helpers (role names are free-form strings now) ---------- */

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدير النظام',
  HR: 'موارد بشرية',
  EMPLOYEE: 'موظف',
}

/** Arabic label for the system roles; custom roles show their raw name. */
export function roleLabel(role?: string | null): string {
  if (!role) return ''
  return SYSTEM_ROLE_LABELS[role] ?? role
}

/* ---------- Permission catalog presentation (fetched from GET /roles/permissions) ---------- */

export interface PermissionGroup {
  /** Module prefix of the permission keys, e.g. "user" for "user.create". */
  module: string
  /** Arabic label for the module. */
  label: string
  permissions: string[]
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'اللوحة',
  user: 'المستخدمين',
  role: 'الأدوار',
  department: 'الإدارات',
  office: 'المكاتب',
  attendance: 'الحضور والانصراف',
  food: 'الوجبات',
  customRequest: 'الطلبات المخصصة',
  securityLog: 'سجلات الأمان',
  auditLog: 'سجل التغييرات',
}

/** Simple CRUD verbs compose with the module noun ("create" + "المستخدمين"). */
const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  read: 'عرض',
  readAll: 'عرض جميع',
  update: 'تعديل',
  delete: 'حذف',
  assign: 'تعيين',
  export: 'تصدير',
}

/** Compound actions that don't compose generically — exact key matches. */
const COMPOUND_PERMISSION_LABELS: Record<string, string> = {
  'dashboard.access': 'الوصول إلى لوحة التحكم',
  'attendance.self': 'تسجيل حضوره الذاتي',
  'attendance.taskUpdateAny': 'تعديل مهام أي موظف',
  'attendance.taskEndAny': 'إغلاق مهام أي موظف',
  'attendance.justificationManage': 'إدارة تبريرات الحضور',
  'user.resetPassword': 'إعادة تعيين كلمات المرور',
  'user.resetDevice': 'إعادة تعيين الأجهزة',
  'user.toggleStatus': 'تفعيل/إيقاف الحسابات',
  'food.orderCreate': 'إنشاء طلبات وجبات',
  'food.orderRead': 'عرض طلبات الوجبات',
  'food.orderReadAll': 'عرض جميع طلبات الوجبات',
  'food.orderUpdate': 'تعديل طلبات الوجبات',
  'food.transactionRead': 'عرض معاملات الوجبات',
  'food.transactionReadAll': 'عرض جميع معاملات الوجبات',
  'food.restaurantCreate': 'إنشاء المطاعم',
  'food.restaurantUpdate': 'تعديل المطاعم',
  'food.restaurantDelete': 'حذف المطاعم',
  'food.menuCreate': 'إنشاء قوائم الطعام',
  'food.menuUpdate': 'تعديل قوائم الطعام',
  'food.menuDelete': 'حذف قوائم الطعام',
}

/** Human-readable Arabic label for a permission key; falls back to the raw key. */
export function permissionLabel(key: string): string {
  const exact = COMPOUND_PERMISSION_LABELS[key]
  if (exact) return exact

  const dot = key.indexOf('.')
  const module = dot > 0 ? key.slice(0, dot) : ''
  const action = dot > 0 ? key.slice(dot + 1) : key
  const noun = module ? MODULE_LABELS[module] : undefined
  const verb = ACTION_LABELS[action]
  if (noun && verb) return `${verb} ${noun}`
  return key
}

/**
 * Groups a fetched permission catalog by module prefix. The catalog is dynamic
 * (it comes from the backend), so unknown modules fall back to the raw prefix.
 */
export function groupPermissions(catalog: string[]): PermissionGroup[] {
  const groups = new Map<string, string[]>()
  for (const key of catalog) {
    if (!key) continue
    const dot = key.indexOf('.')
    const module = dot > 0 ? key.slice(0, dot) : key
    const list = groups.get(module)
    if (list) list.push(key)
    else groups.set(module, [key])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, permissions]) => ({
      module,
      label: MODULE_LABELS[module] ?? module,
      permissions,
    }))
}
