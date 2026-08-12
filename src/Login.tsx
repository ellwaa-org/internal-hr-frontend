import { useState, type FormEvent } from 'react'
import logo from './assets/logo.webp'
import { getDeviceId, login, setToken } from './lib/api'
import { loginSchema, zodErrorMessage } from './lib/schemas'
import { notify } from './lib/toast'
import './Login.css'

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [employeeCode, setEmployeeCode] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => void handleSubmit(e)}>
        <img src={logo} className="login-logo" alt="شعار اللواء للهدمات القانونيه" />
        <h1 className="login-title">اللواء للخدمات القانونيه</h1>
        <p className="login-subtitle">نظام الموارد البشرية</p>

        <label className="login-field" htmlFor="employeeCode">
          <span>كود الموظف</span>
          <input
            id="employeeCode"
            type="text"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            autoComplete="username"
            placeholder="أدخل كود الموظف"
          />
        </label>

        <label className="login-field" htmlFor="password">
          <span>كلمة المرور</span>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="أدخل كلمة المرور"
          />
        </label>

        {fieldError && <p className="login-error">{fieldError}</p>}

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
        </button>
      </form>
    </div>
  )
}

export default Login
