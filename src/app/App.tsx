import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoginPage from '@/features/auth/LoginPage'
import HomePage from '@/features/dashboard/HomePage'
import { clearToken, getProfile, getSsoStartUrl, getToken, isSsoAvailable } from '@/lib/api'
import { errorMessageFromUnknown } from '@/lib/errors'
import { NAV_PATHS } from '@/lib/nav'
import { consumeSsoCallback } from '@/lib/sso'

function App() {
  const sso = consumeSsoCallback()
  const [token, setToken] = useState<string | null>(() => (sso.accessToken ? null : getToken()))
  const [ssoError, setSsoError] = useState<string | null>(() => sso.ssoError)
  const [ssoChecking, setSsoChecking] = useState(() => Boolean(sso.accessToken))
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogin = useCallback((nextToken: string) => {
    setToken(nextToken)
  }, [])

  const handleSignOut = useCallback(() => {
    // Keep the user signed out: the silent-SSO effect must not fire again.
    sessionStorage.setItem('sso_auto_disabled', '1')
    clearToken()
    setToken(null)
  }, [])

  // Silent SSO: with no token and nothing to show, start the SSO round-trip
  // right away. The IdP session cookie (set on the first central login) makes
  // the whole chain invisible — no credentials page, no extra clicks.
  useEffect(() => {
    if (token || ssoChecking || ssoError) return
    if (sessionStorage.getItem('sso_auto_disabled') === '1') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('ssoError') || params.get('accessToken')) return
    let cancelled = false
    void isSsoAvailable().then((available) => {
      if (!cancelled && available) window.location.assign(getSsoStartUrl())
    })
    return () => {
      cancelled = true
    }
  }, [token, ssoChecking, ssoError])

  useEffect(() => {
    if (!sso.accessToken) return
    let cancelled = false
    void getProfile(sso.accessToken)
      .then(() => {
        if (cancelled) return
        setToken(sso.accessToken)
        setSsoChecking(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        clearToken()
        setSsoError(errorMessageFromUnknown(err, 'فشل تسجيل الدخول عبر SSO.'))
        setSsoChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [sso.accessToken])

  useEffect(() => {
    if (location.pathname !== '/auth/sso') return
    if (ssoChecking) return
    navigate(token ? NAV_PATHS.employees : '/', { replace: true })
  }, [location.pathname, token, ssoChecking, navigate])

  if (ssoChecking) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white p-6">
        <p className="m-0 text-sm text-muted">جارٍ إكمال تسجيل الدخول عبر SSO...</p>
      </div>
    )
  }

  if (!token) return <LoginPage onLogin={handleLogin} ssoError={ssoError} />
  return <HomePage token={token} onSignOut={handleSignOut} />
}

export default App
