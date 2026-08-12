import { useCallback, useState } from 'react'
import Login from './Login'
import Home from './Home'
import { clearToken, getToken } from './lib/api'
import './App.css'

function App() {
  const [token, setToken] = useState<string | null>(() => getToken())

  const handleLogin = useCallback((nextToken: string) => {
    setToken(nextToken)
  }, [])

  const handleSignOut = useCallback(() => {
    clearToken()
    setToken(null)
  }, [])

  if (!token) return <Login onLogin={handleLogin} />
  return <Home token={token} onSignOut={handleSignOut} />
}

export default App
