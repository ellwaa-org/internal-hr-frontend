const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api').replace(
  /\/$/,
  '',
)

const TOKEN_KEY = 'hr_access_token'
const DEVICE_KEY = 'hr_device_id'

import { translateErrorMessage } from './errors'
import {
  changePasswordSchema,
  createDepartmentSchema,
  createOfficeSchema,
  exportAttendanceExcelParamsSchema,
  listAttendanceParamsSchema,
  listAttendanceUsersParamsSchema,
  listDepartmentsParamsSchema,
  listOfficesParamsSchema,
  listUsersParamsSchema,
  loginSchema,
  parseOrThrow,
  registerUserSchema,
  updateDepartmentSchema,
  updateOfficeSchema,
  updateUserSchema,
  updateFieldTaskSchema,
  endFieldTaskSchema,
  type AttendanceRecord,
  type AttendanceTask,
  type AttendanceType,
  type AttendanceUserItem,
  type AttendanceUserStatus,
  type ChangePasswordInput,
  type CreateDepartmentInput,
  type CreateOfficeInput,
  type DayStatus,
  type DepartmentOption,
  type DepartmentRecord,
  type ExportAttendanceExcelParams,
  type JustificationStatus,
  type ListAttendanceParams,
  type ListAttendanceUsersParams,
  type ListDepartmentsParams,
  type ListOfficesParams,
  type ListUsersParams,
  type LoginInput,
  type OfficeOption,
  type OfficeRecord,
  type PaginatedAttendance,
  type PaginatedAttendanceUsers,
  type PaginatedDepartments,
  type PaginatedOffices,
  type PaginatedUsers,
  type Profile,
  type RegisterUserInput,
  type Role,
  type UpdateDepartmentInput,
  type UpdateOfficeInput,
  type UpdateUserInput,
  type UpdateFieldTaskInput,
  type EndFieldTaskInput,
  type UserRecord,
} from './schemas'

export type {
  AttendanceRecord,
  AttendanceTask,
  AttendanceType,
  AttendanceUserItem,
  AttendanceUserStatus,
  ChangePasswordInput,
  CreateDepartmentInput,
  CreateOfficeInput,
  DayStatus,
  DepartmentOption,
  DepartmentRecord,
  ExportAttendanceExcelParams,
  JustificationStatus,
  ListAttendanceParams,
  ListAttendanceUsersParams,
  ListDepartmentsParams,
  ListOfficesParams,
  ListUsersParams,
  LoginInput,
  OfficeOption,
  OfficeRecord,
  PaginatedAttendance,
  PaginatedAttendanceUsers,
  PaginatedDepartments,
  PaginatedOffices,
  PaginatedUsers,
  Profile,
  RegisterUserInput,
  Role,
  UpdateDepartmentInput,
  UpdateOfficeInput,
  UpdateUserInput,
  UpdateFieldTaskInput,
  EndFieldTaskInput,
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

export async function getProfile(token: string): Promise<Profile> {
  const raw = await request<Record<string, unknown>>('/auth/profile', {}, token)
  const user = asUserRecord(raw)
  return {
    id: user.id,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    role: user.role,
    employeeCode: user.employeeCode,
    deviceId: user.deviceId,
    points: user.points,
    isActive: user.isActive,
    bio: user.bio ?? null,
    departmentId: user.departmentId ?? null,
    officeId: user.officeId ?? null,
    officeIds: user.officeIds,
    offices: user.offices,
  }
}

export function changePassword(
  token: string,
  input: ChangePasswordInput,
): Promise<unknown> {
  const payload = parseOrThrow(changePasswordSchema, input)
  return request(
    '/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      }),
    },
    token,
  )
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
  const nestedOffices = Array.isArray(raw.offices)
    ? (raw.offices as unknown[])
        .map((item) => asNestedOption(item))
        .filter((item): item is { id: number; name: string } => item != null)
    : []
  const officeIdsFromRaw = Array.isArray(raw.officeIds)
    ? (raw.officeIds as unknown[])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    : []
  const office = nestedOffices[0] ?? asNestedOption(raw.office)
  const officeIds =
    officeIdsFromRaw.length > 0
      ? officeIdsFromRaw
      : nestedOffices.length > 0
        ? nestedOffices.map((item) => item.id)
        : office
          ? [office.id]
          : []
  const offices =
    nestedOffices.length > 0
      ? nestedOffices
      : office
        ? [office]
        : undefined

  return {
    id: Number(raw.id),
    fullName: String(raw.fullName ?? raw.name ?? raw.userName ?? ''),
    phoneNumber: String(raw.phoneNumber ?? ''),
    email: (raw.email as string | null) ?? null,
    role: (raw.role as Role) ?? 'EMPLOYEE',
    employeeCode: String(raw.employeeCode ?? raw.code ?? ''),
    deviceId: (raw.deviceId as string | null) ?? null,
    points: Number(raw.points ?? 0),
    isActive: Boolean(raw.isActive ?? true),
    bio: raw.bio == null || raw.bio === '' ? null : String(raw.bio),
    departmentId:
      raw.departmentId === null || raw.departmentId === undefined
        ? department?.id ?? null
        : Number(raw.departmentId),
    department,
    officeId:
      raw.officeId === null || raw.officeId === undefined
        ? office?.id ?? officeIds[0] ?? null
        : Number(raw.officeId),
    office,
    officeIds: officeIds.length > 0 ? officeIds : undefined,
    offices,
    createdAt: raw.createdAt as string | undefined,
    updatedAt: raw.updatedAt as string | undefined,
  }
}

