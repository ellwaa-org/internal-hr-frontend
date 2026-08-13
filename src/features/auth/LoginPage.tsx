import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import logo from '@/assets/logo.webp'
import { getDeviceId, login, setToken } from '@/lib/api'
import { loginSchema, zodErrorMessage } from '@/lib/schemas'
import { notify } from '@/lib/toast'

function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [employeeCode, setEmployeeCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFieldError(null)

    const parsed = loginSchema.safeParse({
      employeeCode,
      password,
      deviceId: getDeviceId(),
    })
    if (!parsed.success) {
      const msg = zodErrorMessage(parsed.error)
      setFieldError(msg)
      notify.error(msg)
      return
    }

    setLoading(true)
    const toastId = notify.loading('جارٍ تسجيل الدخول...')
    try {
      const token = await login(parsed.data)
      notify.dismiss(toastId)
      notify.success('تم تسجيل الدخول بنجاح', 'مرحباً بك في نظام الموارد البشرية.')
      setToken(token)
      onLogin(token)
    } catch (err) {
      notify.dismiss(toastId)
      notify.error(err, 'فشل تسجيل الدخول. تحقق من كود الموظف وكلمة المرور.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-white p-6 max-[480px]:items-start max-[480px]:px-4 max-[480px]:pt-10">
      <form
        className="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-2xl border border-border bg-white px-9 py-10 shadow-elevated max-[480px]:gap-3.5 max-[480px]:rounded-[14px] max-[480px]:px-5 max-[480px]:py-7"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <img
          src={logo}
          className="mb-1 h-24 w-24 object-contain max-[480px]:h-20 max-[480px]:w-20"
          alt="شعار اللواء للخدمات القانونية"
        />
        <h1 className="m-0 text-center text-[22px] leading-snug font-bold text-black max-[480px]:text-lg">
          اللواء للخدمات القانونية
        </h1>
        <p className="mb-2 text-sm text-muted">نظام الموارد البشرية</p>

        <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="employeeCode">
          <span>كود الموظف</span>
          <input
            id="employeeCode"
            type="text"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            autoComplete="username"
            placeholder="أدخل كود الموظف"
            className="box-border w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-3 text-[15px] text-foreground transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)] focus:outline-none"
          />
        </label>

        <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor="password">
          <span>كلمة المرور</span>
          <div className="relative w-full">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="أدخل كلمة المرور"
              className="box-border w-full rounded-lg border border-neutral-300 bg-white py-3 ps-3.5 pe-11 text-[15px] text-foreground transition-[border-color,box-shadow] placeholder:text-neutral-400 focus:border-black focus:shadow-[0_0_0_3px_rgba(0,0,0,0.08)] focus:outline-none"
            />
            <button
              type="button"
              className="absolute end-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-0 text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-black"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </label>

        {fieldError && (
          <p className="m-0 w-full rounded-lg border border-red-200 bg-danger-soft px-3 py-2.5 text-center text-sm text-red-700">
            {fieldError}
          </p>
        )}

        <button
          type="submit"
          className="mt-2 w-full cursor-pointer rounded-lg border-none bg-black px-4 py-[13px] text-base font-semibold text-white transition-[background,transform] hover:bg-neutral-800 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
        >
          {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
        </button>
      </form>
    </div>
  )
}

export default LoginPage
