// Hand-rolled SVG charts (no chart library): one ink line, lime for the
// point that matters, mono axis labels, grid in fog.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fmtCompact, fmtMoney, fmtNum, fmtShortDate } from '../lib/format.js'
import { SHAP_LABELS } from '../lib/analysis.js'

const INK = '#131313', LIME = '#98fe00', GRID = '#e5e5e5', AXIS = '#d3d3d3', MUTED = '#6b6b6b'
const BAD = '#e5484d', WARN = '#ff9500', POS = '#3d7a00'

/** Container width, so the SVG is drawn at 1:1 and its text stays legible on phones. */
function useWidth(initial = 820, min = 300) {
  const ref = useRef(null)
  const [w, setW] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { const cw = Math.round(el.getBoundingClientRect().width); if (cw > 0) setW(Math.max(min, cw)) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [min])
  return [ref, w]
}

function niceTicks(min, max, count = 4) {
  if (!(max > min)) { const p = Math.abs(min) * 0.05 || 1; min -= p; max += p }
  const span = max - min, raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10))
  return { lo, hi, ticks }
}

/** Pointer → nearest index along the x axis of a viewBox chart. */
function useHoverIndex(count, padL, plotW, vbW) {
  const ref = useRef(null)
  const [idx, setIdx] = useState(null)
  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || count < 2) return
    const x = ((e.clientX - r.left) / r.width) * vbW
    const i = Math.round(((x - padL) / plotW) * (count - 1))
    setIdx(Math.max(0, Math.min(count - 1, i)))
  }
  return { ref, idx, onMove, onLeave: () => setIdx(null) }
}

function Tip({ x, y, lines, vbW }) {
  const w = Math.max(...lines.map((l) => l.length)) * 6.6 + 16, h = lines.length * 15 + 10
  const tx = Math.min(Math.max(x - w / 2, 0), vbW - w)
  return (
    <g pointerEvents="none">
      <rect className="tip-bg" x={tx} y={y - h - 10} width={w} height={h} rx="2" />
      {lines.map((l, i) => <text key={i} className="tip-t" x={tx + 8} y={y - h - 10 + 17 + i * 15}>{l}</text>)}
    </g>
  )
}

