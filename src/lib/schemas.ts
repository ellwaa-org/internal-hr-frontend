import { z } from 'zod'

export const roleSchema = z.enum(['ADMIN', 'HR', 'EMPLOYEE'])

const bioFieldSchema = z
  .union([z.literal(''), z.null(), z.string().trim().max(500, 'النبذة طويلة جداً.')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v))

export const loginSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1, 'كود الموظف مطلوب.')
    .max(50, 'كود الموظف طويل جداً.'),
  password: z
    .string()
    .min(4, 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.')
    .max(100, 'كلمة المرور طويلة جداً.'),
  deviceId: z.string().min(1, 'معرّف الجهاز مطلوب.'),
})

export const registerUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'الاسم الكامل يجب أن يكون حرفين على الأقل.')
    .max(100, 'الاسم الكامل طويل جداً.'),
  employeeCode: z
    .string()
    .trim()
    .min(1, 'كود الموظف مطلوب.')
    .max(50, 'كود الموظف طويل جداً.'),
  phoneNumber: z
    .string()
    .trim()
    .min(8, 'رقم الهاتف غير صالح.')
    .max(20, 'رقم الهاتف طويل جداً.'),
  password: z
    .string()
    .min(4, 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.')
    .max(100, 'كلمة المرور طويلة جداً.'),
  role: roleSchema,
  email: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().email('البريد الإلكتروني غير صالح.'),
    ])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  departmentId: z
    .union([z.number().int().positive(), z.null()])
    .optional()
    .nullable(),
  officeId: z.union([z.number().int().positive(), z.null()]).optional().nullable(),
  bio: bioFieldSchema,
})

export const updateUserSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .min(8, 'رقم الهاتف غير صالح.')
    .max(20, 'رقم الهاتف طويل جداً.')
    .optional(),
  email: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().email('البريد الإلكتروني غير صالح.'),
    ])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  employeeCode: z
    .string()
    .trim()
    .min(1, 'كود الموظف مطلوب.')
    .max(50, 'كود الموظف طويل جداً.')
    .optional(),
  points: z.coerce
    .number({ error: 'النقاط يجب أن تكون رقماً.' })
    .int('النقاط يجب أن تكون عدداً صحيحاً.')
    .min(0, 'النقاط لا يمكن أن تكون سالبة.')
    .optional(),
  departmentId: z.union([z.number().int().positive(), z.null()]).optional().nullable(),
  officeId: z.union([z.number().int().positive(), z.null()]).optional().nullable(),
  isActive: z.boolean().optional(),
  fullName: z
    .string()
    .trim()
    .min(2, 'الاسم الكامل يجب أن يكون حرفين على الأقل.')
    .max(100, 'الاسم الكامل طويل جداً.')
    .optional(),
  bio: bioFieldSchema,
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة.'),
    newPassword: z
      .string()
      .min(4, 'كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل.')
      .max(100, 'كلمة المرور الجديدة طويلة جداً.'),
    confirmPassword: z.string().min(1, 'تأكيد كلمة المرور مطلوب.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.',
    path: ['newPassword'],
  })

export const listUsersParamsSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  role: roleSchema.optional(),
  departmentId: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  search: z.string().trim().optional(),
})

export const departmentOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const officeOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'اسم الإدارة مطلوب.')
    .max(100, 'اسم الإدارة طويل جداً.'),
})

export const updateDepartmentSchema = createDepartmentSchema

export const listDepartmentsParamsSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  search: z.string().trim().optional(),
})

const timeStringSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'صيغة الوقت غير صالحة (HH:MM أو HH:MM:SS).')

export const createOfficeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'اسم المكتب مطلوب.')
    .max(100, 'اسم المكتب طويل جداً.'),
  latitude: z.union([z.coerce.number(), z.null()]).optional().nullable(),
  longitude: z.union([z.coerce.number(), z.null()]).optional().nullable(),
  radiusMeters: z.coerce
    .number({ error: 'نطاق المكتب يجب أن يكون رقماً.' })
    .positive('نطاق المكتب يجب أن يكون أكبر من صفر.'),
  graceMinutes: z.coerce
    .number()
    .int()
    .min(0, 'فترة السماح لا يمكن أن تكون سالبة.')
    .optional(),
  shiftStartTime: timeStringSchema.optional(),
  shiftEndTime: timeStringSchema.optional(),
  requireWifiCheck: z.boolean().optional(),
  allowedSsids: z.array(z.string().trim().min(1)).optional(),
  acceptRewards: z.boolean().optional(),
  dailyRewardPoints: z.coerce.number().int().min(0).optional(),
  payrollCycleStartDay: z.coerce
    .number()
    .int()
    .min(1, 'يوم بداية الدورة يجب أن يكون بين 1 و 28.')
    .max(28, 'يوم بداية الدورة يجب أن يكون بين 1 و 28.')
    .optional(),
})

