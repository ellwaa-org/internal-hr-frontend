import { QueryClient } from '@tanstack/react-query'

/** 30 minutes — shared cache/stale window for list data */
export const QUERY_STALE_TIME = 1000 * 60 * 30

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_STALE_TIME * 2,
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
    }) => [...queryKeys.attendance.all, 'list', params] as const,
  },
  profile: {
    me: ['profile', 'me'] as const,
  },
}
