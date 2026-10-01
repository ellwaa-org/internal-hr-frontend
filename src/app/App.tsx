import { useCallback, useEffect, useState } from 'react'
import LoginPage from '@/features/auth/LoginPage'
import RegisterPage from '@/features/auth/RegisterPage'
import SsoCallbackPage from '@/features/auth/SsoCallbackPage'
import HomePage from '@/features/dashboard/HomePage'
import { clearToken, getToken } from '@/lib/api'
import { getSsoTokens, silentRefresh } from '@/lib/sso'

const REFRESH_FALLBACK_MS = 4 * 60 * 1000

function App() {
  const [token, setToken] = useState<string | null>(() => getSsoTokens()?.accessToken ?? getToken())

  // Silent token refresh keeps SSO sessions alive without a portal round-trip.
  useEffect(() => {
    let timer: number | undefined
    const schedule = (ms: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void silentRefresh().then((next) => {
          if (next) setToken(next)
          schedule(REFRESH_FALLBACK_MS)
        })
      }, ms)
    }
    const tokens = getSsoTokens()
    if (tokens?.refreshToken) schedule(REFRESH_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [token])

  const handleLogin = useCallback((nextToken: string) => {
    setToken(nextToken)
  }, [])

  const handleSignOut = useCallback(() => {
    clearToken()
    setToken(null)
  }, [])

  if (readCallback()) {
    return <SsoCallbackPage onLogin={handleLogin} />
  }

  if (window.location.pathname === '/register') {
    return <RegisterPage />
  }

  if (!token) return <LoginPage onLogin={handleLogin} />
  return <HomePage token={token} onSignOut={handleSignOut} />
}

function readCallback(): { code: string; state: string } | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  return code && state ? { code, state } : null
}

export default App