export const updateOfficeSchema = createOfficeSchema.partial().extend({
  radiusMeters: z.coerce
    .number({ error: 'نطاق المكتب يجب أن يكون رقماً.' })
    .positive('نطاق المكتب يجب أن يكون أكبر من صفر.')
    .optional(),
})

export const listOfficesParamsSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  search: z.string().trim().optional(),
  acceptRewards: z.boolean().optional(),
  requireWifiCheck: z.boolean().optional(),
  sortBy: z
    .enum(['id', 'name', 'updatedAt', 'dailyRewardPoints', 'graceMinutes'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

export const dayStatusSchema = z.enum(['not_started', 'checked_in', 'completed'])
export const justificationStatusSchema = z.enum(['approved', 'rejected', 'pending'])
export const attendanceTypeSchema = z.enum(['office', 'task'])
export const attendanceUserStatusSchema = z.enum([
  'checked_in',
  'checked_out',
  'completed',
  'absent',
])

export const listAttendanceParamsSchema = z.object({
  userId: z.number().int().positive().optional(),
  officeId: z.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  dayStatus: dayStatusSchema.optional(),
  type: attendanceTypeSchema.optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
})

export const listAttendanceUsersParamsSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  currentCycle: z.boolean().optional(),
  type: attendanceTypeSchema.optional(),
  status: attendanceUserStatusSchema.optional(),
  officeId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  absentFrom: z.string().optional(),
  absentTo: z.string().optional(),
  hasAbsent: z.boolean().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
  today: z.boolean().optional(),
})

export const exportAttendanceExcelParamsSchema = z.object({
  from: z.string().min(1, 'تاريخ البداية مطلوب.'),
  to: z.string().min(1, 'تاريخ النهاية مطلوب.'),
})

export const attendanceTaskSchema = z.object({
  id: z.string(),
  taskName: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  addressName: z.string().nullable().optional(),
  mapLink: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  workDurationMinutes: z.number().nullable().optional(),
  userId: z.number().optional(),
  attendanceId: z.string().nullable().optional(),
  date: z.string().optional(),
  user: z
    .object({
      id: z.number().optional(),
      fullName: z.string().optional(),
      employeeCode: z.string().optional(),
    })
    .optional(),
})

