import { useCallback, useState } from 'react'
import LoginPage from '@/features/auth/LoginPage'
import HomePage from '@/features/dashboard/HomePage'
import { clearToken, getToken } from '@/lib/api'

function App() {
  const [token, setToken] = useState<string | null>(() => getToken())

  const handleLogin = useCallback((nextToken: string) => {
    setToken(nextToken)
  }, [])

  const handleSignOut = useCallback(() => {
    clearToken()
    setToken(null)
  }, [])

  if (!token) return <LoginPage onLogin={handleLogin} />
  return <HomePage token={token} onSignOut={handleSignOut} />
}

export default App
