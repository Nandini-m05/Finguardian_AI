// Visual devices from the reference design: isometric block drawings,
// the pixel-grid hover, the animated "reel" and the neon mark.
import { useEffect, useId, useRef } from 'react'

const C = Math.cos(Math.PI / 6), S = Math.sin(Math.PI / 6)
const P = (x, y, z, o) => [o[0] + (x - y) * C, o[1] + (x + y) * S - z]
const PAL = {
  lime: ['#c8ff73', '#98fe00', '#62b500', '#4d8f00'],
  gray: ['#f2f3f4', '#c7ccd1', '#9aa1a8', '#7d848b'],
  line: ['#ffffff', '#ececec', '#dadada', '#b9b9b9'],
  dark: ['#3a3a3a', '#262626', '#1c1c1c', '#4a4a4a'],
}

function Box({ o, b: [x, y, z, w, d, h, p] }) {
  const k = PAL[p]
  const pts = (a) => a.map((q) => P(q[0], q[1], q[2], o).join(',')).join(' ')
  const top = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]
  const left = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]
  const right = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]
  const sw = p === 'line' ? 1.2 : 0.8
  return (
    <g>
      <polygon points={pts(left)} fill={k[1]} stroke={k[3]} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={pts(right)} fill={k[2]} stroke={k[3]} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={pts(top)} fill={k[0]} stroke={k[3]} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  )
}

function Shadow({ o, x, y, w, d, op = 0.12, fid }) {
  const pts = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]].map((q) => P(q[0], q[1], 0, o).join(',')).join(' ')
  return <polygon points={pts} fill="#000" opacity={op} filter={`url(#${fid})`} />
}

// Scenes: [origin, shadow?, boxes]
const SCENES = {
  // rising bars on a slab: the "analysis" hero
  hero: { vb: '0 0 600 420', o: [300, 150], sh: [[300, 190], -120, -60, 300, 200, 0.14],
    boxes: [[-120, -40, 0, 280, 150, 26, 'gray'], [-100, -20, 26, 40, 40, 50, 'gray'], [-40, -20, 26, 40, 40, 90, 'gray'], [20, -20, 26, 40, 40, 70, 'gray'], [80, -20, 26, 40, 40, 140, 'lime'], [-100, 50, 26, 220, 50, 14, 'gray'], [-80, 60, 40, 60, 30, 10, 'lime']] },
  pipeline: { vb: '0 0 420 420', o: [200, 190], sh: [[200, 220], -70, -30, 190, 70, 0.12],
    boxes: [[-70, 0, 0, 40, 40, 40, 'gray'], [-20, 0, 0, 40, 40, 80, 'gray'], [30, 0, 0, 40, 40, 125, 'gray'], [80, 0, 0, 40, 40, 180, 'lime']] },
  steps: { vb: '0 0 277 204', o: [150, 62], boxes: [[0, 40, 0, 120, 40, 16, 'line'], [0, 0, 0, 40, 40, 52, 'line'], [40, 0, 0, 40, 40, 36, 'line'], [80, 0, 0, 40, 40, 20, 'line']] },
  slab: { vb: '0 0 277 204', o: [150, 56], boxes: [[0, 0, 0, 120, 80, 18, 'line'], [12, 12, 18, 96, 56, 10, 'line'], [22, 22, 28, 70, 6, 3, 'line'], [22, 38, 28, 70, 6, 3, 'line'], [22, 54, 28, 70, 6, 3, 'line']] },
  cube: { vb: '0 0 190 140', o: [95, 40], boxes: [[0, 0, 0, 56, 56, 48, 'line'], [16, 56, 20, 24, 3, 9, 'line'], [56, 16, 20, 3, 24, 9, 'line']] },
  link: { vb: '0 0 190 140', o: [95, 46], boxes: [[-10, 0, 0, 36, 36, 36, 'line'], [26, 12, 12, 28, 10, 9, 'line'], [54, 0, 0, 36, 36, 36, 'line']] },
  row: { vb: '0 0 190 140', o: [95, 40], boxes: [[0, 0, 0, 100, 30, 6, 'line'], [6, 4, 6, 22, 22, 22, 'line'], [38, 4, 6, 22, 22, 22, 'line'], [70, 4, 6, 22, 22, 22, 'line']] },
  stack: { vb: '0 0 420 420', o: [210, 190], sh: [[210, 220], -50, -50, 130, 130, 0.12],
    boxes: [0, 1, 2, 3].map((i) => [-40 + i * 4, -40 + i * 4, i * 48, 110 - i * 8, 110 - i * 8, 48, i % 2 ? 'lime' : 'gray']) },
  grid: { vb: '0 0 420 420', o: [210, 160], sh: [[210, 200], -60, -60, 180, 180, 0.12],
    boxes: [[-60, -60, 0, 180, 180, 16, 'gray'], ...[[-45, -45, 'lime'], [15, -45, 'gray'], [-45, 15, 'gray'], [75, -45, 'gray'], [15, 15, 'gray'], [-45, 75, 'gray'], [75, 15, 'lime'], [15, 75, 'gray'], [75, 75, 'gray']].map(([x, y, c], i) => [x, y, 16, 40, 40, c === 'lime' ? 60 : 30 + (i % 3) * 8, c])] },
  darkbars: { vb: '0 0 420 420', o: [200, 190], sh: null,
    boxes: [[-70, 0, 0, 40, 40, 60, 'dark'], [-20, 0, 0, 40, 40, 100, 'dark'], [30, 0, 0, 40, 40, 150, 'dark'], [80, 0, 0, 40, 40, 210, 'lime']] },
}