export const userRecordSchema = z.object({
  id: z.number(),
  fullName: z.string(),
  phoneNumber: z.string(),
  email: z.string().nullable(),
  role: roleSchema,
  employeeCode: z.string(),
  deviceId: z.string().nullable(),
  points: z.number(),
  isActive: z.boolean(),
  bio: z.string().nullable().optional(),
  departmentId: z.number().nullable().optional(),
  department: departmentOptionSchema.nullable().optional(),
  officeId: z.number().nullable().optional(),
  office: officeOptionSchema.nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const departmentRecordSchema = z.object({
  id: z.number(),
  name: z.string(),
  users: z.array(userRecordSchema).optional(),
  usersCount: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const officeRecordSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  radiusMeters: z.number(),
  graceMinutes: z.number().optional(),
  shiftStartTime: z.string().nullable().optional(),
  shiftEndTime: z.string().nullable().optional(),
  requireWifiCheck: z.boolean().optional(),
  allowedSsids: z.array(z.string()).optional(),
  acceptRewards: z.boolean().optional(),
  dailyRewardPoints: z.number().optional(),
  payrollCycleStartDay: z.number().optional(),
  users: z.array(userRecordSchema).optional(),
  usersCount: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const attendanceRecordSchema = z.object({
  id: z.string(),
  userId: z.number().optional(),
  officeId: z.number().nullable().optional(),
  date: z.string().optional(),
  dayStatus: dayStatusSchema.optional(),
  type: attendanceTypeSchema.optional(),
  checkInAt: z.string().nullable().optional(),
  checkOutAt: z.string().nullable().optional(),
  isLate: z.boolean().optional(),
  isEarlyLeave: z.boolean().optional(),
  lateReason: z.string().nullable().optional(),
  earlyLeaveReason: z.string().nullable().optional(),
  lateJustificationStatus: justificationStatusSchema.nullable().optional(),
  earlyLeaveJustificationStatus: justificationStatusSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  rewardPoints: z.number().optional(),
  taskName: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  addressName: z.string().nullable().optional(),
  mapLink: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  workDurationMinutes: z.number().nullable().optional(),
  tasks: z.array(attendanceTaskSchema).optional(),
  user: userRecordSchema.partial().optional(),
  office: officeOptionSchema.nullable().optional(),
})

export const paginatedUsersSchema = z.object({
  data: z.array(userRecordSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const paginatedDepartmentsSchema = z.object({
  data: z.array(departmentRecordSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const paginatedOfficesSchema = z.object({
  data: z.array(officeRecordSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const paginatedAttendanceSchema = z.object({
  data: z.array(attendanceRecordSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const attendanceUserItemSchema = z.object({
  user: userRecordSchema.partial().extend({
    id: z.number(),
    fullName: z.string(),
    employeeCode: z.string().optional(),
  }),
  from: z.string().optional(),
  to: z.string().optional(),
  absentFrom: z.string().optional(),
  absentTo: z.string().optional(),
  absentDays: z.array(z.string()).optional(),
  absentCount: z.number().optional(),
  isAbsent: z.boolean().optional(),
  attendance: z.array(attendanceRecordSchema),
})

export const paginatedAttendanceUsersSchema = z.object({
  data: z.array(attendanceUserItemSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const profileSchema = userRecordSchema.omit({
  department: true,
  office: true,
  createdAt: true,
  updatedAt: true,
})

export type Role = z.infer<typeof roleSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RegisterUserInput = z.infer<typeof registerUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ListUsersParams = z.infer<typeof listUsersParamsSchema>
export type UserRecord = z.infer<typeof userRecordSchema>
export type PaginatedUsers = z.infer<typeof paginatedUsersSchema>
export type Profile = z.infer<typeof profileSchema>
export type DepartmentOption = z.infer<typeof departmentOptionSchema>
export type OfficeOption = z.infer<typeof officeOptionSchema>
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>
export type ListDepartmentsParams = z.infer<typeof listDepartmentsParamsSchema>
export type DepartmentRecord = z.infer<typeof departmentRecordSchema>
export type PaginatedDepartments = z.infer<typeof paginatedDepartmentsSchema>
export type CreateOfficeInput = z.infer<typeof createOfficeSchema>
export type UpdateOfficeInput = z.infer<typeof updateOfficeSchema>
export type ListOfficesParams = z.infer<typeof listOfficesParamsSchema>
export type OfficeRecord = z.infer<typeof officeRecordSchema>
export type PaginatedOffices = z.infer<typeof paginatedOfficesSchema>
export type ListAttendanceParams = z.infer<typeof listAttendanceParamsSchema>
export type ListAttendanceUsersParams = z.infer<typeof listAttendanceUsersParamsSchema>
export type ExportAttendanceExcelParams = z.infer<typeof exportAttendanceExcelParamsSchema>
export type AttendanceTask = z.infer<typeof attendanceTaskSchema>
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>
export type AttendanceUserItem = z.infer<typeof attendanceUserItemSchema>
export type PaginatedAttendance = z.infer<typeof paginatedAttendanceSchema>
export type PaginatedAttendanceUsers = z.infer<typeof paginatedAttendanceUsersSchema>
export type DayStatus = z.infer<typeof dayStatusSchema>
export type JustificationStatus = z.infer<typeof justificationStatusSchema>
export type AttendanceType = z.infer<typeof attendanceTypeSchema>
export type AttendanceUserStatus = z.infer<typeof attendanceUserStatusSchema>

/** Collect first Zod issue messages as Arabic-friendly list. */
export function zodErrorMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(' • ') || 'البيانات غير صالحة.'
}

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw new Error(zodErrorMessage(result.error))
  return result.data
}
