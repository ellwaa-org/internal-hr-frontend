const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api').replace(
  /\/$/,
  '',
)

const TOKEN_KEY = 'hr_access_token'
const DEVICE_KEY = 'hr_device_id'

import { translateErrorMessage } from './errors'
import {
  createDepartmentSchema,
  createOfficeSchema,
  listAttendanceParamsSchema,
  listDepartmentsParamsSchema,
  listOfficesParamsSchema,
  listUsersParamsSchema,
  loginSchema,
  parseOrThrow,
  registerUserSchema,
  updateDepartmentSchema,
  updateOfficeSchema,
  updateUserSchema,
  type AttendanceRecord,
  type CreateDepartmentInput,
  type CreateOfficeInput,
  type DayStatus,
  type DepartmentOption,
  type DepartmentRecord,
  type ListAttendanceParams,
  type ListDepartmentsParams,
  type ListOfficesParams,
  type ListUsersParams,
  type LoginInput,
  type OfficeOption,
  type OfficeRecord,
  type PaginatedAttendance,
  type PaginatedDepartments,
  type PaginatedOffices,
  type PaginatedUsers,
  type Profile,
  type RegisterUserInput,
  type Role,
  type UpdateDepartmentInput,
  type UpdateOfficeInput,
  type UpdateUserInput,
  type UserRecord,
} from './schemas'

