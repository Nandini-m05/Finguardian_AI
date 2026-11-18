import { useEffect, useState } from 'react'

export const AGENTS = [
  { key: 'data', name: 'Data Collector', line: '3 months of prices, volume and headlines', s: 'Yahoo Finance via yfinance' },
  { key: 'market', name: 'Market Analysis', line: 'Volatility, momentum, 5-day range, volume spike', s: 'Daily % returns' },
  { key: 'news', name: 'News Intelligence', line: 'Scores every headline with FinBERT', s: 'Finance-tuned BERT' },
  { key: 'risk', name: 'Risk Assessment', line: 'Transparent 0–100 score with named factors', s: 'Rule-based, explainable' },
  { key: 'fraud', name: 'Fraud Detection', line: 'XGBoost + Isolation Forest, explained with SHAP', s: 'Anomaly screen' },
  { key: 'review', name: 'Human Review', line: 'Pauses for an analyst when a case is flagged', s: 'LangGraph interrupt()' },
  { key: 'outlook', name: 'Outlook & Report', line: 'Positive, mixed or negative signals, in plain words', s: 'Describes, never advises' },
  { key: 'alert', name: 'Alert & Notify', line: 'Records the alert and emails it if warranted', s: 'Audit trail in Supabase' },
]

// Rough share of total time each agent takes (Yahoo + FinBERT dominate).
const WEIGHTS = [0.3, 0.06, 0.28, 0.04, 0.12, 0.04, 0.08, 0.08]

/**
 * The API answers once, at the end, so progress while waiting is an
 * estimate based on typical timings; it never claims a step finished
 * before the response says so for the final state.
 */
export function PipelineProgress({ running, result, expectedMs = 14000 }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) return
    const t0 = performance.now()
    setElapsed(0)
    const id = setInterval(() => setElapsed(performance.now() - t0), 250)
    return () => clearInterval(id)
  }, [running])

  let stateOf
  if (result) {
    const paused = result.status === 'pending_review'
    stateOf = (i) => (paused ? (i < 5 ? 'done' : i === 5 ? 'paused' : '') : 'done')
  } else {
    // ease towards ~90% so the bar never "finishes" before the server does
    const frac = 0.92 * (1 - Math.exp(-elapsed / (expectedMs * 0.55)))
    let acc = 0, current = 0
    for (let i = 0; i < WEIGHTS.length; i++) { acc += WEIGHTS[i]; if (frac < acc) { current = i; break } current = i }
    stateOf = (i) => (i < current ? 'done' : i === current ? 'run' : '')
  }

  return (
    <div>
      <div className="pipe">
        {AGENTS.map((a, i) => (
          <div key={a.key} className={`st ${stateOf(i)}`}>
            <span className="n">/0{i + 1}</span>
            <div><b>{a.name}</b><div className="s">{a.line}</div></div>
          </div>
        ))}
      </div>
      {running && !result && (
        <p className="small muted mt16">
          Running for {(elapsed / 1000).toFixed(0)} s. Steps light up on an estimated schedule; the result appears when every agent has finished
          (usually 10–30 s, longer on a cold server).
        </p>
      )}
    </div>
  )
}
