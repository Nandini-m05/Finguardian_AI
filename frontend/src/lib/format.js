export const OUTLOOK = {
  positive_signals: { label: 'Positive signals', short: 'Positive', tone: 'pos', css: 'positive' },
  mixed_signals: { label: 'Mixed signals', short: 'Mixed', tone: 'mid', css: 'mixed' },
  negative_signals: { label: 'Negative signals', short: 'Negative', tone: 'neg', css: 'negative' },
}

export const outlookOf = (a) => {
  if (a?.status === 'pending_review') return { label: 'Awaiting review', short: 'Pending', tone: 'ink', css: 'pending' }
  return OUTLOOK[a?.outlook] || { label: 'No outlook', short: 'n/a', tone: '', css: 'none' }
}

export const riskTone = (r) => (r == null ? '' : r >= 60 ? 'neg' : r >= 30 ? 'mid' : 'pos')
export const riskWord = (r) => (r == null ? 'n/a' : r >= 60 ? 'High' : r >= 30 ? 'Moderate' : 'Low')

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export function fmtNum(v, d = 1) {
  return isNum(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
}
export function fmtPct(v, d = 2, sign = true) {
  if (!isNum(v)) return '—'
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(d)}%`
}
export function fmtSigned(v, d = 2) {
  if (!isNum(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(d)}`
}
export function fmtMoney(v, currency) {
  if (!isNum(v)) return '—'
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency: currency || 'USD', maximumFractionDigits: v >= 1000 ? 0 : 2,
    }).format(v)
  } catch {
    return v.toFixed(2)
  }
}
export function fmtCompact(v) {
  if (!isNum(v)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}
export function fmtDate(iso, withTime = true) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}
export function fmtShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
export function timeAgo(iso) {
  const t = new Date(iso).getTime()
  if (!t) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24); if (d < 30) return `${d} d ago`
  return fmtDate(iso, false)
}
