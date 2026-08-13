import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, RotateCcw, Save, Shield, UserRound } from 'lucide-react'
import { changePassword, getProfile, updateUser, type Profile } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { changePasswordSchema, updateUserSchema, zodErrorMessage } from '@/lib/schemas'
import { notify } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, PageShell } from '@/components/ui/page'

const ROLE_LABELS: Record<Profile['role'], string> = {
  ADMIN: 'مدير النظام',
  HR: 'موارد بشرية',
  EMPLOYEE: 'موظف',
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
}

function SettingsCard({
  icon,
  title,
  description,
  children,
  footer,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-card max-md:rounded-xl">
      <div className="flex items-start gap-3 border-b border-border px-6 py-5 max-md:px-4 max-md:py-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-hover text-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-base font-bold text-foreground">{title}</h2>
          <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-6 py-5 max-md:px-4 max-md:py-4">{children}</div>
      {footer ? (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2.5 border-t border-border bg-hover/40 px-6 py-4 max-md:flex-col max-md:items-stretch max-md:px-4">
          {footer}
        </div>
      ) : null}
    </section>
  )
}

function FieldLabel({
  htmlFor,
  label,
  hint,
  children,
  className,
}: {
  htmlFor: string
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-[13px] text-muted', className)} htmlFor={htmlFor}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  visible,
  onToggleVisible,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  visible: boolean
  onToggleVisible: () => void
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className="pe-11"
      />
      <button
        type="button"
        className="absolute end-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-55"
        onClick={onToggleVisible}
        disabled={disabled}
        aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="m-0 rounded-[10px] border border-red-200 bg-danger-soft px-3 py-2.5 text-sm text-red-700">
      {message}
    </p>
  )
}