// ---------------------------------------------------------------- price + volume
export function PriceChart({ dates = [], closes = [], volumes = [], currency, height = 300 }) {
  const [box, W] = useWidth()
  const H = height, padL = 58, padR = 16, padT = 20, volH = 52, padB = 28
  const plotW = W - padL - padR, priceH = H - padT - padB - volH - 12
  const pts = closes.map((c, i) => ({ c, v: volumes[i], d: dates[i] })).filter((p) => typeof p.c === 'number')
  const n = pts.length
  const { lo, hi, ticks } = useMemo(() => niceTicks(Math.min(...pts.map((p) => p.c)), Math.max(...pts.map((p) => p.c))), [closes]) // eslint-disable-line
  const vmax = Math.max(1, ...pts.map((p) => p.v || 0))
  const x = (i) => padL + (n < 2 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v) => padT + priceH - ((v - lo) / (hi - lo || 1)) * priceH
  const hov = useHoverIndex(n, padL, plotW, W)
  if (n < 2) return <p className="muted small" ref={box}>Not enough price history to draw a chart.</p>
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join('')
  const area = `${line}L${x(n - 1)},${padT + priceH}L${x(0)},${padT + priceH}Z`
  const up = pts[n - 1].c >= pts[0].c
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 120))))
  const gid = `pg${n}${Math.round(lo)}`
  const h = hov.idx
  return (
    <div ref={box}>
    <svg ref={hov.ref} className="chart" viewBox={`0 0 ${W} ${H}`} onPointerMove={hov.onMove} onPointerLeave={hov.onLeave} role="img"
      aria-label={`Closing price over ${n} sessions, from ${fmtMoney(pts[0].c, currency)} to ${fmtMoney(pts[n - 1].c, currency)}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={up ? LIME : '#ffb3b5'} stopOpacity=".55" />
          <stop offset="1" stopColor={up ? LIME : '#ffb3b5'} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={padL - 10} y={y(t) + 4} textAnchor="end">{fmtCompact(t)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => {
        const vh = ((p.v || 0) / vmax) * volH
        return <rect key={i} x={x(i) - Math.max(1.5, plotW / n / 2 - 1)} width={Math.max(2, plotW / n - 2)} y={H - padB - vh} height={vh} fill={i === h ? INK : i === n - 1 ? LIME : GRID} />
      })}
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke={AXIS} />
      {pts.map((p, i) => (i % labelEvery === 0 || i === n - 1) && i <= n - 1 && (n - 1 - i >= labelEvery / 2 || i === n - 1)
        ? <text key={i} x={x(i)} y={H - 8} textAnchor={i === n - 1 ? 'end' : 'middle'}>{fmtShortDate(p.d)}</text> : null)}
      <circle cx={x(n - 1)} cy={y(pts[n - 1].c)} r="5" fill={LIME} stroke={INK} strokeWidth="2" />
      {h != null && (
        <g pointerEvents="none">
          <line x1={x(h)} x2={x(h)} y1={padT} y2={H - padB} stroke={INK} strokeDasharray="3 3" />
          <circle cx={x(h)} cy={y(pts[h].c)} r="4.5" fill={INK} />
          <Tip x={x(h)} y={y(pts[h].c)} vbW={W} lines={[fmtShortDate(pts[h].d), fmtMoney(pts[h].c, currency), pts[h].v ? `Vol ${fmtCompact(pts[h].v)}` : '']} />
        </g>
      )}
    </svg>
    </div>
  )
}

// ---------------------------------------------------------------- compare two series
/**
 * Two runs on one chart. Same symbol: real prices by date. Different
 * symbols (or mode="pct"): each rebased to % change from its first point.
 */
export function CompareChart({ a, b, mode = 'price', currency, height = 300 }) {
  const [box, W] = useWidth()
  const H = height, padL = 58, padR = 16, padT = 20, padB = 28
  const plotW = W - padL - padR, plotH = H - padT - padB
  const series = useMemo(() => {
    const prep = (s) => {
      const pts = (s?.dates || []).map((d, i) => ({ d, c: s.closes[i] })).filter((p) => typeof p.c === 'number' && p.d)
      if (mode === 'pct' && pts.length) { const base = pts[0].c || 1; return pts.map((p) => ({ ...p, c: ((p.c - base) / base) * 100 })) }
      return pts
    }
    return [prep(a), prep(b)]
  }, [a, b, mode])
  const allDates = useMemo(() => [...new Set([...series[0], ...series[1]].map((p) => p.d))].sort(), [series])
  const di = useMemo(() => new Map(allDates.map((d, i) => [d, i])), [allDates])
  const vals = [...series[0], ...series[1]].map((p) => p.c)
  const hov = useHoverIndex(allDates.length, padL, plotW, W)
  if (allDates.length < 2 || !vals.length) return <p className="muted small" ref={box}>Not enough price history in one of the runs to compare charts.</p>
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals))
  const N = allDates.length
  const x = (d) => padL + (di.get(d) / (N - 1)) * plotW
  const y = (v) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.c).toFixed(1)}`).join('')
  const fmt = (v) => (mode === 'pct' ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : fmtCompact(v))
  const every = Math.max(1, Math.ceil(N / Math.max(3, Math.floor(W / 120))))
  const hd = hov.idx != null ? allDates[hov.idx] : null
  const at = (s) => s.find((p) => p.d === hd)
  return (
    <div ref={box}>
    <svg ref={hov.ref} className="chart" viewBox={`0 0 ${W} ${H}`} onPointerMove={hov.onMove} onPointerLeave={hov.onLeave} role="img" aria-label="Price comparison of the two runs">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 && mode === 'pct' ? AXIS : GRID} />
          <text x={padL - 10} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke={AXIS} />
      {allDates.map((d, i) => (i % every === 0 && N - 1 - i >= every / 2) || i === N - 1
        ? <text key={d} x={x(d)} y={H - 8} textAnchor={i === N - 1 ? 'end' : 'middle'}>{fmtShortDate(d)}</text> : null)}
      <path d={path(series[0])} fill="none" stroke="#9aa1a8" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
      <path d={path(series[1])} fill="none" stroke={INK} strokeWidth="2.25" strokeLinejoin="round" />
      {series[1].length > 0 && <circle cx={x(series[1].at(-1).d)} cy={y(series[1].at(-1).c)} r="5" fill={LIME} stroke={INK} strokeWidth="2" />}
      {hd && (
        <g pointerEvents="none">
          <line x1={x(hd)} x2={x(hd)} y1={padT} y2={H - padB} stroke={INK} strokeDasharray="3 3" />
          <Tip x={x(hd)} y={padT + 52} vbW={W} lines={[fmtShortDate(hd), `A ${at(series[0]) ? (mode === 'pct' ? fmt(at(series[0]).c) : fmtMoney(at(series[0]).c, currency)) : '—'}`, `B ${at(series[1]) ? (mode === 'pct' ? fmt(at(series[1]).c) : fmtMoney(at(series[1]).c, currency)) : '—'}`]} />
        </g>
      )}
    </svg>
    </div>
  )
}

