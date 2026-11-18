import { Badge, Btn, Eyebrow, Kpi, OutlookBadge } from './ui.jsx'
import { PriceChart, RiskGauge, SentimentSplit, ShapBars } from './charts.jsx'
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtSigned, outlookOf, riskWord, timeAgo } from '../lib/format.js'
import { metrics, parseLog, riskBreakdown, sentimentCounts } from '../lib/analysis.js'

const DISCLAIMER_FALLBACK = 'Educational analysis of public market data. Not investment advice or a recommendation to buy, sell or hold any security. Not registered with SEBI or any other regulator. Data may be delayed, incomplete or wrong.'

export function OutlookCard({ a }) {
  const o = outlookOf(a)
  const reviewed = a.requires_human_review && a.human_decision && a.status === 'completed'
  return (
    <div className={`panel dark chamfer outlook-card ${o.css}`}>
      <span className="mono-s muted">/ Analysis outlook</span>
      <div className="label">{o.label}</div>
      <p className="small">{a.status === 'pending_review'
        ? 'The anomaly screen flagged this case, so the pipeline is paused until an analyst approves or rejects it. The outlook is written after that decision.'
        : a.outlook_rationale || 'No rationale recorded.'}</p>
      <div className="row">
        {a.requires_human_review && <Badge tone="ink">{a.status === 'pending_review' ? 'Paused for review' : `Reviewed: ${a.human_decision}`}</Badge>}
        {!a.requires_human_review && <Badge>Auto-cleared</Badge>}
        {reviewed && a.reviewed_at && <span className="mono-s muted">{timeAgo(a.reviewed_at)}</span>}
      </div>
      <p className="mono-s muted" style={{ lineHeight: '16px' }}>Describes conditions only. Not a buy, sell or hold call.</p>
    </div>
  )
}

