import { useEffect, useMemo, useState } from 'react'
import { navigate, useLocation } from '../lib/router.jsx'
import { Api } from '../lib/api.js'
import { Btn, Empty, Eyebrow, Notice, OutlookBadge, Skeleton } from '../components/ui.jsx'
import { Iso } from '../components/Art.jsx'
import { CompareChart, RiskGauge, ShapBars } from '../components/charts.jsx'
import { COMPARE_ROWS, deltaClass, metrics, riskBreakdown, whatChanged } from '../lib/analysis.js'
import { fmtDate, fmtMoney, fmtNum, fmtShortDate, fmtSigned, outlookOf } from '../lib/format.js'

function defaultPair(rows) {
  const bySym = new Map()
  for (const r of rows) { if (!bySym.has(r.symbol)) bySym.set(r.symbol, []); bySym.get(r.symbol).push(r) }
  const repeated = [...bySym.values()].find((runs) => runs.length >= 2) // rows are newest first
  if (repeated) return [repeated[1].thread_id, repeated[0].thread_id]
  if (rows.length >= 2) return [rows[1].thread_id, rows[0].thread_id]
  return [null, null]
}

const optionLabel = (r) => `${r.symbol} · ${fmtDate(r.created_at)} · ${outlookOf(r).short}${r.risk_score != null ? ` · risk ${r.risk_score.toFixed(1)}` : ''}`

function RunCard({ a, tag, dark }) {
  const m = metrics(a)
  return (
    <div className={`run-card${dark ? ' b' : ''}`}>
      <div className="spread"><span className="tag"><i />{tag}</span><span className="mono-s muted">{fmtDate(a.created_at)}</span></div>
      <div className="row" style={{ gap: 14 }}><span className="s">{a.symbol}</span><OutlookBadge a={a} /></div>
      <span className="small muted">{a.market_snapshot?.company_name || '—'}</span>
      <div className="spread" style={{ alignItems: 'center' }}>
        <div>
          <span className="mono-s muted">Price</span>
          <div className="h4 num">{fmtMoney(m.price, m.currency)}</div>
        </div>
        <div style={{ width: 170 }}><RiskGauge value={a.risk_score} dark={dark} /></div>
      </div>
      <p className="small" style={{ color: dark ? '#cfcfcf' : 'var(--ink-2)' }}>{a.outlook_rationale || (a.status === 'pending_review' ? 'Awaiting human review — no outlook yet.' : '—')}</p>
    </div>
  )
}