// ---------------------------------------------------------------- risk gauge
export function RiskGauge({ value, size = 260, dark }) {
  const r = 100, cx = 130, cy = 120, sw = 18
  const pt = (v) => { const a = Math.PI * (1 - v / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const arc = (a0, a1) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `M${x0},${y0}A${r},${r} 0 0 1 ${x1},${y1}` }
  const v = value == null ? null : Math.max(0, Math.min(100, value))
  const tone = v == null ? MUTED : v >= 60 ? BAD : v >= 30 ? WARN : LIME
  const track = dark ? '#2c2c2c' : GRID
  return (
    <svg viewBox="0 0 260 150" width="100%" style={{ maxWidth: size }} role="img" aria-label={`Risk score ${v == null ? 'unavailable' : v.toFixed(1)} out of 100`}>
      <path d={arc(0, 100)} fill="none" stroke={track} strokeWidth={sw} />
      {[30, 60].map((t) => { const [x0, y0] = pt(t); const [x1, y1] = [cx + (r - 16) * Math.cos(Math.PI * (1 - t / 100)), cy - (r - 16) * Math.sin(Math.PI * (1 - t / 100))]; return <line key={t} x1={x0} y1={y0} x2={x1} y2={y1} stroke={dark ? '#555' : AXIS} strokeWidth="1.5" /> })}
      {v != null && v > 0 && <path d={arc(0, v)} fill="none" stroke={tone} strokeWidth={sw} />}
      {v != null && (() => { const [x, y] = pt(v); return <circle cx={x} cy={y} r="7" fill={dark ? INK : '#fff'} stroke={tone} strokeWidth="3" /> })()}
      <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontFamily: 'var(--f-display)', fontSize: 46, fontWeight: 700, letterSpacing: '-.05em', fill: dark ? '#fff' : INK }}>{v == null ? '—' : v.toFixed(1)}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" style={{ fill: dark ? '#a8a8a8' : MUTED }}>OUT OF 100</text>
      <text x={cx - r} y={cy + 24} textAnchor="middle" style={{ fill: dark ? '#a8a8a8' : MUTED }}>0</text>
      <text x={cx + r} y={cy + 24} textAnchor="middle" style={{ fill: dark ? '#a8a8a8' : MUTED }}>100</text>
    </svg>
  )
}

// ---------------------------------------------------------------- SHAP
/** Diverging bars: right = pushed towards an anomaly flag, left = away. */
export function ShapBars({ shap, compare }) {
  const [box, measured] = useWidth(520, 280)
  const keys = Object.keys(SHAP_LABELS).filter((k) => (shap && k in shap) || (compare && k in compare))
  if (!keys.length) return <p className="muted small" ref={box}>No model explanation for this run.</p>
  const max = Math.max(0.01, ...keys.flatMap((k) => [Math.abs(shap?.[k] || 0), Math.abs(compare?.[k] || 0)]))
  const W = Math.min(measured, 640), rowH = compare ? 40 : 30, labelW = 118, mid = labelW + (W - labelW - 60) / 2, half = (W - labelW - 60) / 2
  const H = keys.length * rowH + 22
  const bar = (v, yy, h, color) => {
    const w = (Math.abs(v || 0) / max) * half
    return <rect x={v >= 0 ? mid : mid - w} y={yy} width={Math.max(w, 1)} height={h} fill={color} rx="1.5" />
  }
  return (
    <div ref={box}>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Which features pushed the anomaly model towards or away from a flag" style={{ maxWidth: W }}>
      <text x={mid - 6} y="11" textAnchor="end">← AWAY FROM FLAG</text>
      <text x={mid + 6} y="11">TOWARDS FLAG →</text>
      <line x1={mid} x2={mid} y1="18" y2={H} stroke={AXIS} />
      {keys.map((k, i) => {
        const yy = 22 + i * rowH
        return (
          <g key={k}>
            <text x="0" y={yy + (compare ? 18 : 13)} style={{ fill: INK, textTransform: 'uppercase' }}>{SHAP_LABELS[k]}</text>
            {compare ? (
              <>
                {bar(compare[k], yy + 2, 12, '#b9b9b9')}
                {bar(shap?.[k], yy + 17, 12, (shap?.[k] || 0) >= 0 ? BAD : POS)}
              </>
            ) : bar(shap?.[k], yy + 3, 14, (shap?.[k] || 0) >= 0 ? BAD : POS)}
            <text x={W} y={yy + (compare ? 27 : 14)} textAnchor="end" style={{ fill: INK }}>{fmtNum(shap?.[k] ?? 0, 2)}</text>
          </g>
        )
      })}
    </svg>
    </div>
  )
}