export function officeIdsOf(user: {
  officeId?: number | null
  officeIds?: number[]
  offices?: { id: number }[] | null
  office?: { id: number } | null
}): number[] {
  if (user.officeIds && user.officeIds.length > 0) {
    return [...new Set(user.officeIds)]
  }
  if (user.offices && user.offices.length > 0) {
    return [...new Set(user.offices.map((item) => item.id))]
  }
  if (user.office?.id != null) return [user.office.id]
  if (user.officeId != null) return [user.officeId]
  return []
}

export function officeNamesOf(
  user: {
    office?: { name?: string } | null
    offices?: { id: number; name: string }[] | null
    officeId?: number | null
    officeIds?: number[]
  },
  officesById?: Map<number, { name: string }>,
): string {
  if (user.offices && user.offices.length > 0) {
    return user.offices
      .map((item) => item.name)
      .filter(Boolean)
      .join(' · ')
  }
  const ids = officeIdsOf(user)
  if (officesById && ids.length > 0) {
    return ids
      .map((id) => officesById.get(id)?.name)
      .filter(Boolean)
      .join(' · ')
  }
  return user.office?.name ?? ''
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

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asAttendanceTask(
  raw: Record<string, unknown>,
  fallbackUser?: AttendanceRecord['user'],
  fallbackUserId?: number,
  fallbackDate?: string,
): AttendanceTask {
  const userRaw = asRecord(raw.user)
  const nestedUser = userRaw
  const nestedFullName = nestedUser
    ? pickString(nestedUser.fullName, nestedUser.name, nestedUser.userName)
    : null
  const nestedCode = nestedUser
    ? pickString(nestedUser.employeeCode, nestedUser.code)
    : null

  const office = asNestedOption(raw.office)

  return {
    id: String(raw.id ?? raw.taskId ?? ''),
    taskName: pickString(raw.taskName, raw.name) ?? undefined,
    notes: pickString(raw.notes),
    lat: pickNumber(raw.startLat, raw.lat, raw.latitude, raw.checkInLat),
    lng: pickNumber(raw.startLng, raw.lng, raw.longitude, raw.checkInLng),
    endLat: pickNumber(raw.endLat, raw.checkOutLat),
    endLng: pickNumber(raw.endLng, raw.checkOutLng),
    addressName: pickString(raw.addressName, raw.address, raw.locationName),
    mapLink: pickString(raw.mapLink, raw.mapUrl, raw.googleMapsLink),
    officeId: pickNumber(raw.officeId) ?? office?.id ?? null,
    office,
    startedAt: pickString(
      raw.startTime,
      raw.startedAt,
      raw.startAt,
      raw.checkInTime,
      raw.checkInAt,
    ),
    endedAt: pickString(
      raw.endTime,
      raw.endedAt,
      raw.endAt,
      raw.checkOutTime,
      raw.checkOutAt,
    ),
    workDurationMinutes: pickNumber(raw.workDurationMinutes, raw.durationMinutes),
    userId:
      raw.userId !== undefined && raw.userId !== null
        ? Number(raw.userId)
        : nestedUser?.id !== undefined
          ? Number(nestedUser.id)
          : fallbackUserId,
    attendanceId:
      raw.attendanceId === null || raw.attendanceId === undefined
        ? null
        : String(raw.attendanceId),
    date: pickString(raw.date, fallbackDate) ?? undefined,
    user: nestedUser
      ? {
          id: nestedUser.id !== undefined ? Number(nestedUser.id) : undefined,
          fullName: nestedFullName ?? fallbackUser?.fullName,
          employeeCode: nestedCode ?? fallbackUser?.employeeCode,
        }
      : fallbackUser
        ? {
            id: fallbackUser.id,
            fullName: fallbackUser.fullName,
            employeeCode: fallbackUser.employeeCode,
          }
        : undefined,
  }
}

function asAttendanceRecord(raw: Record<string, unknown>): AttendanceRecord {
  const attendance = asRecord(raw.attendance) ?? raw
  const task = asRecord(raw.task)
  const firstListedTask = Array.isArray(raw.tasks)
    ? asRecord(raw.tasks[0])
    : Array.isArray(raw.attendanceTasks)
      ? asRecord(raw.attendanceTasks[0])
      : null
  const userRaw =
    asRecord(raw.user) ??
    asRecord(attendance.user) ??
    asRecord(task?.user) ??
    asRecord(firstListedTask?.user)
  const user = userRaw
    ? {
        id: pickNumber(userRaw.id) ?? undefined,
        fullName:
          pickString(userRaw.fullName, userRaw.name, userRaw.userName) ?? undefined,
        employeeCode: pickString(userRaw.employeeCode, userRaw.code) ?? undefined,
        role: userRaw.role as UserRecord['role'] | undefined,
        phoneNumber: pickString(userRaw.phoneNumber) ?? undefined,
        email: (userRaw.email as string | null | undefined) ?? undefined,
        deviceId: (userRaw.deviceId as string | null | undefined) ?? undefined,
        points: pickNumber(userRaw.points) ?? undefined,
        isActive:
          userRaw.isActive === undefined ? undefined : Boolean(userRaw.isActive),
        departmentId: pickNumber(userRaw.departmentId),
        officeId: pickNumber(userRaw.officeId),
      }
    : undefined
  const officeRaw = asRecord(raw.office) ?? asRecord(attendance.office) ?? asRecord(task?.office)

  const userId =
    pickNumber(
      attendance.userId,
      task?.userId,
      raw.userId,
      firstListedTask?.userId,
      user?.id,
    ) ?? undefined
  const officeId = pickNumber(attendance.officeId, task?.officeId, raw.officeId)
  const date =
    pickString(attendance.date, task?.date, raw.date) ?? undefined

  const checkInAt = pickString(
    attendance.checkInTime,
    attendance.checkInAt,
    task?.startTime,
    raw.checkInTime,
    raw.checkInAt,
  )
  const checkOutAt = pickString(
    attendance.checkOutTime,
    attendance.checkOutAt,
    task?.endTime,
    raw.checkOutTime,
    raw.checkOutAt,
  )

  const lateReasonValue = raw.lateReason ?? attendance.lateReason
  const earlyLeaveReasonValue = raw.earlyLeaveReason ?? attendance.earlyLeaveReason
  const lateReason =
    lateReasonValue === null || lateReasonValue === undefined
      ? null
      : String(lateReasonValue)
  const earlyLeaveReason =
    earlyLeaveReasonValue === null || earlyLeaveReasonValue === undefined
      ? null
      : String(earlyLeaveReasonValue)

  const lateJustificationStatus = (pickString(
    raw.lateJustificationStatus,
    attendance.lateJustificationStatus,
  ) ??
    (raw.lateJustificationStatus === null || attendance.lateJustificationStatus === null
      ? null
      : undefined)) as AttendanceRecord['lateJustificationStatus']

  const earlyLeaveJustificationStatus = (pickString(
    raw.earlyLeaveJustificationStatus,
    attendance.earlyLeaveJustificationStatus,
  ) ??
    (raw.earlyLeaveJustificationStatus === null ||
    attendance.earlyLeaveJustificationStatus === null
      ? null
      : undefined)) as AttendanceRecord['earlyLeaveJustificationStatus']

  const taskName = pickString(task?.taskName, attendance.taskName, raw.taskName) ?? undefined
  const addressName = pickString(
    task?.addressName,
    attendance.addressName,
    raw.addressName,
  )
  const mapLink = pickString(task?.mapLink, attendance.mapLink, raw.mapLink)
  const startedAt = pickString(task?.startTime, attendance.startTime, checkInAt)
  const endedAt = pickString(task?.endTime, attendance.endTime, checkOutAt)
  const workDurationMinutes = pickNumber(
    task?.workDurationMinutes,
    attendance.workDurationMinutes,
    raw.workDurationMinutes,
  )
  const lat = pickNumber(
    task?.startLat,
    attendance.checkInLat,
    attendance.lat,
    raw.lat,
  )
  const lng = pickNumber(
    task?.startLng,
    attendance.checkInLng,
    attendance.lng,
    raw.lng,
  )

  const nestedTasks = Array.isArray(raw.tasks)
    ? (raw.tasks as Record<string, unknown>[]).map((item) =>
        asAttendanceTask(item, user, userId, date),
      )
    : Array.isArray(raw.attendanceTasks)
      ? (raw.attendanceTasks as Record<string, unknown>[]).map((item) =>
          asAttendanceTask(item, user, userId, date),
        )
      : undefined

  const type =
    (pickString(raw.type, attendance.type, task ? 'task' : undefined) as
      | AttendanceType
      | undefined) ?? undefined

  const id = String(
    (type === 'task' ? task?.id : undefined) ??
      attendance.id ??
      task?.id ??
      raw.id ??
      '',
  )

  const builtTask =
    task
      ? asAttendanceTask(task, user, userId, date)
      : type === 'task' || taskName || addressName || mapLink
        ? asAttendanceTask(
            {
              id,
              taskName,
              addressName,
              mapLink,
              startTime: startedAt,
              endTime: endedAt,
              workDurationMinutes,
              startLat: lat,
              startLng: lng,
              userId,
              date,
              attendanceId: attendance.attendanceId ?? null,
            },
            user,
            userId,
            date,
          )
        : undefined

  return {
    id,
    userId,
    officeId,
    date,
    dayStatus: (raw.dayStatus ?? attendance.dayStatus) as AttendanceRecord['dayStatus'],
    type,
    checkInAt,
    checkOutAt,
    isLate:
      raw.isLate !== undefined
        ? Boolean(raw.isLate)
        : attendance.isLate !== undefined
          ? Boolean(attendance.isLate)
          : pickString(attendance.checkInStatus) === 'late'
            ? true
            : undefined,
    isEarlyLeave:
      raw.isEarlyLeave !== undefined
        ? Boolean(raw.isEarlyLeave)
        : attendance.isEarlyLeave !== undefined
          ? Boolean(attendance.isEarlyLeave)
          : pickString(attendance.checkOutStatus) === 'early'
            ? true
            : undefined,
    lateReason,
    earlyLeaveReason,
    lateJustificationStatus: lateJustificationStatus ?? null,
    earlyLeaveJustificationStatus: earlyLeaveJustificationStatus ?? null,
    notes: pickString(raw.notes, attendance.notes, task?.notes),
    rewardPoints: pickNumber(raw.rewardPoints, attendance.rewardPoints) ?? undefined,
    taskName,
    lat,
    lng,
    addressName,
    mapLink,
    startedAt,
    endedAt,
    workDurationMinutes,
    tasks: nestedTasks ?? (builtTask ? [builtTask] : undefined),
    user,
    office: asNestedOption(officeRaw),
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
    officeId: validated.officeId,
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

export function unassignUserFromOffice(
  token: string,
  userId: number,
  officeId?: number,
): Promise<unknown> {
  return request(
    '/office/unassign',
    {
      method: 'POST',
      body: JSON.stringify({
        userId,
        ...(officeId != null ? { officeId } : {}),
      }),
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
    type: validated.type,
    page,
    limit,
  })
  const body = await request<unknown>(`/attendance${qs}`, {}, token)
  return normalizePaginated(
    body,
    page,
    limit,
    ['data', 'attendance', 'items', 'results', 'records', 'tasks'],
    asAttendanceRecord,
  )
}

function asAttendanceUserItem(raw: Record<string, unknown>): AttendanceUserItem {
  const userRaw = asRecord(raw.user) ?? raw
  const user = asUserRecord({
    phoneNumber: '',
    email: null,
    deviceId: null,
    isActive: true,
    points: 0,
    role: 'EMPLOYEE',
    ...userRaw,
  })

  const attendanceSource = Array.isArray(raw.attendance)
    ? (raw.attendance as Record<string, unknown>[])
    : Array.isArray(raw.records)
      ? (raw.records as Record<string, unknown>[])
      : []

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      role: user.role,
      points: user.points,
      departmentId: user.departmentId,
      officeId: user.officeId,
      officeIds: user.officeIds,
      offices: user.offices,
      isActive: user.isActive,
      phoneNumber: user.phoneNumber,
      email: user.email,
      deviceId: user.deviceId,
      department: user.department,
      office: user.office,
    },
    from: pickString(raw.from) ?? undefined,
    to: pickString(raw.to) ?? undefined,
    absentFrom: pickString(raw.absentFrom) ?? undefined,
    absentTo: pickString(raw.absentTo) ?? undefined,
    absentDays: Array.isArray(raw.absentDays)
      ? (raw.absentDays as unknown[]).map(String)
      : undefined,
    absentCount:
      raw.absentCount !== undefined
        ? Number(raw.absentCount)
        : Array.isArray(raw.absentDays)
          ? raw.absentDays.length
          : undefined,
    isAbsent: raw.isAbsent !== undefined ? Boolean(raw.isAbsent) : undefined,
    attendance: attendanceSource.map((item) => {
      const record = asAttendanceRecord(item)
      return {
        ...record,
        userId: record.userId ?? user.id,
        user: record.user ?? {
          id: user.id,
          fullName: user.fullName,
          employeeCode: user.employeeCode,
        },
        officeId: record.officeId ?? user.officeId ?? null,
      }
    }),
  }
}

export async function listAttendanceUsers(
  token: string,
  params: ListAttendanceUsersParams = {},
): Promise<PaginatedAttendanceUsers> {
  const validated = parseOrThrow(listAttendanceUsersParamsSchema, params)
  const page = validated.page ?? 1
  const limit = validated.limit ?? 20
  const qs = toQuery({
    from: validated.from,
    to: validated.to,
    currentCycle: validated.currentCycle,
    type: validated.type,
    status: validated.status,
    officeId: validated.officeId,
    departmentId: validated.departmentId,
    absentFrom: validated.absentFrom,
    absentTo: validated.absentTo,
    hasAbsent: validated.hasAbsent,
    page,
    limit,
  })
  const path = validated.today ? `/attendance/users/today${qs}` : `/attendance/users${qs}`
  const body = await request<unknown>(path, {}, token)
  return normalizePaginated(
    body,
    page,
    limit,
    ['data', 'users', 'items', 'results'],
    asAttendanceUserItem,
  )
}

export async function getAttendance(
  token: string,
  id: string,
): Promise<AttendanceRecord> {
  const body = await request<unknown>(`/attendance/${id}`, {}, token)
  const raw =
    body && typeof body === 'object' && 'data' in (body as object)
      ? ((body as { data: unknown }).data as Record<string, unknown>)
      : (body as Record<string, unknown>)
  return asAttendanceRecord(raw)
}

export async function getUserAttendance(
  token: string,
  userId: number,
  params: Omit<ListAttendanceParams, 'userId' | 'officeId'> = {},
): Promise<PaginatedAttendance> {
  const validated = parseOrThrow(listAttendanceParamsSchema, { ...params, userId })
  const page = validated.page ?? 1
  const limit = validated.limit ?? 31
  const qs = toQuery({
    from: validated.from,
    to: validated.to,
    type: validated.type,
    page,
    limit,
  })
  const body = await request<unknown>(`/attendance/user/${userId}${qs}`, {}, token)
  return normalizePaginated(
    body,
    page,
    limit,
    ['data', 'attendance', 'items', 'results', 'records', 'history', 'tasks'],
    asAttendanceRecord,
  )
}

async function downloadBinary(
  path: string,
  token: string,
  fallbackFilename: string,
): Promise<void> {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    let message = translateErrorMessage(`Request failed (${res.status})`, res.status)
    try {
      message = errorMessageFromBody(await res.json(), message, res.status)
    } catch {
      // non-JSON error body
    }
    throw new Error(message)
  }

  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition')
  const matched = disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)
  const filename = matched?.[1]
    ? decodeURIComponent(matched[1].replace(/"/g, ''))
    : fallbackFilename

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function exportTaskAttendanceExcel(
  token: string,
  params: ExportAttendanceExcelParams,
): Promise<void> {
  const validated = parseOrThrow(exportAttendanceExcelParamsSchema, params)
  const qs = toQuery({ from: validated.from, to: validated.to })
  await downloadBinary(
    `/attendance/task/excel${qs}`,
    token,
    `task-attendance-${validated.from}_${validated.to}.xlsx`,
  )
}

export async function exportOfficeAttendanceExcel(
  token: string,
  params: ExportAttendanceExcelParams,
): Promise<void> {
  const validated = parseOrThrow(exportAttendanceExcelParamsSchema, params)
  const qs = toQuery({ from: validated.from, to: validated.to })
  await downloadBinary(
    `/attendance/office/excel${qs}`,
    token,
    `office-attendance-${validated.from}_${validated.to}.xlsx`,
  )
}

export function updateFieldTask(
  token: string,
  id: string,
  input: UpdateFieldTaskInput,
): Promise<unknown> {
  const payload = parseOrThrow(updateFieldTaskSchema, input)
  return request(
    `/attendance/task/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function endFieldTask(
  token: string,
  id: string,
  input: EndFieldTaskInput = {},
): Promise<unknown> {
  const payload = parseOrThrow(endFieldTaskSchema, input)
  return request(
    `/attendance/task/${id}/end`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
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

