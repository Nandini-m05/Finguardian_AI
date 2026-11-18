import { useEffect, useState } from 'react'
import { Link, navigate, useLocation } from '../lib/router.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Api } from '../lib/api.js'
import { Logo } from './Art.jsx'

const LINKS = [
  { to: '/app', label: 'Dashboard' },
  { to: '/app/analyze', label: 'Analyze' },
  { to: '/app/history', label: 'History' },
  { to: '/app/compare', label: 'Compare' },
]

export function useScrollNav() {
  const [solid, setSolid] = useState(false)
  const [hide, setHide] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const on = () => {
      const y = window.scrollY
      setSolid(y > 24)
      setHide(y > last && y > 400 && !document.body.classList.contains('menu-open'))
      last = y
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return { solid, hide }
}

export function useMenu() {
  const [open, setOpen] = useState(false)
  useEffect(() => { document.body.classList.toggle('menu-open', open); return () => document.body.classList.remove('menu-open') }, [open])
  return [open, setOpen]
}

export default function AppShell({ children }) {
  const { user, isAdmin, logout } = useAuth()
  const { path } = useLocation()
  const { solid, hide } = useScrollNav()
  const [open, setOpen] = useMenu()
  const [pending, setPending] = useState(0)

  useEffect(() => { setOpen(false) }, [path, setOpen])
  useEffect(() => {
    if (!isAdmin) return
    let alive = true
    const refresh = () => Api.pending().then((r) => alive && setPending(r.length)).catch(() => {})
    refresh()
    window.addEventListener('fg:pending-changed', refresh) // fired by the Review page after a decision
    return () => { alive = false; window.removeEventListener('fg:pending-changed', refresh) }
  }, [isAdmin, path])

  const links = isAdmin ? [...LINKS, { to: '/app/review', label: 'Review', badge: pending }] : LINKS
  const isActive = (to) => (to === '/app' ? path === '/app' : path.startsWith(to) || (to === '/app/history' && path.startsWith('/app/analysis')))

  return (
    <>
      <header className={`nav band${solid ? ' solid' : ''}${hide ? ' hide' : ''}`}>
        <div className="wrap">
          <Link to="/app" aria-label="FinGuardian dashboard"><Logo tag={isAdmin ? 'ADMIN' : null} /></Link>
          <nav className="nav-links" aria-label="Primary">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className={isActive(l.to) ? 'active' : ''} aria-current={isActive(l.to) ? 'page' : undefined}>
                {l.label}{l.badge ? <span className="dot">{l.badge}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="nav-end">
            <span className="user-pill" title={user?.email}>
              <span className="e">{user?.email}</span>
              <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => logout()} aria-label="Log out" title="Log out">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 3H3v10h3M10 5l3 3-3 3M13 8H6" /></svg>
              </button>
            </span>
            <button className="burger" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}><span /><span /><span /></button>
          </div>
        </div>
      </header>
      <div className="mmenu" aria-hidden={!open}>
        {links.map((l) => <Link key={l.to} to={l.to}>{l.label}{l.badge ? ` (${l.badge})` : ''}</Link>)}
        <span className="mono muted mt24">{user?.email}</span>
        <button className="big" onClick={() => { setOpen(false); logout() }}>Log out</button>
      </div>
      <main className="app-main band">
        <div className="wrap">{children}</div>
      </main>
    </>
  )
}

export function RequireAuth({ children, admin }) {
  const { user, ready, isAdmin } = useAuth()
  const { path } = useLocation()
  useEffect(() => {
    if (ready && !user) navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true })
  }, [ready, user, path])
  if (!ready || !user) return <div className="app-main band"><div className="wrap"><div className="skel" style={{ height: 240 }} /></div></div>
  if (admin && !isAdmin) {
    return (
      <AppShell>
        <div className="empty"><h3>Admins only</h3><p>The review queue is for analyst accounts. Ask an existing admin to promote your account in Supabase (see supabase/04_admin_and_checks.sql), then log out and back in.</p></div>
      </AppShell>
    )
  }
  return <AppShell>{children}</AppShell>
}
