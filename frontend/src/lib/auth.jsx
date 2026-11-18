import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Api, setUnauthorizedHandler, tokenStore } from './api.js'
import { navigate } from './router.jsx'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  const logout = useCallback((reason) => {
    tokenStore.clear()
    setUser(null)
    const next = reason === 'expired' ? '/login?expired=1' : '/login'
    if (window.location.pathname.startsWith('/app')) navigate(next, { replace: true })
  }, [])

  useEffect(() => { setUnauthorizedHandler(() => logout('expired')) }, [logout])

  // Restore the session on load (token survives refresh, unlike the old Streamlit app).
  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return }
    Api.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setReady(true))
  }, [])

  const login = useCallback(async (email, password) => {
    const { access_token } = await Api.login(email, password)
    tokenStore.set(access_token)
    const me = await Api.me()
    setUser(me)
    return me
  }, [])

  const refresh = useCallback(async () => { const me = await Api.me(); setUser(me); return me }, [])

  const value = useMemo(() => ({ user, ready, login, logout, refresh, isAdmin: user?.role === 'admin' }), [user, ready, login, logout, refresh])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