// ---------------------------------------------------------------- sentiment split
export function SentimentSplit({ counts }) {
  const total = counts.positive + counts.neutral + counts.negative
  if (!total) return <p className="muted small">No relevant news was found for this run.</p>
  const pct = (v) => `${(v / total) * 100}%`
  return (
    <div>
      <div className="seg" role="img" aria-label={`${counts.positive} positive, ${counts.neutral} neutral, ${counts.negative} negative articles`}>
        <span style={{ width: pct(counts.positive), background: LIME }} />
        <span style={{ width: pct(counts.neutral), background: '#c7ccd1' }} />
        <span style={{ width: pct(counts.negative), background: BAD }} />
      </div>
      <div className="legend mt16">
        <span><i style={{ background: LIME, height: 10, width: 10 }} />{counts.positive} positive</span>
        <span><i style={{ background: '#c7ccd1', height: 10, width: 10 }} />{counts.neutral} neutral</span>
        <span><i style={{ background: BAD, height: 10, width: 10 }} />{counts.negative} negative</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- dashboard: risk over time
export function RiskTimeline({ rows, onPick, height = 260 }) {
  const [box, W] = useWidth()
  const H = height, padL = 40, padR = 16, padT = 16, padB = 28
  const plotW = W - padL - padR, plotH = H - padT - padB
  const pts = rows.filter((r) => typeof r.risk_score === 'number').map((r) => ({ ...r, t: new Date(r.created_at).getTime() })).sort((a, b) => a.t - b.t)
  const [hover, setHover] = useState(null)
  if (pts.length < 1) return <p className="muted small" ref={box}>Risk scores appear here after your first analysis.</p>
  const t0 = pts[0].t, t1 = pts.at(-1).t
  const x = (t) => padL + (t1 > t0 ? ((t - t0) / (t1 - t0)) * plotW : plotW / 2)
  const y = (v) => padT + plotH - (v / 100) * plotH
  const color = (v) => (v >= 60 ? BAD : v >= 30 ? WARN : LIME)
  const ticks = pts.length > 1 ? (W < 520 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => t0 + (t1 - t0) * f) : [t0]
  return (
    <div ref={box}>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Risk score of each analysis over time">
      <rect x={padL} y={y(100)} width={plotW} height={y(60) - y(100)} fill="#fde2e2" opacity=".45" />
      <rect x={padL} y={y(60)} width={plotW} height={y(30) - y(60)} fill="#ffeccc" opacity=".45" />
      {[0, 30, 60, 100].map((t) => (
        <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} /><text x={padL - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>
      ))}
      {ticks.map((t, i) => <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}>{fmtShortDate(new Date(t).toISOString())}</text>)}
      {pts.map((p) => (
        <g key={p.thread_id} style={{ cursor: onPick ? 'pointer' : 'default' }} onPointerEnter={() => setHover(p)} onPointerLeave={() => setHover(null)} onClick={() => onPick?.(p)}>
          <circle cx={x(p.t)} cy={y(p.risk_score)} r="12" fill="transparent" />
          <circle cx={x(p.t)} cy={y(p.risk_score)} r={hover === p ? 7 : 5.5} fill={color(p.risk_score)} stroke={INK} strokeWidth="1.5" />
        </g>
      ))}
      {hover && <Tip x={x(hover.t)} y={y(hover.risk_score)} vbW={W} lines={[hover.symbol, `Risk ${hover.risk_score.toFixed(1)}`, fmtShortDate(hover.created_at)]} />}
    </svg>
    </div>
  )
}

/** Tiny line for a symbol's risk history (table rows). */
export function Sparkline({ values, width = 96, height = 28 }) {
  const v = values.filter((x) => typeof x === 'number')
  if (v.length < 2) return <span className="muted small">—</span>
  const lo = Math.min(...v, 0), hi = Math.max(...v, 100)
  const pts = v.map((val, i) => `${(i / (v.length - 1)) * (width - 6) + 3},${height - 3 - ((val - lo) / (hi - lo)) * (height - 6)}`)
  const last = pts.at(-1).split(',')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={INK} strokeWidth="1.5" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={LIME} stroke={INK} strokeWidth="1" />
    </svg>
  )
}