export function RiskPanel({ a }) {
  const parts = riskBreakdown(a)
  return (
    <div className="panel">
      <div className="panel-head"><span className="mono">Risk score</span><Badge tone={a.risk_score >= 60 ? 'neg' : a.risk_score >= 30 ? 'mid' : 'pos'}>{riskWord(a.risk_score)}</Badge></div>
      <div style={{ display: 'grid', placeItems: 'center' }}><RiskGauge value={a.risk_score} /></div>
      {parts && (
        <div className="mt16">
          {parts.map((p) => (
            <div className="bar-row" key={p.key} title={p.note}>
              <span className="small">{p.label}<span className="muted"> · {p.note}</span></span>
              <div className="track"><div className={`fill${p.pts >= p.max * 0.66 ? ' bad' : p.pts >= p.max * 0.33 ? ' warn' : ''}`} style={{ width: `${(p.pts / p.max) * 100}%` }} /></div>
              <span className="v">{fmtNum(p.pts, 1)}<span className="muted">/{p.max}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AnalysisView({ a, actions, reviewSlot, compact }) {
  const snap = a.market_snapshot || {}
  const m = metrics(a)
  const counts = sentimentCounts(a)
  const log = parseLog(a.agent_log)
  const o = outlookOf(a)
  const changeTone = m.change == null ? '' : m.change >= 0 ? 'pos' : 'neg'

  return (
    <div className="fade-up">
      {/* ---------- header ---------- */}
      <div className="an-head">
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <Eyebrow short>{`Analysis · ${fmtDate(a.created_at)}`}</Eyebrow>
          <div className="row" style={{ gap: 18, marginTop: 18 }}>
            <h1 className="sym">{a.symbol}</h1>
            <OutlookBadge a={a} size="lg" />
          </div>
          <div className="company">{snap.company_name || 'Company name unavailable'}{snap.exchange ? <span className="muted"> · {snap.exchange}</span> : null}</div>
          <div className="price-line mt8">
            <b>{fmtMoney(m.price, m.currency)}</b>
            {m.change != null && <Badge tone={changeTone} dot={false}>{fmtPct(m.change)} today</Badge>}
            {snap.fetched_at && <span className="mono-s muted">Data as of {fmtDate(snap.fetched_at)}</span>}
          </div>
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>

      {reviewSlot}

      {/* ---------- chart + outlook ---------- */}
      <div className="grid g-main mt40">
        <div className="panel white">
          <div className="panel-head">
            <span className="mono">Price · last {snap.recent_closes?.length || 0} sessions</span>
            <span className="legend"><span><i />Close</span><span><i style={{ background: '#e5e5e5', height: 10 }} />Volume</span></span>
          </div>
          {snap.recent_closes?.length
            ? <PriceChart dates={snap.recent_dates} closes={snap.recent_closes} volumes={snap.recent_volumes} currency={m.currency} />
            : <p className="muted small">This analysis was saved before price history was stored, so there is no chart. Run it again to get one.</p>}
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <OutlookCard a={a} />
          {!compact && <RiskPanel a={a} />}
        </div>
      </div>

      {/* ---------- key numbers ---------- */}
      <div className="grid g4 keep2 mt8">
        <Kpi label="Daily volatility" value={m.volatility != null ? `${fmtNum(m.volatility, 2)}%` : '—'} sub="Std of daily % returns, 20 sessions" />
        <Kpi label="5-day range" value={m.range5 != null ? `${fmtNum(m.range5, 2)}%` : '—'} sub={`Momentum: ${m.momentum || '—'}`} />
        <Kpi label="Volume vs 20-day avg" value={m.volumeRatio != null ? `${fmtNum(m.volumeRatio, 2)}×` : '—'} sub={m.volumeRatio >= 2.5 ? 'Unusual activity' : 'Within normal range'} />
        <Kpi label="News sentiment" value={m.sentimentReliable ? fmtSigned(m.sentiment, 2) : 'n/a'} sub={m.sentimentReliable ? `${m.newsCount} articles, FinBERT` : `Only ${m.newsCount} relevant article${m.newsCount === 1 ? '' : 's'}`} />
      </div>

      {compact && <div className="mt8"><RiskPanel a={a} /></div>}

      {/* ---------- why ---------- */}
      <div className="grid g2 mt8">
        <div className="panel">
          <div className="panel-head"><span className="mono">Risk factors</span></div>
          {(a.risk_factors || []).length ? a.risk_factors.map((f) => (
            <div className="factor" key={f}><i className={/^No significant/.test(f) ? 'ok' : ''} /><span>{f}</span></div>
          )) : <p className="muted small">No factors recorded.</p>}
          <hr className="divider" />
          <div className="panel-head" style={{ marginBottom: 12 }}><span className="mono">Alerts</span></div>
          {(a.alerts_sent || []).length ? a.alerts_sent.map((al, i) => (
            <div className="factor" key={i}><i style={{ background: al.severity === 'critical' ? 'var(--bad)' : 'var(--warn)' }} />
              <span><b className="mono-s">{al.severity}</b> · {al.reason}{al.delivery ? <span className="muted small"> (email: {al.delivery})</span> : null}</span></div>
          )) : <p className="muted small">No alert was warranted for this run.</p>}
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="mono">Anomaly screen</span>
            {a.fraud_confidence != null && <Badge tone={a.fraud_flag ? 'neg' : a.requires_human_review ? 'mid' : 'pos'}>{a.fraud_flag ? 'Flagged' : a.requires_human_review ? 'Uncertain' : 'Clear'}</Badge>}
          </div>
          <div className="row" style={{ gap: 28, alignItems: 'flex-end' }}>
            <div><span className="mono-s muted">XGBoost probability</span><div className="h3 num">{a.fraud_confidence != null ? fmtPct(a.fraud_confidence * 100, 1, false) : '—'}</div></div>
            <p className="small ink2" style={{ maxWidth: 300 }}>Bars show which inputs pushed the model towards or away from a flag (SHAP, log-odds).</p>
          </div>
          <div className="mt24"><ShapBars shap={a.shap_explanation} /></div>
          <p className="mono-s muted mt16" style={{ lineHeight: '16px' }}>Trained on synthetic data — a demonstration of the technique.</p>
        </div>
      </div>

      <div className="grid g2 mt8">
        <div className="panel">
          <div className="panel-head"><span className="mono">News · FinBERT</span><span className="mono-s muted">{m.newsCount} scored</span></div>
          <SentimentSplit counts={counts} />
          <div className="news mt16">
            {(a.news_articles || []).slice(0, 8).map((n, i) => {
              const tone = n.sentiment_label === 'positive' ? 'pos' : n.sentiment_label === 'negative' ? 'neg' : ''
              const body = <>
                <Badge tone={tone}>{n.sentiment_label || 'n/a'}</Badge>
                <div><div className="t">{n.title}</div><div className="meta mono-s">{n.source || 'Unknown source'}{n.time_published ? ` · ${fmtDate(n.time_published, false)}` : ''}{n.sentiment_confidence != null ? ` · ${Math.round(n.sentiment_confidence * 100)}% conf.` : ''}</div></div>
              </>
              return n.url ? <a key={i} href={n.url} target="_blank" rel="noreferrer noopener">{body}</a> : <div key={i} className="item">{body}</div>
            })}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><span className="mono">Agent trace</span><span className="mono-s muted">{log.length} steps</span></div>
          {log.length ? (
            <ol className="trace">{log.map((l, i) => <li key={i}><b>{l.agent}</b>{l.text}</li>)}</ol>
          ) : <p className="muted small">The step-by-step trace is stored for analyses run after the Supabase upgrade.</p>}
        </div>
      </div>

      <div className="mt40">
        <details className="fold">
          <summary>Full text report<span className="pm" /></summary>
          <div><pre className="report">{a.final_report || (a.status === 'pending_review' ? 'The report is written after the review decision.' : 'No report stored.')}</pre></div>
        </details>
        <details className="fold">
          <summary>Run details<span className="pm" /></summary>
          <div className="grid g3">
            <div><span className="mono-s muted">Thread</span><div className="small" style={{ wordBreak: 'break-all' }}>{a.thread_id}</div></div>
            <div><span className="mono-s muted">Outlook</span><div className="small">{o.label}</div></div>
            <div><span className="mono-s muted">Human decision</span><div className="small">{a.human_decision || '—'}</div></div>
          </div>
        </details>
      </div>
      <p className="disclaimer mt24">{a.disclaimer || DISCLAIMER_FALLBACK}</p>
    </div>
  )
}

export function CompareLink({ a, prevId }) {
  if (!prevId) return null
  return <Btn variant="light" size="sm" to={`/app/compare?a=${encodeURIComponent(prevId)}&b=${encodeURIComponent(a.thread_id)}`}>Compare with earlier run</Btn>
}
