// Helpers that read an AnalysisResponse (see app/schemas.py) for the UI.
import { fmtNum, fmtPct, fmtSigned, OUTLOOK } from './format.js'

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const MIN_NEWS = 3 // same threshold as app/agents/outlook.py

export function indicators(a) {
  return a?.market_snapshot?.technical_indicators || null
}

/** Flat set of numbers used by the result view and by Compare. */
export function metrics(a) {
  const snap = a?.market_snapshot || {}
  const ind = snap.technical_indicators || {}
  const news = a?.news_articles || []
  return {
    risk: n(a?.risk_score),
    price: n(snap.current_price),
    change: n(ind.price_change_pct),
    volatility: n(ind.volatility),
    range5: n(ind.five_day_range_pct),
    volumeRatio: n(ind.volume_ratio),
    sentiment: n(a?.sentiment_score),
    newsCount: news.length,
    sentimentReliable: news.length >= MIN_NEWS,
    fraud: n(a?.fraud_confidence),
    momentum: ind.momentum || null,
    currency: snap.currency || null,
  }
}

/**
 * Re-derives the risk score's components with the same rules as
 * app/agents/risk_assessment.py, so the UI can show WHY a score is what it is.
 * Returns null for old records that have no stored indicators.
 */
export function riskBreakdown(a) {
  const ind = indicators(a)
  if (!ind) return null
  const m = metrics(a)
  const vol = m.volatility || 0
  const s = m.sentimentReliable ? m.sentiment || 0 : 0
  const chg = m.change || 0
  const vr = m.volumeRatio || 0
  return [
    { key: 'volatility', label: 'Volatility', pts: Math.min(vol * 10, 40), max: 40, note: `${fmtNum(vol, 2)}% daily` },
    { key: 'sentiment', label: 'Negative news', pts: s < 0 ? Math.min(Math.abs(s) * 30, 30) : 0, max: 30, note: m.sentimentReliable ? fmtSigned(s, 2) : 'too few articles' },
    { key: 'move', label: 'Single-day move', pts: Math.min(Math.abs(chg) * 5, 20), max: 20, note: fmtPct(chg) },
    { key: 'volume', label: 'Volume spike', pts: Math.min(Math.max(vr - 1.5, 0) * 5, 10), max: 10, note: vr ? `${fmtNum(vr, 1)}× avg` : '—' },
  ]
}

export const SHAP_LABELS = {
  price_change_pct: 'Day move',
  volatility: 'Volatility',
  five_day_range_pct: '5-day range',
  sentiment_score: 'News sentiment',
  momentum_numeric: 'Momentum',
}

export function sentimentCounts(a) {
  const c = { positive: 0, neutral: 0, negative: 0 }
  for (const x of a?.news_articles || []) if (c[x.sentiment_label] !== undefined) c[x.sentiment_label] += 1
  return c
}

/** Which agents' log lines belong to which pipeline step (for the trace). */
export function parseLog(lines = []) {
  return lines.map((line) => {
    const m = /^\[([A-Za-z]+)\]\s*(.*)$/.exec(line)
    return m ? { agent: m[1].replace(/([a-z])([A-Z])/g, '$1 $2'), text: m[2] } : { agent: 'Pipeline', text: line }
  })
}

// ---------------------------------------------------------------- compare

export const COMPARE_ROWS = [
  { key: 'risk', label: 'Risk score', fmt: (v) => fmtNum(v, 1), worseWhen: 'up', unit: '/100' },
  { key: 'price', label: 'Price', fmt: null, worseWhen: null },
  { key: 'change', label: 'Day change', fmt: (v) => fmtPct(v), worseWhen: null },
  { key: 'volatility', label: 'Daily volatility', fmt: (v) => `${fmtNum(v, 2)}%`, worseWhen: 'up' },
  { key: 'range5', label: '5-day range', fmt: (v) => `${fmtNum(v, 2)}%`, worseWhen: 'up' },
  { key: 'volumeRatio', label: 'Volume vs 20-day avg', fmt: (v) => `${fmtNum(v, 2)}×`, worseWhen: 'up' },
  { key: 'sentiment', label: 'News sentiment', fmt: (v) => fmtSigned(v, 2), worseWhen: 'down' },
  { key: 'newsCount', label: 'Articles scored', fmt: (v) => String(v ?? '—'), worseWhen: null },
  { key: 'fraud', label: 'Anomaly probability', fmt: (v) => fmtPct(v * 100, 1, false), worseWhen: 'up' },
]

