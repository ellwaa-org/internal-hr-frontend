import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  clearSsoState,
  completeSsoLogin,
  consumeSsoReturnTo,
  consumeSsoState,
  loadSsoConfig,
  startSsoLogin,
} from '@/lib/sso'
import { setToken } from '@/lib/api'
import { notify } from '@/lib/toast'

/**
 * Receives the IdP redirect (?code&state), validates the state against the
 * one stored at login start, exchanges the code via our backend, then hands
 * the resulting token to the app shell.
 */
function SsoCallbackPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    void (async () => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('sso') === 'launch') {
      const config = await loadSsoConfig()
      if (!config.enabled || !config.clientId || !config.authorizeUrl) throw new Error('SSO is not configured')
      startSsoLogin('/')
      return
    }
    const code = params.get('code')
    const state = params.get('state')
    const idpError = params.get('error')

    if (idpError) {
      throw new Error(idpError === 'access_denied' ? 'تم رفض الوصول من مزود الهوية.' : `خطأ SSO: ${idpError}`)
    }

    const expectedState = consumeSsoState()
    if (!code || !state || !expectedState || state !== expectedState) {
      throw new Error('جلسة SSO غير صالحة. أعد المحاولة من صفحة الدخول.')
    }
    window.history.replaceState(window.history.state, '', window.location.pathname)

    await completeSsoLogin(code)
      .then((result) => {
        clearSsoState()
        setToken(result.accessToken)
        notify.success('تم تسجيل الدخول بنجاح', 'مرحباً بك في نظام الموارد البشرية.')
        onLogin(result.accessToken)
        window.location.replace(consumeSsoReturnTo())
      })
      .catch((err: unknown) => {
        clearSsoState()
        const message =
          err instanceof Error ? err.message : 'فشل تسجيل الدخول الموحد. أعد المحاولة.'
        setError(message)
      })
    })().catch((err: unknown) => setError(err instanceof Error ? err.message : 'SSO login failed'))
  }, [onLogin])

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-white p-6 text-center">
        <p className="max-w-md text-sm text-muted">{error}</p>
        <a
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
          href="/"
        >
          إعادة المحاولة
        </a>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-white p-6">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
        جارٍ إكمال تسجيل الدخول الموحد…
      </div>
    </div>
  )
}

export default SsoCallbackPage
