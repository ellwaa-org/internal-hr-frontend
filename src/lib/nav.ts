export const NAV_PAGES = [
  'employees',
  'departments',
  'offices',
  'attendance',
  'tasks',
  'settings',
] as const

export type NavPage = (typeof NAV_PAGES)[number]

export const NAV_PATHS = {
  employees: '/employees',
  departments: '/departments',
  offices: '/offices',
  attendance: '/attendance',
  tasks: '/tasks',
  settings: '/settings',
} as const satisfies Record<NavPage, string>

export const NAV_TITLES: Record<NavPage, string> = {
  employees: 'الموظفون',
  departments: 'الإدارات',
  offices: 'المكاتب',
  attendance: 'الحضور والانصراف',
  tasks: 'المهام الخارجية',
  settings: 'الإعدادات',
}

export function navPageFromPath(pathname: string): NavPage | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  for (const page of NAV_PAGES) {
    if (NAV_PATHS[page] === normalized) return page
  }
  return null
}