export function Iso({ name, className, style }) {
  const fid = `sh${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const s = SCENES[name]
  if (!s) return null
  return (
    <svg viewBox={s.vb} className={className} style={style} aria-hidden="true">
      <defs><filter id={fid} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" /></filter></defs>
      {s.sh && <Shadow o={s.sh[0]} x={s.sh[1]} y={s.sh[2]} w={s.sh[3]} d={s.sh[4]} op={s.sh[5]} fid={fid} />}
      {s.boxes.map((b, i) => <Box key={i} o={s.o} b={b} />)}
    </svg>
  )
}

/** 40px pixel cells light up under the pointer and fade (reference "px" canvas). */
export function PixelHover() {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current, host = cv?.parentElement
    if (!cv || !host) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const ctx = cv.getContext('2d'), cell = 40
    let cells = new Map(), raf = 0, d = 1, cols = 0
    const size = () => {
      const r = host.getBoundingClientRect()
      d = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); cols = Math.ceil(r.width / cell)
    }
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height)
      let any = false
      cells.forEach((a, k) => {
        a -= 0.028
        if (a <= 0) { cells.delete(k); return }
        any = true; cells.set(k, a)
        const x = k % cols, y = (k / cols) | 0
        ctx.fillStyle = `rgba(255,255,255,${a})`
        ctx.fillRect(x * cell * d + 1, y * cell * d + 1, cell * d - 2, cell * d - 2)
      })
      raf = any ? requestAnimationFrame(draw) : 0
    }
    const move = (e) => {
      if (reduce) return
      const r = host.getBoundingClientRect()
      const x = ((e.clientX - r.left) / cell) | 0, y = ((e.clientY - r.top) / cell) | 0
      cells.set(y * cols + x, 0.95)
      if (!raf) raf = requestAnimationFrame(draw)
    }
    size()
    window.addEventListener('resize', size)
    host.addEventListener('pointermove', move)
    return () => { window.removeEventListener('resize', size); host.removeEventListener('pointermove', move); cancelAnimationFrame(raf) }
  }, [])
  return <canvas ref={ref} className="px" />
}

/** The dark "reel" tile: animated signal lines, like a live market trace. */
export function Reel({ label = 'Live signal', right = '8 agents', ticker }) {
  const ref = useRef(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let w, h, t = 0, raf
    const size = () => {
      const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); w = cv.width; h = cv.height
    }
    const frame = () => {
      t += 0.008
      ctx.fillStyle = '#131313'; ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 14; i++) {
        const y = h * (0.2 + (0.6 * i) / 14)
        ctx.strokeStyle = `rgba(152,254,0,${0.08 + 0.5 * Math.max(0, Math.sin(t * 2 + i * 0.6)) ** 6})`
        ctx.lineWidth = 1.5 * (w / 288)
        ctx.beginPath()
        for (let x = 0; x <= w; x += w / 40) {
          const yy = y + Math.sin((x / w) * 6 + t * 3 + i) * h * 0.03
          x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)
        }
        ctx.stroke()
      }
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    size(); frame()
    window.addEventListener('resize', size)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size) }
  }, [])
  return (
    <div className="reel" aria-hidden="true">
      <canvas ref={ref} />
      <span className="tag mono">{label}</span>
      {ticker && <span className="ticker mono">{ticker}</span>}
      <span className="dur mono">{right}</span>
    </div>
  )
}

export function NeonMark({ className = 'neon' }) {
  return (
    <svg className={className} viewBox="0 0 300 300" aria-hidden="true">
      <g fill="none" stroke="#98fe00" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <rect x="30" y="30" width="240" height="240" rx="56" />
        <rect x="42" y="42" width="216" height="216" rx="46" strokeWidth="1.5" opacity=".6" />
        <path d="M150 70l70 28v52c0 46-30 78-70 92-40-14-70-46-70-92V98z" />
        <path d="M115 152l25 25 47-52" strokeWidth="4" />
      </g>
    </svg>
  )
}

export function Logo({ dark, tag }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 26 26" aria-hidden="true">
        <rect x="1" y="1" width="24" height="24" rx="6" fill={dark ? '#98fe00' : '#131313'} />
        <path d="M13 5.5l6 2.4v4.6c0 4-2.6 6.9-6 8-3.4-1.1-6-4-6-8V7.9z" fill="none" stroke={dark ? '#131313' : '#98fe00'} strokeWidth="2" strokeLinejoin="round" />
        <path d="M10 13.6l2.1 2.1 3.9-4.4" fill="none" stroke={dark ? '#131313' : '#98fe00'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      FinGuardian{tag && <small>{tag}</small>}
    </span>
  )
}
