import { QueryClient } from '@tanstack/react-query'

/** Frequent pages: الموظفون، الحضور والانصراف، المهام الخارجية */
export const QUERY_STALE_TIME_FREQUENT = 1000 * 60 * 5

/** Other pages: الإدارات، المكاتب، … */
export const QUERY_STALE_TIME_DEFAULT = 1000 * 60 * 30

/** @deprecated Prefer QUERY_STALE_TIME_DEFAULT or QUERY_STALE_TIME_FREQUENT */
export const QUERY_STALE_TIME = QUERY_STALE_TIME_DEFAULT

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_DEFAULT,
      gcTime: QUERY_STALE_TIME_DEFAULT * 2,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (params: {
      page: number
      limit: number
      search: string
      role: string
      status: string
    }) => [...queryKeys.users.all, 'list', params] as const,
    directory: (params?: { limit?: number; role?: string; search?: string }) =>
      [...queryKeys.users.all, 'directory', params ?? {}] as const,
  },
  departments: {
    all: ['departments'] as const,
    list: (params: { page: number; limit: number; search: string }) =>
      [...queryKeys.departments.all, 'list', params] as const,
    options: () => [...queryKeys.departments.all, 'options'] as const,
    users: (departmentId: number, params?: { page?: number; search?: string }) =>
      [...queryKeys.departments.all, 'users', departmentId, params ?? {}] as const,
  },
  offices: {
    all: ['offices'] as const,
    list: (params: {
      page: number
      limit: number
      search: string
      acceptRewards: string
      requireWifiCheck: string
    }) => [...queryKeys.offices.all, 'list', params] as const,
    options: () => [...queryKeys.offices.all, 'options'] as const,
    users: (officeId: number, params?: { page?: number; search?: string }) =>
      [...queryKeys.offices.all, 'users', officeId, params ?? {}] as const,
  },
  attendance: {
    all: ['attendance'] as const,
    list: (params: {
      page: number
      limit: number
      from: string
      to: string
      dayStatus: string
      officeId: string
      type?: string
      userId?: string
    }) => [...queryKeys.attendance.all, 'list', params] as const,
    users: (params: {
      page: number
      limit: number
      today: boolean
      from: string
      to: string
      status: string
      officeId: string
      departmentId: string
      type?: string
      search?: string
    }) => [...queryKeys.attendance.all, 'users', params] as const,
    detail: (id: string) => [...queryKeys.attendance.all, 'detail', id] as const,
    user: (
      userId: number,
      params: { page: number; limit: number; from: string; to: string; type?: string },
    ) => [...queryKeys.attendance.all, 'user', userId, params] as const,
  },
  profile: {
    me: ['profile', 'me'] as const,
  },
}