/** Direction of a change between run A (earlier) and B (later). */
export function deltaClass(row, a, b) {
  if (a == null || b == null) return 'flat'
  const d = b - a
  if (Math.abs(d) < 1e-9) return 'flat'
  if (!row.worseWhen) return 'neutral'
  const worse = row.worseWhen === 'up' ? d > 0 : d < 0
  return worse ? 'worse' : 'better'
}

/** Plain-language list of what moved between two runs, biggest first. */
export function whatChanged(A, B) {
  const a = metrics(A), b = metrics(B)
  const out = []
  const same = A.symbol === B.symbol
  const nameA = same ? 'the earlier run' : A.symbol
  const nameB = same ? 'this run' : B.symbol

  if (a.risk != null && b.risk != null) {
    const d = b.risk - a.risk
    if (Math.abs(d) >= 0.5) {
      const ba = riskBreakdown(A), bb = riskBreakdown(B)
      let driver = ''
      if (ba && bb) {
        const diffs = bb.map((x, i) => ({ label: x.label.toLowerCase(), d: x.pts - ba[i].pts }))
          .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
        if (Math.abs(diffs[0].d) >= 0.5) driver = `, mostly from ${diffs[0].label} (${fmtSigned(diffs[0].d, 1)} pts)`
      }
      out.push({ w: Math.abs(d) * 2, text: `Risk score ${d > 0 ? 'rose' : 'fell'} ${fmtNum(Math.abs(d), 1)} points, ${fmtNum(a.risk, 1)} → ${fmtNum(b.risk, 1)}${driver}.` })
    } else {
      out.push({ w: 0.1, text: `Risk score is essentially unchanged at ${fmtNum(b.risk, 1)}.` })
    }
  }

  const oa = OUTLOOK[A.outlook]?.label, ob = OUTLOOK[B.outlook]?.label
  if (oa && ob && oa !== ob) out.push({ w: 40, text: `Outlook moved from ${oa.toLowerCase()} to ${ob.toLowerCase()}.` })

  if (same && a.price != null && b.price != null && a.price) {
    const pct = ((b.price - a.price) / a.price) * 100
    if (Math.abs(pct) >= 0.1) out.push({ w: Math.abs(pct) * 3, text: `Price ${pct > 0 ? 'is up' : 'is down'} ${fmtPct(Math.abs(pct), 2, false)} between the two runs.` })
  }
  if (a.volatility != null && b.volatility != null && Math.abs(b.volatility - a.volatility) >= 0.15) {
    out.push({ w: Math.abs(b.volatility - a.volatility) * 10, text: `Daily volatility ${b.volatility > a.volatility ? 'increased' : 'eased'} from ${fmtNum(a.volatility, 2)}% to ${fmtNum(b.volatility, 2)}%.` })
  }
  if (a.sentimentReliable && b.sentimentReliable && a.sentiment != null && b.sentiment != null && Math.abs(b.sentiment - a.sentiment) >= 0.1) {
    out.push({ w: Math.abs(b.sentiment - a.sentiment) * 30, text: `News sentiment shifted ${b.sentiment > a.sentiment ? 'more positive' : 'more negative'}, ${fmtSigned(a.sentiment, 2)} → ${fmtSigned(b.sentiment, 2)}.` })
  } else if (a.sentimentReliable !== b.sentimentReliable) {
    out.push({ w: 5, text: `Sentiment was usable in ${a.sentimentReliable ? nameA : nameB} only (${MIN_NEWS}+ relevant articles needed).` })
  }
  if (a.volumeRatio != null && b.volumeRatio != null && Math.abs(b.volumeRatio - a.volumeRatio) >= 0.5) {
    out.push({ w: Math.abs(b.volumeRatio - a.volumeRatio) * 6, text: `Trading volume relative to its 20-day average went from ${fmtNum(a.volumeRatio, 1)}× to ${fmtNum(b.volumeRatio, 1)}×.` })
  }
  if (a.fraud != null && b.fraud != null && Math.abs(b.fraud - a.fraud) >= 0.05) {
    out.push({ w: Math.abs(b.fraud - a.fraud) * 40, text: `Anomaly probability ${b.fraud > a.fraud ? 'rose' : 'fell'} from ${fmtPct(a.fraud * 100, 1, false)} to ${fmtPct(b.fraud * 100, 1, false)}.` })
  }
  if (!!A.requires_human_review !== !!B.requires_human_review) {
    out.push({ w: 30, text: `${B.requires_human_review ? nameB : nameA} needed human review; ${B.requires_human_review ? nameA : nameB} did not.` })
  }
  return out.sort((x, y) => y.w - x.w).map((x) => x.text)
}
