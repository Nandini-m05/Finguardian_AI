import { useEffect, useState } from 'react'
import { Link, navigate, useLocation } from '../lib/router.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Api } from '../lib/api.js'
import { Btn, Notice } from '../components/ui.jsx'
import { Iso, Logo } from '../components/Art.jsx'

export default function Auth({ mode }) {
  const { login, user, ready } = useAuth()
  const { query } = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ack, setAck] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(query.get('expired') ? 'Your session expired. Log in again.' : '')
  const next = query.get('next') && query.get('next').startsWith('/app') ? query.get('next') : '/app'

  useEffect(() => { if (ready && user) navigate(next, { replace: true }) }, [ready, user, next])
  useEffect(() => { setErr('') }, [mode])

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setInfo('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr('Enter a valid email address.')
    if (mode === 'register') {
      if (password.length < 8) return setErr('Use at least 8 characters for the password.')
      if (!ack) return setErr('Tick the box to confirm you understand this is not investment advice.')
    }
    setBusy(true)
    try {
      if (mode === 'register') await Api.register(email.trim(), password)
      await login(email.trim(), password)
      navigate(next, { replace: true })
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/"><Logo dark /></Link>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="mono" style={{ color: 'var(--lime)' }}>/ {mode === 'register' ? 'Create account' : 'Welcome back'}</span>
          <h2 className="h2 mt24">{mode === 'register' ? 'Start with a ticker. Leave with the reasons.' : 'Your analyses are where you left them.'}</h2>
          <p className="body mt24" style={{ color: '#bdbdbd', maxWidth: 440 }}>Risk score, anomaly screen, FinBERT news sentiment and a human-reviewed outlook for any Yahoo Finance symbol.</p>
        </div>
        <Iso name="darkbars" className="art" />
        <span className="mono-s" style={{ color: '#8f8f8f', position: 'relative', zIndex: 1 }}>Educational project · not investment advice</span>
      </aside>
      <section className="auth-form">
        <form onSubmit={submit} noValidate>
          <div className="tabs" role="tablist">
            <Link to={`/login${query.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className={mode === 'login' ? 'on' : ''} role="tab" aria-selected={mode === 'login'}>Log in</Link>
            <Link to={`/register${query.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className={mode === 'register' ? 'on' : ''} role="tab" aria-selected={mode === 'register'}>Register</Link>
          </div>
          <h1 className="h3 mt24">{mode === 'register' ? 'Create your account' : 'Log in to FinGuardian'}</h1>
          {info && <Notice tone="warn">{info}</Notice>}
          <label className="field"><span>Email</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err && /email/i.test(err)} required />
          </label>
          <label className="field"><span>Password</span>
            <input className="input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!err && /password/i.test(err)} required />
          </label>
          {mode === 'register' && (
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I understand FinGuardian is an educational tool, not investment advice, and is not registered with SEBI or any regulator.</span>
            </label>
          )}
          <p className="form-err" role="alert">{err}</p>
          <Btn type="submit" className="full" loading={busy}>{mode === 'register' ? 'Create account' : 'Log in'}</Btn>
          <p className="small muted">
            {mode === 'register' ? <>Already registered? <Link className="link" to="/login">Log in</Link></> : <>New here? <Link className="link" to="/register">Create an account</Link></>}
          </p>
        </form>
      </section>
    </div>
  )
}
