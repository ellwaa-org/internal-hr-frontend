import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import logo from '@/assets/logo.webp'
import { unifiedRegisterApi } from '@/lib/api'
import { loadSsoConfig, isSsoAutoDisabled, startSsoLogin, type SsoConfig } from '@/lib/sso'
import { registerUnifiedSchema, zodErrorMessage } from '@/lib/schemas'
import { notify } from '@/lib/toast'

/**
 * Unified registration (portal-backed, same pattern as Sales): the account is
 * created in the central Account Manager IdP through our backend proxy, then
 * the user continues to SSO sign-in. Falls back to local-only UI when SSO is
 * not configured.
 */
function RegisterPage({ onLogin: _onLogin }: { onLogin: (token: string) => void }) {
  const [config, setConfig] = useState<SsoConfig | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    loadSsoConfig().then((value) => {
      if (!value.enabled || isSsoAutoDisabled()) return
      setConfig(value)
    })
  }, [])

  const startSso = () => startSsoLogin('/')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFieldError(null)

    const parsed = registerUnifiedSchema.safeParse({
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      password,
      confirmPassword,
    })
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setFieldError(msg)
      notify.error(msg)
      return
    }
    if (parsed.data.password !== parsed.data.confirmPassword) {
      const msg = 'كلمتا المرور غير متطابقتين.'
      setFieldError(msg)
      notify.error(msg)
      return
    }

    setLoading(true)
    const toastId = notify.loading('جارٍ إنشاء الحساب...')
    try {
      const { confirmPassword: _confirm, ...payload } = parsed.data
      await unifiedRegisterApi(payload)
      notify.dismiss(toastId)
      notify.success('تم إنشاء الحساب', 'أكمل الدخول الموحد للمتابعة.')
      startSsoLogin('/')
    } catch (err) {
      notify.dismiss(toastId)
      notify.error(err, 'فشل إنشاء الحساب. تحقق من البيانات وأعد المحاولة.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-white p-6 max-[480px]:items-start max-[480px]:px-4 max-[480px]:pt-10">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-4">
        <form
          className="flex w-full flex-col items-center gap-4 rounded-2xl border border-border bg-white px-9 py-10 shadow-elevated max-[480px]:gap-3.5 max-[480px]:rounded-[14px] max-[480px]:px-5 max-[480px]:py-7"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <img
            src={logo}
            className="mb-1 h-20 w-20 object-contain"
            alt="شعار اللواء للخدمات القانونية"
          />
          <h1 className="m-0 text-center text-[22px] font-bold leading-snug text-black">
            إنشاء حساب — الموارد البشرية
          </h1>
          <p className="mb-2 text-center text-sm text-muted">
            التسجيل الموحد عبر حساب المنصة المركزي
          </p>

          <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="reg-first">
            <span>الاسم الأول</span>
            <input
              id="reg-first"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              placeholder="أدخل الاسم الأول"
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
            />
          </label>

          <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="reg-last">
            <span>الاسم الأخير</span>
            <input
              id="reg-last"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              placeholder="أدخل الاسم الأخير"
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
            />
          </label>

          <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="reg-email">
            <span>البريد الإلكتروني</span>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
            />
          </label>

          <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="reg-phone">
            <span>رقم الهاتف (اختياري)</span>
            <input
              id="reg-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="+20 100 000 0000"
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
            />
          </label>

          <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="reg-password">
            <span>كلمة المرور</span>
            <div className="relative w-full">
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="8 أحرف على الأقل، حرف ورقم"
                className="w-full rounded-lg border border-neutral-300 bg-white pe-11 ps-3.5 py-3 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
              />
              <button
                type="button"
                className="absolute end-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-muted transition-colors hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </label>

          <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="reg-confirm">
            <span>تأكيد كلمة المرور</span>
            <input
              id="reg-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)]"
            />
          </label>

          {fieldError && (
            <p className="m-0 w-full rounded-lg border border-red-200 bg-danger-soft px-3 py-2.5 text-center text-sm text-red-700">
              {fieldError}
            </p>
          )}

          <button
            type="submit"
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-none bg-black px-4 py-[13px] text-base font-semibold text-white outline-offset-2 transition-[background,transform] hover:bg-neutral-800 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={loading}
          >
            <UserPlus className="h-[18px] w-[18px]" />
            {loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
          </button>

          <button
            type="button"
            className="m-0 w-full cursor-pointer border-none bg-transparent p-0 text-center text-sm font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => (config?.enabled ? startSso() : undefined)}
            disabled={!config?.enabled}
            style={{ visibility: config?.enabled ? 'visible' : 'hidden' }}
          >
            لديك حساب بالفعل؟ الدخول الموحد
          </button>
        </form>
      </div>
    </div>
  )
}

export default RegisterPage