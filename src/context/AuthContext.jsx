import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)
const PROFILE_CACHE = 'fuel.profile'

function readCache() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE)
    return raw ? JSON.parse(raw) : null
  } catch {
    localStorage.removeItem(PROFILE_CACHE)
    return null
  }
}

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(readCache())
  const [session, setSession] = useState(null)
  // Skip loading screen if we have a cached profile — validate session in background
  const [loading, setLoading] = useState(() => !readCache())

  const clearProfile = useCallback(() => {
    setProfile(null)
    localStorage.removeItem(PROFILE_CACHE)
  }, [])

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      clearProfile()
      return null
    }

    try {
      console.log('Cargando profile:', userId)

      const { data, error } = await supabase
        .from('profiles')
        .select('*, companies(paused)')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Profile error:', error)
        clearProfile()
        return null
      }

      if (!data) {
        clearProfile()
        return null
      }

      if (!data.is_active) {
        clearProfile()
        setSession(null)
        await supabase.auth.signOut()
        return null
      }

      localStorage.setItem(PROFILE_CACHE, JSON.stringify(data))
      setProfile(data)

      // No bloquea la app
      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.warn('last_seen_at error:', error)
        })

      return data
    } catch (err) {
      console.error('loadProfile crash:', err)
      clearProfile()
      return null
    }
  }, [clearProfile])

  useEffect(() => {
    let alive = true

    const initAuth = async () => {
      try {
        console.log('Init auth...')

        const { data, error } = await supabase.auth.getSession()

        if (!alive) return

        if (error) {
          console.error('getSession error:', error)
          setSession(null)
          clearProfile()
          return
        }

        const currentSession = data?.session ?? null
        setSession(currentSession)

        if (!currentSession) {
          clearProfile()
          return
        }

        await loadProfile(currentSession.user.id)
      } catch (err) {
        console.error('initAuth crash:', err)
        if (!alive) return
        setSession(null)
        clearProfile()
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    initAuth()

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('Auth event:', event)

      if (event === 'INITIAL_SESSION') return

      setSession(newSession)

      if (!newSession) {
        clearProfile()
        setLoading(false)
        return
      }

      // Importante: sin await acá para evitar loop/race condition
      loadProfile(newSession.user.id)

      setLoading(false)
    })

    return () => {
      alive = false
      data?.subscription?.unsubscribe()
    }
  }, [loadProfile, clearProfile])

  const login = async (identifier, password) => {
    setLoading(true)

    try {
      const rawIdentifier = (identifier || '').trim()
      if (!rawIdentifier || !password) {
        throw new Error('Usuario y contraseña son obligatorios')
      }

      let emailToUse = rawIdentifier.toLowerCase()
      if (!rawIdentifier.includes('@')) {
        const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', {
          login_identifier: rawIdentifier,
        })
        if (resolveError) throw resolveError
        if (!resolvedEmail) throw new Error('Usuario o contraseña incorrectos')
        emailToUse = String(resolvedEmail).toLowerCase()
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      })

      if (error) throw error

      setSession(data.session)

      if (data?.session?.user?.id) {
        await loadProfile(data.session.user.id)
      }

      return data
    } finally {
      setLoading(false)
    }
  }

  const register = async ({ email, password, fullName, companyName, username }) => {
    setLoading(true)

    try {
      const normalizedUsername = (username || '').trim()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
            username: normalizedUsername || null,
          },
        },
      })

      if (error) throw error

      setSession(data.session)

      if (data?.session?.user?.id) {
        await loadProfile(data.session.user.id)
      }

      return data
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      clearProfile()
      setSession(null)
      sessionStorage.removeItem('fuel.sess')
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Logout error:', err)
      clearProfile()
      setSession(null)
    }
  }

  const isAdmin          = profile?.role === 'admin'
  const isCompanyOwner   = profile?.company_role === 'owner' && !isAdmin
  const isCompanyPaused  = !isAdmin && profile?.companies?.paused === true

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        login,
        register,
        logout,
        isAdmin,
        isCompanyOwner,
        isCompanyPaused,
        loadProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
