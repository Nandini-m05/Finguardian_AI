import { useEffect, useMemo, useState } from 'react'
import { Link, navigate } from '../lib/router.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Api } from '../lib/api.js'
import { Badge, Btn, CountUp, Empty, Eyebrow, Kpi, Notice, OutlookBadge, RiskBadge, Skeleton } from '../components/ui.jsx'
import { Iso } from '../components/Art.jsx'
import { RiskTimeline, Sparkline } from '../components/charts.jsx'
import { fmtNum, fmtSigned, timeAgo } from '../lib/format.js'

function OutlookMix({ rows }) {
  const done = rows.filter((r) => r.status === 'completed')
  const c = { positive_signals: 0, mixed_signals: 0, negative_signals: 0 }
  done.forEach((r) => { if (c[r.outlook] !== undefined) c[r.outlook] += 1 })
  const pending = rows.filter((r) => r.status === 'pending_review').length
  const total = done.length + pending || 1
  const parts = [
    ['Positive', c.positive_signals, '#98fe00'], ['Mixed', c.mixed_signals, '#ff9500'], ['Negative', c.negative_signals, '#e5484d'], ['Pending', pending, '#131313'],
  ]
  return (
    <div>
      <div className="seg" style={{ height: 18 }} role="img" aria-label={parts.map(([l, v]) => `${v} ${l}`).join(', ')}>
        {parts.map(([l, v, col]) => <span key={l} style={{ width: `${(v / total) * 100}%`, background: col }} />)}
      </div>
      <div className="grid g4 keep2 mt16" style={{ gap: 0 }}>
        {parts.map(([l, v, col]) => (
          <div key={l} style={{ borderLeft: '1px solid var(--fog-2)', padding: '4px 12px' }}>
            <span className="mono-s muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><i style={{ width: 8, height: 8, background: col, display: 'inline-block', borderRadius: 1 }} />{l}</span>
            <div className="h4 num mt8">{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(null)
  const [quick, setQuick] = useState('')

  useEffect(() => {
    Api.list({ limit: 200 }).then(setRows).catch((e) => setErr(e.message))
    if (isAdmin) Api.pending().then(setPending).catch(() => setPending([]))
  }, [isAdmin])

  const stats = useMemo(() => {
    if (!rows) return null
    const scored = rows.filter((r) => typeof r.risk_score === 'number')
    const avg = scored.length ? scored.reduce((s, r) => s + r.risk_score, 0) / scored.length : null
    const flagged = rows.filter((r) => r.requires_human_review).length
    const waiting = rows.filter((r) => r.status === 'pending_review').length
    // per-symbol: latest run vs the run before it
    const bySym = new Map()
    for (const r of rows) { if (!bySym.has(r.symbol)) bySym.set(r.symbol, []); bySym.get(r.symbol).push(r) }
    const symbols = [...bySym.entries()].map(([symbol, runs]) => {
      const [latest, prev] = runs
      const delta = latest.risk_score != null && prev?.risk_score != null ? latest.risk_score - prev.risk_score : null
      return { symbol, runs, latest, prev, delta, history: runs.map((r) => r.risk_score).reverse() }
    }).sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at))
    return { avg, flagged, waiting, symbols, total: rows.length }
  }, [rows])

  const go = (e) => {
    e.preventDefault()
    const s = quick.trim().toUpperCase()
    navigate(s ? `/app/analyze?symbol=${encodeURIComponent(s)}` : '/app/analyze')
  }

  const name = user?.email?.split('@')[0]

  return (
    <>
      <div className="page-head">
        <div className="l">
          <Eyebrow>Dashboard</Eyebrow>
          <h1 className="h2">Hello, {name}.</h1>
          <p className="body">Your analyses at a glance: how risk has moved, which symbols you track and what is waiting for review.</p>
        </div>
        <form onSubmit={go} className="row quick" style={{ alignItems: 'stretch', flexWrap: 'nowrap' }}>
          <input className="input" style={{ width: 220, height: 52, textTransform: 'uppercase' }} placeholder="Ticker, e.g. TCS.NS" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Ticker to analyse" />
          <Btn type="submit">Analyse</Btn>
        </form>
      </div>

      {err && <Notice tone="bad">{err}</Notice>}

      {!rows && !err && <div className="grid g4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={132} />)}</div>}

      {rows && rows.length === 0 && (
        <Empty title="No analyses yet. Start with a ticker you know." art={<Iso name="pipeline" />}
          action={<div className="row"><Btn to="/app/analyze?symbol=AAPL">Analyse AAPL</Btn><Btn to="/app/analyze?symbol=RELIANCE.NS" variant="light">Analyse RELIANCE.NS</Btn></div>}>
          Each run takes 10–30 seconds and lands here: risk over time, outlook mix, and every symbol you follow with its latest change.
        </Empty>
      )}

      {stats && rows.length > 0 && (
        <>
          <div className="grid g4 keep2">
            <Kpi dark label="Analyses run" value={<CountUp value={stats.total} />} sub={`${stats.symbols.length} symbol${stats.symbols.length === 1 ? '' : 's'}`} />
            <Kpi label="Average risk" value={<CountUp value={stats.avg} decimals={1} />} sub="Out of 100, across all runs" />
            <Kpi label="Flagged for review" value={<CountUp value={stats.flagged} />} sub={stats.flagged ? 'Anomaly screen asked for a human' : 'None so far'} />
            <Kpi label={isAdmin ? 'Your review queue' : 'Awaiting review'} value={<CountUp value={isAdmin ? (pending?.length ?? 0) : stats.waiting} />}
              sub={isAdmin ? <Link className="link" to="/app/review">Open queue</Link> : 'Your cases with an admin'} />
          </div>

          <div className="grid g-main mt8">
            <div className="panel white">
              <div className="panel-head"><span className="mono">Risk score per analysis</span><span className="legend"><span><i style={{ background: '#98fe00', height: 8, width: 8 }} />&lt;30</span><span><i style={{ background: '#ff9500', height: 8, width: 8 }} />30–60</span><span><i style={{ background: '#e5484d', height: 8, width: 8 }} />60+</span></span></div>
              <RiskTimeline rows={rows} onPick={(r) => navigate(`/app/analysis/${r.thread_id}`)} />
            </div>
            <div className="panel">
              <div className="panel-head"><span className="mono">Outlook mix</span><span className="mono-s muted">{rows.length} runs</span></div>
              <OutlookMix rows={rows} />
              <hr className="divider" />
              <span className="mono-s muted">Latest</span>
              {rows.slice(0, 3).map((r) => (
                <Link key={r.thread_id} to={`/app/analysis/${r.thread_id}`} className="spread" style={{ padding: '12px 0', borderBottom: '1px solid var(--fog-2)' }}>
                  <span><b style={{ letterSpacing: '-.02em' }}>{r.symbol}</b> <span className="muted small">{timeAgo(r.created_at)}</span></span>
                  <OutlookBadge a={r} />
                </Link>
              ))}
            </div>
          </div>

          <div className="section-title">
            <h2>Symbols you follow</h2>
            <div className="row"><Btn variant="ghost" size="sm" to="/app/history">Full history</Btn></div>
          </div>
          <div className="panel white">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Symbol</th><th>Runs</th><th>Latest outlook</th><th className="r">Latest risk</th><th className="r">Change vs previous</th><th>Risk trend</th><th>Last run</th><th /></tr></thead>
                <tbody>
                  {stats.symbols.map((s) => (
                    <tr key={s.symbol} className="click" onClick={() => navigate(`/app/analysis/${s.latest.thread_id}`)}>
                      <td className="sym">{s.symbol}</td>
                      <td>{s.runs.length}</td>
                      <td><OutlookBadge a={s.latest} /></td>
                      <td className="r"><RiskBadge value={s.latest.risk_score} /></td>
                      <td className="r">{s.delta == null ? <span className="muted">—</span> : <span className={`delta ${Math.abs(s.delta) < 0.05 ? 'flat' : s.delta > 0 ? 'worse' : 'better'}`}>{fmtSigned(s.delta, 1)}</span>}</td>
                      <td><Sparkline values={s.history} /></td>
                      <td className="muted small">{timeAgo(s.latest.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {s.prev ? <Link className="chip" to={`/app/compare?a=${s.prev.thread_id}&b=${s.latest.thread_id}`}>Compare</Link>
                          : <Link className="chip" to={`/app/analyze?symbol=${encodeURIComponent(s.symbol)}`}>Re-run</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}

      {isAdmin && pending && pending.length > 0 && (
        <>
          <div className="section-title"><h2>Waiting for your review</h2><Btn variant="ghost" size="sm" to="/app/review">Open queue</Btn></div>
          <div className="grid g3">
            {pending.slice(0, 3).map((p) => (
              <Link key={p.thread_id} to="/app/review" className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="spread"><b className="h4">{p.symbol}</b><Badge tone="ink">Pending</Badge></div>
                <span className="small muted">From {p.requested_by_email || 'a deleted user'} · {timeAgo(p.created_at)}</span>
                <span className="small">Risk {fmtNum(p.risk_score, 1)} · anomaly {p.fraud_confidence != null ? `${(p.fraud_confidence * 100).toFixed(1)}%` : '—'}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}