function SettingsPage({
  token,
  profile,
  onUnauthorized,
  onProfileUpdated,
}: {
  token: string
  profile: Profile
  onUnauthorized: () => void
  onProfileUpdated: (profile: Profile) => void
}) {
  const [fullName, setFullName] = useState(profile.fullName)
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber)
  const [email, setEmail] = useState(profile.email ?? '')
  const [employeeCode, setEmployeeCode] = useState(profile.employeeCode)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setFullName(profile.fullName)
    setPhoneNumber(profile.phoneNumber)
    setEmail(profile.email ?? '')
    setEmployeeCode(profile.employeeCode)
    setBio(profile.bio ?? '')
    setProfileError(null)
  }, [profile])

  const profileDirty =
    fullName.trim() !== profile.fullName ||
    phoneNumber.trim() !== profile.phoneNumber ||
    (email.trim() || null) !== (profile.email ?? null) ||
    employeeCode.trim() !== profile.employeeCode ||
    (bio.trim() || null) !== (profile.bio ?? null)

  const passwordDirty =
    currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0

  const handleUnauthorized = (err: unknown) => {
    if (!isUnauthorizedError(err)) return false
    notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
    onUnauthorized()
    return true
  }

  const resetProfile = () => {
    setFullName(profile.fullName)
    setPhoneNumber(profile.phoneNumber)
    setEmail(profile.email ?? '')
    setEmployeeCode(profile.employeeCode)
    setBio(profile.bio ?? '')
    setProfileError(null)
  }

  const resetPassword = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
    setShowCurrent(false)
    setShowNew(false)
    setShowConfirm(false)
  }

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setProfileError(null)

    const parsed = updateUserSchema.safeParse({
      fullName,
      phoneNumber,
      email,
      employeeCode,
      bio,
    })
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setProfileError(msg)
      notify.error(msg)
      return
    }

    if (!profileDirty) {
      notify.info('لا توجد تغييرات للحفظ.')
      return
    }

    setSavingProfile(true)
    const toastId = notify.loading('جارٍ حفظ بيانات الحساب...')
    try {
      await updateUser(token, profile.id, parsed.data)
      const refreshed = await getProfile(token)
      onProfileUpdated(refreshed)
      notify.dismiss(toastId)
      notify.success('تم حفظ بيانات الحساب', 'تم تحديث ملفك الشخصي بنجاح.')
    } catch (err) {
      notify.dismiss(toastId)
      if (handleUnauthorized(err)) return
      const message = err instanceof Error ? err.message : 'تعذر حفظ بيانات الحساب.'
      setProfileError(message)
      notify.error(err, 'تعذر حفظ بيانات الحساب.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordError(null)

    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setPasswordError(msg)
      notify.error(msg)
      return
    }

    setSavingPassword(true)
    const toastId = notify.loading('جارٍ تغيير كلمة المرور...')
    try {
      await changePassword(token, parsed.data)
      resetPassword()
      notify.dismiss(toastId)
      notify.success('تم تغيير كلمة المرور', 'استخدم كلمة المرور الجديدة في المرة القادمة.')
    } catch (err) {
      notify.dismiss(toastId)
      if (handleUnauthorized(err)) return
      const message = err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور.'
      setPasswordError(message)
      notify.error(err, 'تعذر تغيير كلمة المرور.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <PageShell className="max-w-[1180px]">
      <PageHeader
        title="الإعدادات"
        subtitle="إدارة بيانات حسابك وكلمة المرور من مكان واحد."
      />

      <div className="flex items-center gap-4 rounded-2xl border border-border bg-white px-5 py-4 shadow-card max-md:rounded-xl max-md:px-4">
        <Avatar className="h-14 w-14 text-base">
          <AvatarImage src="" alt={profile.fullName} />
          <AvatarFallback>{initialsOf(profile.fullName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-foreground">{profile.fullName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="inline-flex items-center rounded-md bg-hover px-2 py-0.5 font-medium text-foreground">
              {ROLE_LABELS[profile.role]}
            </span>
            <span>كود الموظف: {profile.employeeCode}</span>
            {profile.points > 0 ? <span>النقاط: {profile.points}</span> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 items-stretch gap-4 max-[980px]:grid-cols-1 max-[980px]:gap-3">
        <form className="flex min-w-0 h-full" onSubmit={(e) => void handleProfileSubmit(e)}>
          <SettingsCard
            icon={<UserRound className="h-[18px] w-[18px]" />}
            title="البيانات الشخصية"
            description="حدّث الاسم وبيانات التواصل الظاهرة في النظام."
            footer={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={savingProfile || !profileDirty}
                  onClick={resetProfile}
                  fullOnMobile
                >
                  <RotateCcw />
                  إلغاء التغييرات
                </Button>
                <Button type="submit" variant="primary" disabled={savingProfile || !profileDirty} fullOnMobile>
                  {savingProfile ? <Loader2 className="animate-spin" /> : <Save />}
                  {savingProfile ? 'جارٍ الحفظ...' : 'حفظ البيانات'}
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-2 gap-3.5 max-[1200px]:grid-cols-1">
              <FieldLabel htmlFor="settings-fullName" label="الاسم الكامل">
                <Input
                  id="settings-fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  disabled={savingProfile}
                />
              </FieldLabel>

              <FieldLabel htmlFor="settings-employeeCode" label="كود الموظف">
                <Input
                  id="settings-employeeCode"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  autoComplete="username"
                  disabled={savingProfile}
                />
              </FieldLabel>

              <FieldLabel htmlFor="settings-phone" label="رقم الهاتف">
                <Input
                  id="settings-phone"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={savingProfile}
                />
              </FieldLabel>

              <FieldLabel htmlFor="settings-email" label="البريد الإلكتروني" hint="اختياري">
                <Input
                  id="settings-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@example.com"
                  disabled={savingProfile}
                />
              </FieldLabel>

              <FieldLabel
                htmlFor="settings-bio"
                label="النبذة"
                hint="اختياري"
                className="col-span-full"
              >
                <textarea
                  id="settings-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="اكتب نبذة مختصرة"
                  rows={3}
                  maxLength={500}
                  disabled={savingProfile}
                  className="min-h-[84px] w-full resize-y rounded-[10px] border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-neutral-900 focus:shadow-[0_0_0_2px_rgba(17,17,17,0.12)] disabled:cursor-not-allowed disabled:opacity-55"
                />
              </FieldLabel>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-[10px] border border-dashed border-border px-3.5 py-3">
              <div className="flex flex-col gap-0.5 text-[13px]">
                <span className="text-muted">الدور</span>
                <span className="font-semibold text-foreground">{ROLE_LABELS[profile.role]}</span>
              </div>
              <div className="flex flex-col gap-0.5 text-[13px]">
                <span className="text-muted">النقاط</span>
                <span className="font-semibold tabular-nums text-foreground">{profile.points}</span>
              </div>
            </div>

            <div className="mt-4">
              <FormError message={profileError} />
            </div>
          </SettingsCard>
        </form>

        <form className="flex min-w-0 h-full" onSubmit={(e) => void handlePasswordSubmit(e)}>
          <SettingsCard
            icon={<Shield className="h-[18px] w-[18px]" />}
            title="كلمة المرور"
            description="غيّر كلمة مرور حسابك بعد إدخال كلمة المرور الحالية."
            footer={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={savingPassword || !passwordDirty}
                  onClick={resetPassword}
                  fullOnMobile
                >
                  <RotateCcw />
                  مسح الحقول
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={savingPassword || !passwordDirty}
                  fullOnMobile
                >
                  {savingPassword ? <Loader2 className="animate-spin" /> : <KeyRound />}
                  {savingPassword ? 'جارٍ التغيير...' : 'تغيير كلمة المرور'}
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3.5">
              <FieldLabel htmlFor="settings-current-password" label="كلمة المرور الحالية">
                <PasswordInput
                  id="settings-current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  disabled={savingPassword}
                  visible={showCurrent}
                  onToggleVisible={() => setShowCurrent((v) => !v)}
                />
              </FieldLabel>

              <FieldLabel
                htmlFor="settings-new-password"
                label="كلمة المرور الجديدة"
                hint="4 أحرف على الأقل"
              >
                <PasswordInput
                  id="settings-new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  disabled={savingPassword}
                  visible={showNew}
                  onToggleVisible={() => setShowNew((v) => !v)}
                />
              </FieldLabel>

              <FieldLabel htmlFor="settings-confirm-password" label="تأكيد كلمة المرور">
                <PasswordInput
                  id="settings-confirm-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  disabled={savingPassword}
                  visible={showConfirm}
                  onToggleVisible={() => setShowConfirm((v) => !v)}
                />
              </FieldLabel>
            </div>

            <div className="mt-4">
              <FormError message={passwordError} />
            </div>
          </SettingsCard>
        </form>
      </div>
    </PageShell>
  )
}

export default SettingsPage
