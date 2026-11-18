// Tiny history-API router: no dependency, enough for this app's 9 routes.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const RouterCtx = createContext(null)

function readLocation() {
  return {
    path: window.location.pathname.replace(/\/+$/, '') || '/',
    query: new URLSearchParams(window.location.search),
    hash: window.location.hash,
  }
}

export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, '', to)
  else window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState(readLocation)
  useEffect(() => {
    const onPop = () => {
      setLoc(readLocation())
      if (!window.location.hash) window.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return <RouterCtx.Provider value={loc}>{children}</RouterCtx.Provider>
}

export const useLocation = () => useContext(RouterCtx)

/** Match "/app/analysis/:id" against a path; returns params or null. */
export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export function Link({ to, onClick, children, ...rest }) {
  const handle = useCallback((e) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || rest.target === '_blank') return
    if (to.startsWith('#')) return
    e.preventDefault()
    navigate(to)
  }, [to, onClick, rest.target])
  return <a href={to} onClick={handle} {...rest}>{children}</a>
}
