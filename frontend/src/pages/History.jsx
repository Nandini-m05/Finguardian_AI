import { useEffect, useMemo, useState } from 'react'
import { Link, navigate } from '../lib/router.jsx'
import { Api } from '../lib/api.js'
import { Btn, Empty, Eyebrow, Notice, OutlookBadge, RiskBadge, Skeleton } from '../components/ui.jsx'
import { Iso } from '../components/Art.jsx'
import { fmtDate, fmtPct } from '../lib/format.js'

const PAGE = 100

export default function History() {
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [outlook, setOutlook] = useState('all')
  const [sel, setSel] = useState([])

  const load = (offset = 0) => Api.list({ limit: PAGE, offset }).then((r) => {
    setRows((prev) => (offset ? [...(prev || []), ...r] : r))
    setMore(r.length === PAGE)
  }).catch((e) => setErr(e.message))

  useEffect(() => { load(0) }, [])

  const filtered = useMemo(() => (rows || []).filter((r) =>
    (!q || r.symbol.includes(q.trim().toUpperCase())) &&
    (status === 'all' || r.status === status) &&
    (outlook === 'all' || r.outlook === outlook)), [rows, q, status, outlook])

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]))
  const compare = () => {
    const picked = (rows || []).filter((r) => sel.includes(r.thread_id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    navigate(`/app/compare?a=${picked[0].thread_id}&b=${picked[1].thread_id}`)
  }

  return (
    <>
      <div className="page-head">
        <div className="l">
          <Eyebrow>History</Eyebrow>
          <h1 className="h2">Every analysis you have run</h1>
          <p className="body">Tick two rows to compare them — two runs of one company, or two different companies.</p>
        </div>
        <Btn disabled={sel.length !== 2} onClick={compare}>{sel.length === 2 ? 'Compare selected' : `Select ${2 - sel.length} more to compare`}</Btn>
      </div>

      {err && <Notice tone="bad">{err}</Notice>}
      {!rows && !err && <Skeleton h={420} />}
      {rows && rows.length === 0 && (
        <Empty title="Nothing here yet." art={<Iso name="stack" />} action={<Btn to="/app/analyze">Run an analysis</Btn>}>
          Analyses you run are saved to your account and appear here, newest first.
        </Empty>
      )}

      {rows && rows.length > 0 && (
        <div className="panel white">
          <div className="row" style={{ marginBottom: 20 }}>
            <input className="input" style={{ maxWidth: 240, textTransform: 'uppercase' }} placeholder="Filter by symbol" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by symbol" />
            <select className="input" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">All statuses</option><option value="completed">Completed</option><option value="pending_review">Pending review</option>
            </select>
            <select className="input" style={{ maxWidth: 220 }} value={outlook} onChange={(e) => setOutlook(e.target.value)} aria-label="Outlook">
              <option value="all">All outlooks</option><option value="positive_signals">Positive signals</option><option value="mixed_signals">Mixed signals</option><option value="negative_signals">Negative signals</option>
            </select>
            <span className="mono-s muted" style={{ marginLeft: 'auto' }}>{filtered.length} of {rows.length}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: 36 }} aria-label="Select" /><th>Symbol</th><th>Run at</th><th>Outlook</th><th className="r">Risk</th><th className="r">Sentiment</th><th className="r">Anomaly</th><th>Review</th></tr></thead>
              <tbody>
                {filtered.map((r) => {
                  const on = sel.includes(r.thread_id)
                  return (
                    <tr key={r.thread_id} className={`click${on ? ' sel' : ''}`} onClick={() => navigate(`/app/analysis/${r.thread_id}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={on} onChange={() => toggle(r.thread_id)} aria-label={`Select ${r.symbol} run of ${fmtDate(r.created_at)}`} style={{ width: 18, height: 18, accentColor: '#131313' }} />
                      </td>
                      <td className="sym"><Link to={`/app/analysis/${r.thread_id}`} onClick={(e) => e.stopPropagation()}>{r.symbol}</Link></td>
                      <td className="small">{fmtDate(r.created_at)}</td>
                      <td><OutlookBadge a={r} /></td>
                      <td className="r"><RiskBadge value={r.risk_score} /></td>
                      <td className="r small">{r.sentiment_score != null ? (r.sentiment_score > 0 ? '+' : '') + r.sentiment_score.toFixed(2) : '—'}</td>
                      <td className="r small">{r.fraud_confidence != null ? fmtPct(r.fraud_confidence * 100, 1, false) : '—'}</td>
                      <td className="small">{r.requires_human_review ? (r.status === 'pending_review' ? <span className="mid">Waiting</span> : `Reviewed: ${r.human_decision}`) : <span className="muted">Not needed</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {more && <div className="mt24"><Btn variant="ghost" size="sm" onClick={() => load(rows.length)}>Load more</Btn></div>}
        </div>
      )}
    </>
  )
}
