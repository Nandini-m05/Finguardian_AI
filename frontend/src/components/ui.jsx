import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from '../lib/router.jsx'
import { outlookOf, riskTone } from '../lib/format.js'

export function Arrow({ dir = 'ne' }) {
  const d = dir === 'right' ? 'M3 8h10M9 4l4 4-4 4' : dir === 'left' ? 'M13 8H3M7 4L3 8l4 4' : 'M4 12L12 4M5.5 4H12v6.5'
  const svg = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={d} /></svg>
  return <span className="ic">{svg}{svg}</span>
}

/** Kaivo-style button: label + 40px icon tile with the sliding arrow. */
export function Btn({ to, href, variant = 'dark', size, children, className = '', icon = true, loading, ...rest }) {
  const cls = `btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''} ${className}`.trim()
  const inner = <>{children}{icon && (loading ? <span className="ic"><span className="spinner" /></span> : <Arrow />)}</>
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>
  return <button className={cls} disabled={loading || rest.disabled} {...rest}>{inner}</button>
}

export function Eyebrow({ children, short, className = '', ...rest }) {
  return <span className={`eyebrow mono${short ? ' short' : ''} ${className}`} {...rest}>/ {children}</span>
}

export function Badge({ tone = '', size, children, dot = true, title }) {
  return <span className={`badge ${tone}${size === 'lg' ? ' lg' : ''}`} title={title}>{dot && <i />}{children}</span>
}

export function OutlookBadge({ a, size }) {
  const o = outlookOf(a)
  return <Badge tone={o.tone} size={size}>{size === 'lg' ? o.label : o.short}</Badge>
}

export function RiskBadge({ value }) {
  if (value == null) return <span className="muted">—</span>
  return <Badge tone={riskTone(value)} dot={false}><span className="num">{value.toFixed(1)}</span></Badge>
}

export function Kpi({ label, value, sub, dark, children }) {
  return (
    <div className={`kpi${dark ? ' dark' : ''}`}>
      <span className="mono-s">{label}</span>
      <div>
        <b>{value}</b>
        {sub && <div className="sub">{sub}</div>}
        {children}
      </div>
    </div>
  )
}

export function Skeleton({ h = 120, className = '', style }) {
  return <div className={`skel ${className}`} style={{ height: h, ...style }} />
}

export function Spinner() { return <span className="spinner" aria-label="Loading" /> }

export function Empty({ title, children, action, art }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
      {art && <div className="art" aria-hidden="true">{art}</div>}
    </div>
  )
}

export function Notice({ tone = '', children }) {
  return <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>{children}</div>
}

export function Modal({ open, onClose, children, labelledBy }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="back" onClick={onClose} />
      <div className="sheet">
        <button className="icon-btn" style={{ position: 'absolute', right: 28, top: 28 }} onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 2l10 10M12 2L2 12" /></svg>
        </button>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- toasts
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItems((xs) => [...xs, { id, text, tone }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4800)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.tone}`}><i />{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ---------------------------------------------------------------- reveal on scroll
export function useReveal(deps = []) {
  useEffect(() => {
    document.documentElement.classList.add('js')
    const els = [...document.querySelectorAll('[data-rv]:not(.in)')]
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return
      const el = e.target
      const sib = [...el.parentElement.children].filter((c) => c.hasAttribute('data-rv'))
      el.style.transitionDelay = `${Math.max(0, sib.indexOf(el)) * 0.07}s`
      el.classList.add('in')
      io.unobserve(el)
    }), { rootMargin: '0px 0px -6% 0px' })
    els.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in')
      else io.observe(el)
    })
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Animated count-up for big numbers. */
export function CountUp({ value, decimals = 0, suffix = '' }) {
  const [v, setV] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    if (value == null || Number.isNaN(value)) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setV(value); return }
    const from = ref.current, t0 = performance.now(), dur = 900
    let raf
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      const x = from + (value - from) * (1 - Math.pow(1 - p, 3))
      setV(x); ref.current = x
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  if (value == null || Number.isNaN(value)) return <>—</>
  return <>{v.toFixed(decimals)}{suffix}</>
}