export default function Compare() {
  const { query } = useLocation()
  const [rows, setRows] = useState(null)
  const [A, setA] = useState(null)
  const [B, setB] = useState(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState(null)
  const ida = query.get('a'), idb = query.get('b')

  useEffect(() => { Api.list({ limit: 200 }).then(setRows).catch((e) => setErr(e.message)) }, [])

  // fill in a sensible default pair once history is known
  useEffect(() => {
    if (!rows || (ida && idb)) return
    const [a, b] = defaultPair(rows)
    if (a && b) navigate(`/app/compare?a=${a}&b=${b}`, { replace: true })
  }, [rows, ida, idb])

  useEffect(() => {
    if (!ida || !idb) return
    let alive = true
    setA(null); setB(null); setErr(''); setMode(null)
    Promise.all([Api.detail(ida), Api.detail(idb)])
      .then(([x, y]) => { if (alive) { setA(x); setB(y) } })
      .catch((e) => alive && setErr(e.status === 404 ? 'One of these analyses no longer exists or is not yours.' : e.message))
    return () => { alive = false }
  }, [ida, idb])

  const pick = (which, id) => navigate(`/app/compare?a=${which === 'a' ? id : ida}&b=${which === 'b' ? id : idb}`, { replace: true })
  const swap = () => navigate(`/app/compare?a=${idb}&b=${ida}`, { replace: true })

  const same = A && B && A.symbol === B.symbol
  const sameCcy = A && B && (A.market_snapshot?.currency || 'x') === (B.market_snapshot?.currency || 'x')
  const chartMode = mode || (same && sameCcy ? 'price' : 'pct')
  const changes = useMemo(() => (A && B ? whatChanged(A, B) : []), [A, B])
  const ma = A && metrics(A), mb = B && metrics(B)
  const ba = A && riskBreakdown(A), bb = B && riskBreakdown(B)

  return (
    <>
      <div className="page-head">
        <div className="l">
          <Eyebrow>Compare</Eyebrow>
          <h1 className="h2">{A && B ? (same ? `${A.symbol}: ${fmtShortDate(A.created_at)} vs ${fmtShortDate(B.created_at)}` : `${A.symbol} vs ${B.symbol}`) : 'Compare two analyses'}</h1>
          <p className="body">Pick an earlier run (A) and a later one (B). Same company shows what changed over time; two companies shows how they differ today.</p>
        </div>
      </div>

      {err && <Notice tone="bad">{err}</Notice>}
      {!rows && !err && <Skeleton h={80} />}
      {rows && rows.length < 2 && (
        <Empty title="You need at least two analyses to compare." art={<Iso name="link" />} action={<Btn to="/app/analyze">Run an analysis</Btn>}>
          Run the same ticker twice on different days — or two different tickers — and come back here.
        </Empty>
      )}

      {rows && rows.length >= 2 && (
        <div className="panel">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 300px' }}><span>Run A · earlier</span>
              <select className="input" value={ida || ''} onChange={(e) => pick('a', e.target.value)}>
                {!ida && <option value="">Choose a run</option>}
                {rows.map((r) => <option key={r.thread_id} value={r.thread_id} disabled={r.thread_id === idb}>{optionLabel(r)}</option>)}
              </select>
            </label>
            <button className="icon-btn" style={{ height: 52, width: 52 }} onClick={swap} disabled={!ida || !idb} aria-label="Swap A and B" title="Swap A and B">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 5h10M10 2l3 3-3 3M13 11H3M6 8l-3 3 3 3" /></svg>
            </button>
            <label className="field" style={{ flex: '1 1 300px' }}><span>Run B · later</span>
              <select className="input" value={idb || ''} onChange={(e) => pick('b', e.target.value)}>
                {!idb && <option value="">Choose a run</option>}
                {rows.map((r) => <option key={r.thread_id} value={r.thread_id} disabled={r.thread_id === ida}>{optionLabel(r)}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {ida && idb && !A && !err && <div className="grid g2 mt24"><Skeleton h={360} /><Skeleton h={360} /></div>}

      {A && B && (
        <div className="fade-up">
          <div className="vs mt24">
            <RunCard a={A} tag="Run A" />
            <div className="vs-mid">VS</div>
            <RunCard a={B} tag="Run B" dark />
          </div>

          <div className="grid g-main mt8">
            <div className="panel white">
              <div className="panel-head">
                <span className="mono">{chartMode === 'pct' ? 'Price, rebased to % from first session' : 'Closing price'}</span>
                <div className="row" style={{ gap: 6 }}>
                  <span className="legend" style={{ marginRight: 8 }}><span><i style={{ background: '#9aa1a8' }} />A</span><span><i />B</span></span>
                  <button className={`chip${chartMode === 'price' ? ' on' : ''}`} onClick={() => setMode('price')} disabled={!sameCcy}>Price</button>
                  <button className={`chip${chartMode === 'pct' ? ' on' : ''}`} onClick={() => setMode('pct')}>% change</button>
                </div>
              </div>
              <CompareChart mode={chartMode} currency={ma.currency}
                a={{ dates: A.market_snapshot?.recent_dates, closes: A.market_snapshot?.recent_closes }}
                b={{ dates: B.market_snapshot?.recent_dates, closes: B.market_snapshot?.recent_closes }} />
            </div>
            <div className="panel dark chamfer">
              <span className="mono" style={{ color: 'var(--lime)' }}>/ What changed</span>
              {changes.length
                ? <ul className="changes mt16">{changes.slice(0, 6).map((c) => <li key={c}><span className="ck" />{c}</li>)}</ul>
                : <p className="mt16" style={{ color: '#cfcfcf' }}>The two runs are practically identical on every measure we track.</p>}
            </div>
          </div>

          <div className="section-title"><h2>Side by side</h2><span className="mono-s muted">Change = B − A</span></div>
          <div className="panel white">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Measure</th><th className="r">Run A · {A.symbol}</th><th className="r">Run B · {B.symbol}</th><th className="r">Change</th></tr></thead>
                <tbody>
                  <tr><td>Outlook</td><td className="r"><OutlookBadge a={A} /></td><td className="r"><OutlookBadge a={B} /></td><td className="r">{A.outlook === B.outlook ? <span className="delta flat">same</span> : <span className="delta">changed</span>}</td></tr>
                  {COMPARE_ROWS.map((row) => {
                    const va = ma[row.key], vb = mb[row.key]
                    const fa = row.key === 'price' ? (v) => fmtMoney(v, ma.currency) : row.fmt
                    const fb = row.key === 'price' ? (v) => fmtMoney(v, mb.currency) : row.fmt
                    const cls = deltaClass(row, va, vb)
                    let d = '—'
                    if (va != null && vb != null) {
                      if (row.key === 'price') d = same ? `${fmtSigned(((vb - va) / va) * 100, 2)}%` : '—'
                      else if (row.key === 'fraud') d = `${fmtSigned((vb - va) * 100, 1)} pts`
                      else if (row.key === 'newsCount') d = fmtSigned(vb - va, 0)
                      else d = fmtSigned(vb - va, row.key === 'risk' ? 1 : 2)
                    }
                    return (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td className="r">{va == null ? '—' : fa(va)}</td>
                        <td className="r">{vb == null ? '—' : fb(vb)}</td>
                        <td className="r">{d === '—' ? <span className="muted">—</span> : <span className={`delta ${cls}`}>{d}</span>}</td>
                      </tr>
                    )
                  })}
                  <tr><td>Human review</td><td className="r small">{A.requires_human_review ? (A.human_decision || 'pending') : 'not needed'}</td><td className="r small">{B.requires_human_review ? (B.human_decision || 'pending') : 'not needed'}</td><td /></tr>
                </tbody>
              </table>
            </div>
            <p className="mono-s muted mt16" style={{ lineHeight: '16px' }}>Red = the measure moved in the riskier direction, green = calmer. Price moves are not coloured: up or down is not good or bad here.</p>
          </div>

          <div className="grid g2 mt8">
            <div className="panel">
              <div className="panel-head"><span className="mono">Risk score, point by point</span></div>
              {ba && bb ? ba.map((p, i) => (
                <div key={p.key} style={{ padding: '8px 0' }}>
                  <div className="spread small"><span>{p.label}</span><span className="num">{fmtNum(p.pts, 1)} → <b>{fmtNum(bb[i].pts, 1)}</b> <span className="muted">/ {p.max}</span></span></div>
                  <div className="track" style={{ height: 6, background: 'var(--fog-2)', borderRadius: 2, position: 'relative', marginTop: 6 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(p.pts / p.max) * 100}%`, background: '#b9b9b9', borderRadius: 2 }} />
                  </div>
                  <div className="track" style={{ height: 6, background: 'var(--fog-2)', borderRadius: 2, position: 'relative', marginTop: 3 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(bb[i].pts / p.max) * 100}%`, background: 'var(--ink)', borderRadius: 2 }} />
                  </div>
                </div>
              )) : <p className="muted small">One of these runs predates stored indicators, so the breakdown can’t be shown.</p>}
              <div className="legend mt16"><span><i style={{ background: '#b9b9b9' }} />Run A</span><span><i />Run B</span></div>
            </div>
            <div className="panel">
              <div className="panel-head"><span className="mono">Anomaly model drivers (SHAP)</span></div>
              <ShapBars shap={B.shap_explanation} compare={A.shap_explanation || {}} />
              <div className="legend mt16"><span><i style={{ background: '#b9b9b9' }} />Run A</span><span><i style={{ background: '#e5484d' }} />Run B, towards flag</span><span><i style={{ background: '#3d7a00' }} />Run B, away</span></div>
            </div>
          </div>

          <div className="row mt24">
            <Btn variant="light" size="sm" to={`/app/analysis/${A.thread_id}`}>Open run A</Btn>
            <Btn variant="dark" size="sm" to={`/app/analysis/${B.thread_id}`}>Open run B</Btn>
          </div>
          <p className="disclaimer mt24">Comparisons describe how measured conditions changed between two automated runs. They are not a forecast and not investment advice.</p>
        </div>
      )}
    </>
  )
}
