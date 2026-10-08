import { hasAnyPermission, type Permission, type PermissionHolder } from './permissions'

export const NAV_PAGES = [
  'employees',
  'departments',
  'offices',
  'attendance',
  'tasks',
  'roles',
  'settings',
] as const

export type NavPage = (typeof NAV_PAGES)[number]

export const NAV_PATHS = {
  employees: '/employees',
  departments: '/departments',
  offices: '/offices',
  attendance: '/attendance',
  tasks: '/tasks',
  roles: '/roles',
  settings: '/settings',
} as const satisfies Record<NavPage, string>

export const NAV_TITLES: Record<NavPage, string> = {
  employees: 'الموظفون',
  departments: 'الإدارات',
  offices: 'المكاتب',
  attendance: 'الحضور والانصراف',
  tasks: 'المهام الخارجية',
  roles: 'الأدوار والصلاحيات',
  settings: 'الإعدادات',
}

/**
 * Permissions required to open each page (any-of). `null` = always visible to
 * signed-in users. Keys mirror specific backend pages, so hardcoding here is fine.
 */
export const NAV_PERMISSIONS: Record<NavPage, readonly Permission[] | null> = {
  employees: ['user.readAll'],
  departments: ['department.read', 'department.readAll'],
  offices: ['office.read', 'office.readAll'],
  attendance: ['attendance.readAll'],
  tasks: ['attendance.readAll'],
  roles: ['role.readAll', 'role.create', 'role.update', 'role.delete'],
  settings: null,
}

export function navPageFromPath(pathname: string): NavPage | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  for (const page of NAV_PAGES) {
    if (NAV_PATHS[page] === normalized) return page
  }
  return null
}

/** Access decision for a nav entry / route — permissions only, never role names. */
export function canAccessNavPage(user: PermissionHolder | null | undefined, page: NavPage): boolean {
  const required = NAV_PERMISSIONS[page]
  if (!required || required.length === 0) return true
  return hasAnyPermission(user, ...required)
}

export function visibleNavPages(user: PermissionHolder | null | undefined): NavPage[] {
  return NAV_PAGES.filter((page) => canAccessNavPage(user, page))
}

/** Landing page for redirects — first page the user can open (settings is the fallback). */
export function firstAllowedPage(user: PermissionHolder | null | undefined): NavPage {
  return visibleNavPages(user)[0] ?? 'settings'
}
