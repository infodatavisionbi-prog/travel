import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api.js'

const AuthContext = createContext(null)
const TOKEN_KEY = 'dv_token'
const USER_KEY = 'dv_user'

function readUserCache() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

function readToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(readUserCache())
  const [token, setToken] = useState(readToken())
  const [loading, setLoading] = useState(true)

  const clearAuth = useCallback(() => {
    setProfile(null)
    setToken(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }, [])

  const persistAuth = useCallback((nextToken, user) => {
    setToken(nextToken)
    setProfile(user)
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  }, [])

  const loadProfile = useCallback(async () => {
    const t = readToken()
    if (!t) {
      clearAuth()
      return null
    }
    try {
      const me = await apiFetch('/auth/me', {
        headers: { Authorization: `Bearer ${t}` },
      })
      persistAuth(t, me)
      return me
    } catch {
      clearAuth()
      return null
    }
  }, [clearAuth, persistAuth])

  useEffect(() => {
    loadProfile().finally(() => setLoading(false))
  }, [loadProfile])

  const login = async (identifier, password) => {
    setLoading(true)
    try {
      const username = (identifier || '').trim().toLowerCase()
      if (!username || !password) throw new Error('Usuario y contraseña son obligatorios')

      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      persistAuth(res.token, res.user)
      return res
    } finally {
      setLoading(false)
    }
  }

  const register = async ({ username, phone, fullName, password }) => {
    setLoading(true)
    try {
      const userNameNorm = (username || '').trim().toLowerCase()
      const phoneNorm = (phone || '').trim()
      if (!userNameNorm || !phoneNorm || !password) throw new Error('Usuario, teléfono y contraseña son obligatorios')

      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: userNameNorm,
          phone: phoneNorm,
          name: (fullName || '').trim(),
          password,
        }),
      })
      persistAuth(res.token, res.user)
      return res
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    clearAuth()
    sessionStorage.removeItem('fuel.sess')
  }

  const isAdmin = profile?.is_admin === true

  return (
    <AuthContext.Provider value={{
      session: token ? { access_token: token } : null,
      profile,
      loading,
      login,
      register,
      logout,
      isAdmin,
      isCompanyOwner: false,
      isCompanyPaused: false,
      loadProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