export type {
  AttendanceRecord,
  CreateDepartmentInput,
  CreateOfficeInput,
  DayStatus,
  DepartmentOption,
  DepartmentRecord,
  ListAttendanceParams,
  ListDepartmentsParams,
  ListOfficesParams,
  ListUsersParams,
  LoginInput,
  OfficeOption,
  OfficeRecord,
  PaginatedAttendance,
  PaginatedDepartments,
  PaginatedOffices,
  PaginatedUsers,
  Profile,
  RegisterUserInput,
  Role,
  UpdateDepartmentInput,
  UpdateOfficeInput,
  UpdateUserInput,
  UserRecord,
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = `device-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function errorMessageFromBody(body: unknown, fallback: string, status?: number): string {
  if (!body || typeof body !== 'object') return translateErrorMessage(fallback, status)
  const record = body as { message?: unknown; error?: unknown }
  const { message, error } = record
  let raw = fallback
  if (Array.isArray(message)) raw = message.filter(Boolean).join(', ') || fallback
  else if (typeof message === 'string' && message.trim()) raw = message
  else if (typeof error === 'string' && error.trim()) raw = error
  return translateErrorMessage(raw, status)
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { ...init, headers })

  if (!res.ok) {
    let message = translateErrorMessage(`Request failed (${res.status})`, res.status)
    try {
      message = errorMessageFromBody(await res.json(), message, res.status)
    } catch {
      // non-JSON error body, keep default message
    }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export interface LoginResponse {
  accessToken?: string
  access_token?: string
  token?: string
  user?: Profile
}

export async function login(input: LoginInput): Promise<string> {
  const payload = parseOrThrow(loginSchema, input)
  const data = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      employeeCode: payload.employeeCode,
      password: payload.password,
      deviceId: payload.deviceId,
    }),
  })
  const token = data.accessToken ?? data.access_token ?? data.token
  if (!token) throw new Error(translateErrorMessage('Login response did not include an access token'))
  return token
}

export function getProfile(token: string): Promise<Profile> {
  return request<Profile>('/auth/profile', {}, token)
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

function asNestedOption(
  raw: unknown,
): { id: number; name: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (d.id === undefined || d.id === null) return null
  return {
    id: Number(d.id),
    name: String(d.name ?? ''),
  }
}

function asUserRecord(raw: Record<string, unknown>): UserRecord {
  const department = asNestedOption(raw.department)
  const office = asNestedOption(raw.office)

  return {
    id: Number(raw.id),
    fullName: String(raw.fullName ?? ''),
    phoneNumber: String(raw.phoneNumber ?? ''),
    email: (raw.email as string | null) ?? null,
    role: (raw.role as Role) ?? 'EMPLOYEE',
    employeeCode: String(raw.employeeCode ?? ''),
    deviceId: (raw.deviceId as string | null) ?? null,
    points: Number(raw.points ?? 0),
    isActive: Boolean(raw.isActive ?? true),
    departmentId:
      raw.departmentId === null || raw.departmentId === undefined
        ? department?.id ?? null
        : Number(raw.departmentId),
    department,
    officeId:
      raw.officeId === null || raw.officeId === undefined
        ? office?.id ?? null
        : Number(raw.officeId),
    office,
    createdAt: raw.createdAt as string | undefined,
    updatedAt: raw.updatedAt as string | undefined,
  }
}

function normalizePaginated<T>(
  body: unknown,
  page: number,
  limit: number,
  listKeys: string[],
  mapItem: (item: Record<string, unknown>) => T,
): { data: T[]; page: number; limit: number; total: number; totalPages: number } {
  if (Array.isArray(body)) {
    const data = body.map((item) => mapItem(item as Record<string, unknown>))
    return {
      data,
      page: 1,
      limit: data.length || limit,
      total: data.length,
      totalPages: 1,
    }
  }

  if (!body || typeof body !== 'object') {
    return { data: [], page, limit, total: 0, totalPages: 0 }
  }

  const record = body as Record<string, unknown>
  let listSource: unknown[] = []
  for (const key of listKeys) {
    if (Array.isArray(record[key])) {
      listSource = record[key] as unknown[]
      break
    }
  }

  const meta =
    record.meta && typeof record.meta === 'object'
      ? (record.meta as Record<string, unknown>)
      : record.pagination && typeof record.pagination === 'object'
        ? (record.pagination as Record<string, unknown>)
        : record

  const data = listSource.map((item) => mapItem(item as Record<string, unknown>))
  const total = Number(meta.total ?? meta.totalCount ?? meta.count ?? data.length)
  const resolvedPage = Number(meta.page ?? meta.currentPage ?? page)
  const resolvedLimit = Number(meta.limit ?? meta.perPage ?? meta.pageSize ?? limit)
  const totalPages = Number(
    meta.totalPages ?? meta.pageCount ?? Math.max(1, Math.ceil(total / (resolvedLimit || 1))),
  )

  return {
    data,
    page: resolvedPage,
    limit: resolvedLimit,
    total,
    totalPages: Number.isFinite(totalPages) ? totalPages : 1,
  }
}

function asDepartmentRecord(raw: Record<string, unknown>): DepartmentRecord {
  const users = Array.isArray(raw.users)
    ? (raw.users as Record<string, unknown>[]).map(asUserRecord)
    : undefined
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    users,
    usersCount:
      raw.usersCount !== undefined
        ? Number(raw.usersCount)
        : users
          ? users.length
          : undefined,
    createdAt: raw.createdAt as string | undefined,
    updatedAt: raw.updatedAt as string | undefined,
  }
}

function asOfficeRecord(raw: Record<string, unknown>): OfficeRecord {
  const users = Array.isArray(raw.users)
    ? (raw.users as Record<string, unknown>[]).map(asUserRecord)
    : undefined
  const ssids = Array.isArray(raw.allowedSsids)
    ? (raw.allowedSsids as unknown[]).map(String)
    : undefined

  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    latitude:
      raw.latitude === null || raw.latitude === undefined ? null : Number(raw.latitude),
    longitude:
      raw.longitude === null || raw.longitude === undefined ? null : Number(raw.longitude),
    radiusMeters: Number(raw.radiusMeters ?? 0),
    graceMinutes: raw.graceMinutes !== undefined ? Number(raw.graceMinutes) : undefined,
    shiftStartTime: (raw.shiftStartTime as string | null) ?? null,
    shiftEndTime: (raw.shiftEndTime as string | null) ?? null,
    requireWifiCheck:
      raw.requireWifiCheck !== undefined ? Boolean(raw.requireWifiCheck) : undefined,
    allowedSsids: ssids,
    acceptRewards: raw.acceptRewards !== undefined ? Boolean(raw.acceptRewards) : undefined,
    dailyRewardPoints:
      raw.dailyRewardPoints !== undefined ? Number(raw.dailyRewardPoints) : undefined,
    payrollCycleStartDay:
      raw.payrollCycleStartDay !== undefined ? Number(raw.payrollCycleStartDay) : undefined,
    users,
    usersCount:
      raw.usersCount !== undefined
        ? Number(raw.usersCount)
        : users
          ? users.length
          : undefined,
    createdAt: raw.createdAt as string | undefined,
    updatedAt: raw.updatedAt as string | undefined,
  }
}

function asAttendanceRecord(raw: Record<string, unknown>): AttendanceRecord {
  const userRaw = raw.user
  const user =
    userRaw && typeof userRaw === 'object'
      ? asUserRecord(userRaw as Record<string, unknown>)
      : undefined

  return {
    id: String(raw.id ?? ''),
    userId: raw.userId !== undefined ? Number(raw.userId) : user?.id,
    officeId:
      raw.officeId === null || raw.officeId === undefined ? null : Number(raw.officeId),
    date: raw.date as string | undefined,
    dayStatus: raw.dayStatus as AttendanceRecord['dayStatus'],
    checkInAt: (raw.checkInAt as string | null) ?? null,
    checkOutAt: (raw.checkOutAt as string | null) ?? null,
    isLate: raw.isLate !== undefined ? Boolean(raw.isLate) : undefined,
    isEarlyLeave: raw.isEarlyLeave !== undefined ? Boolean(raw.isEarlyLeave) : undefined,
    lateReason: (raw.lateReason as string | null) ?? null,
    earlyLeaveReason: (raw.earlyLeaveReason as string | null) ?? null,
    lateJustificationStatus:
      (raw.lateJustificationStatus as AttendanceRecord['lateJustificationStatus']) ?? null,
    earlyLeaveJustificationStatus:
      (raw.earlyLeaveJustificationStatus as AttendanceRecord['earlyLeaveJustificationStatus']) ??
      null,
    notes: (raw.notes as string | null) ?? null,
    user,
    office: asNestedOption(raw.office),
  }
}

export async function listUsers(
  token: string,
  params: ListUsersParams = {},
): Promise<PaginatedUsers> {
  const validated = parseOrThrow(listUsersParamsSchema, params)
  const page = validated.page ?? 1
  const limit = validated.limit ?? 10
  const qs = toQuery({
    page,
    limit,
    role: validated.role,
    departmentId: validated.departmentId,
    isActive: validated.isActive,
    search: validated.search,
  })
  const body = await request<unknown>(`/auth/users${qs}`, {}, token)
  return normalizePaginated(body, page, limit, ['data', 'users', 'items', 'results'], asUserRecord)
}

export function registerUser(token: string, input: RegisterUserInput): Promise<UserRecord | unknown> {
  const payload = parseOrThrow(registerUserSchema, input)
  return request(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function updateUser(
  token: string,
  id: number,
  input: UpdateUserInput,
): Promise<UserRecord | unknown> {
  const payload = parseOrThrow(updateUserSchema, input)
  return request(
    `/auth/users/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function setUserStatus(
  token: string,
  id: number,
  isActive: boolean,
): Promise<UserRecord | unknown> {
  return request(
    `/auth/users/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    },
    token,
  )
}

export function deleteUser(token: string, id: number): Promise<unknown> {
  return request(`/auth/users/${id}`, { method: 'DELETE' }, token)
}

export function resetUserPassword(token: string, userId: number): Promise<unknown> {
  return request(
    '/auth/reset-password',
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
    token,
  )
}

export function resetUserDevice(token: string, userId: number): Promise<unknown> {
  return request(
    '/auth/reset-device',
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
    token,
  )
}

export async function listDepartments(
  token: string,
  params: ListDepartmentsParams = {},
): Promise<PaginatedDepartments> {
  const validated = parseOrThrow(listDepartmentsParamsSchema, params)
  const page = validated.page ?? 1
  const limit = validated.limit ?? 10
  const qs = toQuery({
    page,
    limit,
    search: validated.search,
  })
  const body = await request<unknown>(`/department${qs}`, {}, token)
  return normalizePaginated(
    body,
    page,
    limit,
    ['data', 'departments', 'items', 'results'],
    asDepartmentRecord,
  )
}

/** Flat options list for selects (fetches a large page). */
export async function listDepartmentOptions(
  token: string,
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<DepartmentOption[]> {
  const result = await listDepartments(token, {
    page: params.page ?? 1,
    limit: params.limit ?? 100,
    search: params.search,
  })
  return result.data.map((item) => ({ id: item.id, name: item.name }))
}

export function createDepartment(
  token: string,
  input: CreateDepartmentInput,
): Promise<DepartmentRecord | unknown> {
  const payload = parseOrThrow(createDepartmentSchema, input)
  return request(
    '/department/create',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function updateDepartment(
  token: string,
  id: number,
  input: UpdateDepartmentInput,
): Promise<DepartmentRecord | unknown> {
  const payload = parseOrThrow(updateDepartmentSchema, input)
  return request(
    `/department/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function deleteDepartment(token: string, id: number): Promise<unknown> {
  return request(`/department/${id}`, { method: 'DELETE' }, token)
}

export function assignUserToDepartment(
  token: string,
  departmentId: number,
  userId: number,
): Promise<unknown> {
  return request(
    `/department/${departmentId}/assign`,
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
    token,
  )
}

export function unassignUserFromDepartment(token: string, userId: number): Promise<unknown> {
  return request(
    '/department/unassign',
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
    token,
  )
}

export async function listDepartmentUsers(
  token: string,
  departmentId: number,
  params: {
    page?: number
    limit?: number
    search?: string
    role?: Role
    isActive?: boolean
  } = {},
): Promise<PaginatedUsers> {
  const page = params.page ?? 1
  const limit = params.limit ?? 50
  const qs = toQuery({
    page,
    limit,
    search: params.search,
    role: params.role,
    isActive: params.isActive,
  })
  const body = await request<unknown>(`/department/${departmentId}/users${qs}`, {}, token)
  return normalizePaginated(body, page, limit, ['data', 'users', 'items', 'results'], asUserRecord)
}

export async function listOffices(
  token: string,
  params: ListOfficesParams = {},
): Promise<PaginatedOffices> {
  const validated = parseOrThrow(listOfficesParamsSchema, params)
  const page = validated.page ?? 1
  const limit = validated.limit ?? 10
  const qs = toQuery({
    page,
    limit,
    search: validated.search,
    acceptRewards: validated.acceptRewards,
    requireWifiCheck: validated.requireWifiCheck,
    sortBy: validated.sortBy,
    sortOrder: validated.sortOrder,
  })
  const body = await request<unknown>(`/office${qs}`, {}, token)
  return normalizePaginated(body, page, limit, ['data', 'offices', 'items', 'results'], asOfficeRecord)
}

export async function listOfficeOptions(
  token: string,
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<OfficeOption[]> {
  const result = await listOffices(token, {
    page: params.page ?? 1,
    limit: params.limit ?? 100,
    search: params.search,
  })
  return result.data.map((item) => ({ id: item.id, name: item.name }))
}

export function createOffice(
  token: string,
  input: CreateOfficeInput,
): Promise<OfficeRecord | unknown> {
  const payload = parseOrThrow(createOfficeSchema, input)
  return request(
    '/office/create',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function updateOffice(
  token: string,
  id: number,
  input: UpdateOfficeInput,
): Promise<OfficeRecord | unknown> {
  const payload = parseOrThrow(updateOfficeSchema, input)
  return request(
    `/office/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function assignUserToOffice(
  token: string,
  officeId: number,
  userId: number,
): Promise<unknown> {
  return request(
    `/office/${officeId}/assign`,
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
    token,
  )
}

export function unassignUserFromOffice(token: string, userId: number): Promise<unknown> {
  return request(
    '/office/unassign',
    {
      method: 'POST',
      body: JSON.stringify({ userId }),
    },
    token,
  )
}

export async function listOfficeUsers(
  token: string,
  officeId: number,
  params: {
    page?: number
    limit?: number
    search?: string
    role?: Role
    departmentId?: number
    isActive?: boolean
  } = {},
): Promise<PaginatedUsers> {
  const page = params.page ?? 1
  const limit = params.limit ?? 50
  const qs = toQuery({
    page,
    limit,
    search: params.search,
    role: params.role,
    departmentId: params.departmentId,
    isActive: params.isActive,
  })
  const body = await request<unknown>(`/office/${officeId}/users${qs}`, {}, token)
  return normalizePaginated(body, page, limit, ['data', 'users', 'items', 'results'], asUserRecord)
}

export async function listAttendance(
  token: string,
  params: ListAttendanceParams = {},
): Promise<PaginatedAttendance> {
  const validated = parseOrThrow(listAttendanceParamsSchema, params)
  const page = validated.page ?? 1
  const limit = validated.limit ?? 20
  const qs = toQuery({
    userId: validated.userId,
    officeId: validated.officeId,
    from: validated.from,
    to: validated.to,
    dayStatus: validated.dayStatus,
    page,
    limit,
  })
  const body = await request<unknown>(`/attendance${qs}`, {}, token)
  return normalizePaginated(
    body,
    page,
    limit,
    ['data', 'attendance', 'items', 'results', 'records'],
    asAttendanceRecord,
  )
}

export function reviewLateJustification(
  token: string,
  id: string,
  status: 'approved' | 'rejected',
): Promise<unknown> {
  return request(
    `/attendance/${id}/late-justification`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token,
  )
}

export function reviewEarlyLeaveJustification(
  token: string,
  id: string,
  status: 'approved' | 'rejected',
): Promise<unknown> {
  return request(
    `/attendance/${id}/early-leave-justification`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token,
  )
}

