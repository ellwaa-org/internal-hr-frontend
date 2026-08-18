const STATUS_MESSAGES: Record<number, string> = {
  400: 'طلب غير صالح. تحقق من البيانات المدخلة.',
  401: 'انتهت الجلسة أو بيانات الدخول غير صحيحة.',
  403: 'لا تملك صلاحية تنفيذ هذا الإجراء.',
  404: 'العنصر المطلوب غير موجود.',
  409: 'تعارض في البيانات. قد يكون الحقل مُستخدمًا مسبقًا.',
  422: 'البيانات المرسلة غير مكتملة أو غير صالحة.',
  429: 'عدد الطلبات كبير. انتظر قليلاً ثم أعد المحاولة.',
  500: 'حدث خطأ في الخادم. حاول مرة أخرى لاحقاً.',
  502: 'الخدمة غير متاحة مؤقتاً.',
  503: 'الخدمة غير متاحة مؤقتاً.',
}

const MESSAGE_MAP: Array<[RegExp, string]> = [
  [/unauthorized|401/i, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.'],
  [/forbidden|403/i, 'لا تملك صلاحية تنفيذ هذا الإجراء.'],
  [/not found|404/i, 'العنصر المطلوب غير موجود.'],
  [/user not found/i, 'المستخدم غير موجود.'],
  [/current password.*(incorrect|invalid|wrong)|incorrect current password|wrong current password|old password.*(incorrect|invalid|wrong)/i, 'كلمة المرور الحالية غير صحيحة.'],
  [/password.*(same|identical|unchanged)|same password/i, 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.'],
  [/passwords?.*(match|mismatch|do not match|don't match)/i, 'كلمتا المرور غير متطابقتين.'],
  [/invalid credentials|wrong password|incorrect password/i, 'كود الموظف أو كلمة المرور غير صحيحة.'],
  [/device mismatch/i, 'الجهاز غير مطابق. تواصل مع المسؤول لإعادة ربط الجهاز.'],
  [/deactivated|inactive/i, 'هذا الحساب متوقف. تواصل مع المسؤول.'],
  [/email.*already|duplicate.*email/i, 'البريد الإلكتروني مستخدم مسبقاً.'],
  [/employee.?code.*already|duplicate.*code/i, 'كود الموظف مستخدم مسبقاً.'],
  [/phone.*already|duplicate.*phone/i, 'رقم الهاتف مستخدم مسبقاً.'],
  [/nothing to update/i, 'لا توجد تغييرات للحفظ.'],
  [/task already ended/i, 'المهمة مغلقة مسبقاً.'],
  [/another task is already open|open task/i, 'هناك مهمة مفتوحة بالفعل.'],
  [/network|failed to fetch|fetch failed/i, 'تعذر الاتصال بالخادم. تحقق من الشبكة.'],
  [/request failed/i, 'تعذر إتمام الطلب. حاول مرة أخرى.'],
  [/login response did not include/i, 'لم يتم استلام رمز الدخول من الخادم.'],
]

export function translateErrorMessage(message: string, status?: number): string {
  const trimmed = message.trim()
  if (!trimmed) {
    return status ? (STATUS_MESSAGES[status] ?? 'حدث خطأ غير متوقع.') : 'حدث خطأ غير متوقع.'
  }

  const statusFromText = trimmed.match(/\((\d{3})\)\s*$/)
  const code = status ?? (statusFromText ? Number(statusFromText[1]) : undefined)

  for (const [pattern, arabic] of MESSAGE_MAP) {
    if (pattern.test(trimmed)) return arabic
  }

  if (code && STATUS_MESSAGES[code]) return STATUS_MESSAGES[code]

  // Already Arabic — keep as-is
  if (/[\u0600-\u06FF]/.test(trimmed)) return trimmed.replace(/\s*\(\d{3}\)\s*$/, '').trim()

  return 'تعذر إتمام العملية. حاول مرة أخرى.'
}

export function errorMessageFromUnknown(err: unknown, fallback = 'حدث خطأ غير متوقع.'): string {
  if (err instanceof Error) return translateErrorMessage(err.message)
  if (typeof err === 'string') return translateErrorMessage(err)
  return fallback
}

export function isUnauthorizedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /401|unauthorized|غير مصرح|انتهت الجلسة/i.test(msg)
}
