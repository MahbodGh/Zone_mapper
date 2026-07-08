import { createContext, useContext, useEffect, useState } from 'react'
import { api, setToken } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // restore session from a stored token
  useEffect(() => {
    const tok = localStorage.getItem('zm_token')
    if (!tok) { setLoading(false); return }
    setToken(tok)
    api.me()
      .then(setUser)
      .catch(() => { setToken(null); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const data = await api.login(username, password)
    setToken(data.access_token)
    setUser(data.user)
    return data.user
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  const refreshUser = async () => {
    try { setUser(await api.me()) } catch { /* ignore */ }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
