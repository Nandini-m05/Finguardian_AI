// FinGuardian mock API — the same endpoints and JSON shapes as the FastAPI
// backend (app/main.py, app/schemas.py), with generated market data.
// For UI development and demos without Python, Supabase or Yahoo.
//
//   npm run mock            -> http://localhost:8000
//   PORT=8787 npm run mock  -> another port
//
// Seeded accounts (password in brackets):
//   user@demo.dev (user12345)        normal user with some history
//   admin@demo.dev (admin1234)       admin
//   analyst@demo.dev (analyst1234)   second admin (to review admin@'s cases)
// Tickers GME, AMC and BBBY always get flagged for human review.
// NOTHING here is real market data.
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.PORT || 8000)
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 2500)
const DISCLAIMER = 'FinGuardian AI is an educational, automated analysis of public market data. It is not investment advice, a research report, or a recommendation to buy, sell or hold any security, and it is not registered with SEBI or any other financial regulator. Data may be delayed, incomplete or wrong. Do not base financial decisions on it.'

// ------------------------------------------------------------------ data
const COMPANIES = {
  AAPL: ['Apple Inc.', 'NMS', 'USD', 230], MSFT: ['Microsoft Corporation', 'NMS', 'USD', 470], NVDA: ['NVIDIA Corporation', 'NMS', 'USD', 180],
  TSLA: ['Tesla, Inc.', 'NMS', 'USD', 330], 'RELIANCE.NS': ['Reliance Industries Limited', 'NSI', 'INR', 1420], 'TCS.NS': ['Tata Consultancy Services', 'NSI', 'INR', 3150],
  'INFY.NS': ['Infosys Limited', 'NSI', 'INR', 1520], 'HDFCBANK.NS': ['HDFC Bank Limited', 'NSI', 'INR', 990], GME: ['GameStop Corp.', 'NYQ', 'USD', 24], AMC: ['AMC Entertainment', 'NYQ', 'USD', 3.2],
}
const FLAG = new Set(['GME', 'AMC', 'BBBY'])

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) }
const hash = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d
const std = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) }

function businessDays(endDate, n) {
  const out = []; const d = new Date(endDate)
  while (out.length < n) { if (d.getUTCDay() % 6 !== 0) out.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1) }
  return out
}

function marketData(symbol, when, salt) {
  const known = COMPANIES[symbol]
  if (!known && !/^[A-Z]{1,5}(\.(NS|BO))?$/.test(symbol)) return null // "unknown ticker" path
  const [name, exch, ccy, base] = known || [`${symbol} Holdings (mock)`, symbol.endsWith('.NS') ? 'NSI' : 'NMS', symbol.endsWith('.NS') ? 'INR' : 'USD', 50 + (hash(symbol) % 400)]
  const r = rng(hash(symbol) + salt)
  const volBase = FLAG.has(symbol) ? 0.06 : 0.012 + r() * 0.012
  const dates = businessDays(when, 60)
  let p = base * (0.9 + r() * 0.2)
  const closes = [], volumes = []
  const v0 = (known ? 4e6 : 1e6) * (1 + r())
  dates.forEach((_, i) => {
    const shock = FLAG.has(symbol) && i > 52 ? (r() - 0.3) * 0.25 : 0
    p = Math.max(0.5, p * (1 + (r() - 0.48) * volBase * 2 + shock))
    closes.push(round(p, 2))
    volumes.push(Math.round(v0 * (0.6 + r() * 0.8) * (FLAG.has(symbol) && i > 52 ? 5 : 1)))
  })
  return { company_name: name, currency: ccy, exchange: exch, current_price: closes.at(-1), previous_close: closes.at(-2), day_high: round(closes.at(-1) * 1.01), day_low: round(closes.at(-1) * 0.99), volume: volumes.at(-1), market_cap: Math.round(closes.at(-1) * 1e9 * (1 + r() * 20)), fifty_two_week_high: round(Math.max(...closes) * 1.1), fifty_two_week_low: round(Math.min(...closes) * 0.9), recent_dates: dates, recent_closes: closes, recent_volumes: volumes, fetched_at: new Date(when).toISOString() }
}

// same rules as app/agents/market_analysis.py
function indicators(md) {
  const c = md.recent_closes, v = md.recent_volumes
  const last5 = c.slice(-5), win = c.slice(-21)
  const rets = win.slice(1).map((x, i) => ((x - win[i]) / win[i]) * 100)
  const hi = round(Math.max(...last5)), lo = round(Math.min(...last5))
  const base = v.slice(-21, -1), avg = base.reduce((a, b) => a + b, 0) / base.length
  return {
    price_change_pct: round(((md.current_price - md.previous_close) / md.previous_close) * 100),
    five_day_high: hi, five_day_low: lo, five_day_range_pct: round(((hi - lo) / lo) * 100), volatility: round(std(rets)), volatility_window: rets.length,
    momentum: last5.at(-1) > last5[0] ? 'up' : last5.at(-1) < last5[0] ? 'down' : 'flat', volume_ratio: round(v.at(-1) / avg),
  }
}

const SOURCES = ['Reuters', 'Bloomberg', 'Mint', 'Economic Times', 'CNBC', 'Business Standard', 'MarketWatch']
const HEADLINES = [
  ['%s beats quarterly revenue estimates on strong demand', 'positive'], ['%s shares slip as analysts flag margin pressure', 'negative'],
  ['%s announces expansion of its manufacturing capacity', 'positive'], ['%s to hold annual investor meeting next month', 'neutral'],
  ['Regulator seeks clarification from %s on disclosure', 'negative'], ['%s signs multi-year supply agreement', 'positive'],
  ['%s management reiterates full-year guidance', 'neutral'], ['Short sellers increase positions in %s', 'negative'],
]
function news(symbol, md, salt) {
  const r = rng(hash(symbol) * 3 + salt)
  const n = FLAG.has(symbol) ? 2 : Math.floor(r() * 7) + (r() > 0.2 ? 3 : 0)
  const word = md.company_name.split(' ')[0]
  return Array.from({ length: n }, (_, i) => {
    const [t, label] = HEADLINES[Math.floor(r() * HEADLINES.length)]
    const d = new Date(md.fetched_at); d.setUTCHours(d.getUTCHours() - i * 7)
    return { title: `${t.replace('%s', word)} (mock)`, url: null, source: SOURCES[Math.floor(r() * SOURCES.length)], time_published: d.toISOString(), sentiment_label: label, sentiment_confidence: round(0.55 + r() * 0.43, 3) }
  })
}

function sentiment(arts) {
  if (!arts.length) return 0
  return round(arts.reduce((s, a) => s + (a.sentiment_label === 'positive' ? a.sentiment_confidence : a.sentiment_label === 'negative' ? -a.sentiment_confidence : 0), 0) / arts.length, 3)
}

function risk(ind, sent, reliable) {
  const f = []; let score = 0
  const vp = Math.min((ind.volatility || 0) * 10, 40); score += vp; if (vp > 15) f.push(`Elevated price volatility (${ind.volatility})`)
  const s = reliable ? sent : 0
  if (s < 0) { const sp = Math.min(Math.abs(s) * 30, 30); score += sp; if (sp > 10) f.push(`Negative news sentiment (${s >= 0 ? '+' : ''}${s.toFixed(2)})`) }
  const mp = Math.min(Math.abs(ind.price_change_pct || 0) * 5, 20); score += mp; if (mp > 10) f.push(`Large single-day price move (${ind.price_change_pct >= 0 ? '+' : ''}${ind.price_change_pct.toFixed(2)}%)`)
  const vr = ind.volume_ratio || 0, vpts = Math.min(Math.max(vr - 1.5, 0) * 5, 10); score += vpts; if (vpts >= 5) f.push(`Unusual trading volume (${vr.toFixed(1)}x 20-day average)`)
  if (!f.length) f.push('No significant risk signals detected')
  return [round(Math.min(score, 100), 1), f]
}

const OUT = { positive_signals: 'positive signals', mixed_signals: 'mixed signals', negative_signals: 'negative signals' }
function outlook(st) {
  const n = st.news.length, usable = n >= 3, s = usable ? st.sentiment : 0
  if (st.human_decision === 'rejected') return ['negative_signals', `${st.symbol}: a human reviewer flagged this case as suspicious - overriding all other signals.`]
  let o
  if (st.risk >= 60) o = 'negative_signals'
  else if (st.risk >= 30) o = 'mixed_signals'
  else if (st.ind.momentum === 'up' && s > 0.15) o = 'positive_signals'
  else if (st.ind.momentum === 'down' && s < -0.15) o = 'negative_signals'
  else o = 'mixed_signals'
  const st2 = usable ? `sentiment ${s >= 0 ? '+' : ''}${s.toFixed(2)} across ${n} articles` : n === 0 ? 'sentiment unavailable (no news data)' : `sentiment unavailable (only ${n} relevant article${n === 1 ? '' : 's'})`
  let rat = `${st.symbol}: risk score ${st.risk}/100, ${st.ind.momentum} momentum, ${st2} -> ${OUT[o]}.`
  if (st.human_decision === 'approved' && st.requires_human_review) rat += ' (Manually reviewed and cleared despite elevated risk signals.)'
  return [o, rat]
}

function finish(rec) {
  const [o, rat] = outlook(rec._st)
  rec.outlook = o; rec.outlook_rationale = rat; rec.status = 'completed'
  const st = rec._st
  const alerts = []
  if (rec.fraud_flag || rec.human_decision === 'rejected') alerts.push({ symbol: rec.symbol, severity: 'critical', reason: 'Fraud signal confirmed or case rejected in human review', risk_score: rec.risk_score, outlook: o, triggered_at: new Date().toISOString(), delivery: 'skipped' })
  else if (o === 'negative_signals' || rec.risk_score >= 60) alerts.push({ symbol: rec.symbol, severity: 'warning', reason: `Outlook shows negative signals or risk score is elevated (${rec.risk_score})`, risk_score: rec.risk_score, outlook: o, triggered_at: new Date().toISOString(), delivery: 'skipped' })
  rec.alerts_sent = alerts
  rec.agent_log.push(`[HumanReview] ${rec.requires_human_review ? `${rec.symbol} - human decision: ${rec.human_decision}` : `No review required for ${rec.symbol} - auto-approved`}`)
  rec.agent_log.push(`[Outlook] ${rat}`, `[Report] Generated final report for ${rec.symbol}`, alerts.length ? `[AlertNotification] ${alerts[0].severity.toUpperCase()} alert for ${rec.symbol}: ${alerts[0].reason} (delivery: skipped)` : `[AlertNotification] No alert warranted for ${rec.symbol}`)
  rec.final_report = [
    `FinGuardian AI Analysis Report - ${rec.symbol}`, `Generated: ${rec.created_at}`, '', 'Market Snapshot', st.summary, '', 'News Sentiment', st.sentSummary, '',
    'Risk Assessment', `Risk score: ${rec.risk_score}/100`, `Key factors: ${rec.risk_factors.join(', ')}`, '', 'Fraud Detection', `Flagged: ${rec.fraud_flag ? 'True' : 'False'} (confidence ${rec.fraud_confidence})`, '',
    'Human Review', `Status: ${rec.human_decision}`, '', 'Outlook (analysis only - not advice)', `${OUT[o].toUpperCase()} - ${rat}`, '', 'Disclaimer', DISCLAIMER,
  ].join('\n')
}

let SEQ = 0
function runAnalysis(symbol, user, when = Date.now()) {
  const salt = (SEQ += 1) * 97
  const md = marketData(symbol, when, salt)
  if (!md) return null
  const ind = indicators(md)
  const arts = news(symbol, md, salt)
  const sent = sentiment(arts), reliable = arts.length >= 3
  const [riskScore, factors] = risk(ind, sent, reliable)
  const r = rng(hash(symbol) + salt * 5)
  let prob = FLAG.has(symbol) ? 0.7 + r() * 0.25 : Math.min(0.99, Math.max(0.001, (riskScore / 100) ** 3 + r() * 0.04))
  prob = round(prob, 3)
  const iso = FLAG.has(symbol) || riskScore > 55
  const needsReview = prob > 0.65 || (prob >= 0.35 && prob <= 0.65) || iso !== (prob > 0.5)
  const shap = { price_change_pct: round((Math.abs(ind.price_change_pct) - 1.2) * 0.4, 3), volatility: round((ind.volatility - 2) * 0.9, 3), five_day_range_pct: round((ind.five_day_range_pct - 4) * 0.35, 3), sentiment_score: round((reliable ? -sent : 0) * 0.8, 3), momentum_numeric: round((r() - 0.5) * 0.4, 3) }
  const summary = `${symbol} is ${ind.price_change_pct >= 0 ? 'up' : 'down'} ${Math.abs(ind.price_change_pct)}% from the previous close, with ${ind.momentum} momentum over the last 5 trading days (range: ${ind.five_day_low}-${ind.five_day_high}); daily volatility ${ind.volatility}% over ${ind.volatility_window} sessions; latest volume ${ind.volume_ratio}x its 20-day average.`
  const c = { positive: 0, negative: 0, neutral: 0 }; arts.forEach((a) => (c[a.sentiment_label] += 1))
  const tone = sent > 0.15 ? 'positive' : sent < -0.15 ? 'negative' : 'mixed/neutral'
  let sentSummary = arts.length ? `Overall news sentiment is ${tone} (${sent >= 0 ? '+' : ''}${sent.toFixed(2)}) across ${arts.length} articles - ${c.positive} positive, ${c.negative} negative, ${c.neutral} neutral.` : 'No news articles available to assess sentiment.'
  if (arts.length && !reliable) sentSummary += ' Too few articles (< 3) to treat this as a signal.'
  const id = `analysis-${crypto.randomUUID().replaceAll('-', '')}`
  const rec = {
    request_id: `req-${crypto.randomUUID().replaceAll('-', '')}`, thread_id: id, status: 'pending_review', symbol, asset_type: 'stock',
    risk_score: riskScore, risk_factors: factors, fraud_flag: prob > 0.65, fraud_confidence: prob, shap_explanation: shap, requires_human_review: needsReview,
    human_decision: needsReview ? null : 'approved', outlook: null, outlook_rationale: null, final_report: null, alerts_sent: [],
    sentiment_score: sent, market_snapshot: { ...md, technical_indicators: ind, market_summary: summary, sentiment_summary: sentSummary }, news_articles: arts,
    agent_log: [`[DataCollector] Fetched ${md.recent_closes.length} daily bars for ${symbol} at ${md.fetched_at}`, `[DataCollector] Fetched ${arts.length} relevant news articles for ${symbol}`, '[DataCollector] Recorded completion event in pipeline_events', `[MarketAnalysis] Computed indicators for ${symbol}: ${summary}`, `[NewsIntelligence] Scored ${arts.length} articles for ${symbol}: ${sentSummary}`, `[RiskAssessment] ${symbol} risk score: ${riskScore}/100 - ${factors.join(', ')}`, `[FraudDetection] ${symbol}: fraud_flag=${prob > 0.65}, confidence=${prob}, isolation_forest=${iso}, human_review=${needsReview}`],
    reviewed_at: null, created_at: new Date(when).toISOString(), disclaimer: DISCLAIMER, requested_by: user.id, reviewed_by: null,
    _st: { symbol, ind, news: arts, sentiment: sent, risk: riskScore, requires_human_review: needsReview, human_decision: needsReview ? null : 'approved', summary, sentSummary },
  }
  if (!needsReview) finish(rec)
  return rec
}

// ------------------------------------------------------------------ state
const users = new Map() // email -> user
const tokens = new Map() // token -> user id
const analyses = [] // newest last
let UID = 0
function addUser(email, password, role = 'user') { const u = { id: (UID += 1), email, password, role, is_active: true }; users.set(email, u); return u }
const demoUser = addUser('user@demo.dev', 'user12345')
const admin = addUser('admin@demo.dev', 'admin1234', 'admin')
addUser('analyst@demo.dev', 'analyst1234', 'admin')
const DAY = 864e5
;[['AAPL', 9], ['TSLA', 7], ['RELIANCE.NS', 5], ['AAPL', 2], ['TCS.NS', 1.5], ['RELIANCE.NS', 0.4]].forEach(([s, d]) => analyses.push(runAnalysis(s, demoUser, Date.now() - d * DAY)))
const g = runAnalysis('GME', demoUser, Date.now() - 0.2 * DAY); analyses.push(g)
analyses.push(runAnalysis('AMC', admin, Date.now() - 0.1 * DAY))

const userOut = (u) => ({ id: u.id, email: u.email, is_active: u.is_active, role: u.role })
const pub = (a) => { const { _st, requested_by, reviewed_by, ...rest } = a; return rest } // eslint-disable-line no-unused-vars
const summary = (a) => ({ thread_id: a.thread_id, symbol: a.symbol, asset_type: a.asset_type, status: a.status, risk_score: a.risk_score, outlook: a.outlook, fraud_flag: a.fraud_flag, fraud_confidence: a.fraud_confidence, sentiment_score: a.sentiment_score, requires_human_review: a.requires_human_review, human_decision: a.human_decision, reviewed_at: a.reviewed_at, created_at: a.created_at })

// ------------------------------------------------------------------ http
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const readBody = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}) } catch { ok(null) } }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const authUser = (req) => { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); const id = tokens.get(t); return [...users.values()].find((u) => u.id === id) || null }
const SYMBOL = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204)
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname
  try {
    if (p === '/health' && req.method === 'GET') return send(res, 200, { status: 'ok', database: 'ok', environment: 'mock' })
    if (p === '/register' && req.method === 'POST') {
      const b = await readBody(req); const email = String(b?.email || '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 422, { detail: [{ msg: 'value is not a valid email address' }] })
      if (String(b.password || '').length < 8) return send(res, 422, { detail: [{ msg: 'Value error, Password must be at least 8 characters.' }] })
      if (users.has(email)) return send(res, 400, { detail: 'Email already registered' })
      return send(res, 201, userOut(addUser(email, b.password)))
    }
    if (p === '/login' && req.method === 'POST') {
      const b = await readBody(req); const u = users.get(String(b?.email || '').trim().toLowerCase())
      if (!u || u.password !== b.password) return send(res, 401, { detail: 'Incorrect email or password' })
      const t = crypto.randomBytes(24).toString('hex'); tokens.set(t, u.id)
      return send(res, 200, { access_token: t, token_type: 'bearer' })
    }
    const user = authUser(req)
    if (!user) return send(res, 401, { detail: 'Could not validate credentials' })
    if (p === '/me') return send(res, 200, userOut(user))
    if (p === '/analyze' && req.method === 'POST') {
      const b = await readBody(req); const sym = String(b?.symbol || '').trim().toUpperCase()
      if (!SYMBOL.test(sym)) return send(res, 422, { detail: [{ msg: "Value error, Symbol must be 1-20 characters: letters, digits, '.', '-', '=' or '^' (e.g. AAPL, RELIANCE.NS, BTC-USD)." }] })
      await sleep(DELAY)
      const rec = runAnalysis(sym, user)
      if (!rec) return send(res, 422, { detail: `No price data found for '${sym}'. Check the ticker (e.g. RELIANCE.NS for NSE).` })
      analyses.push(rec)
      return send(res, 200, pub(rec))
    }
    if (p === '/analyses' && req.method === 'GET') {
      const sym = url.searchParams.get('symbol')?.toUpperCase()
      const limit = Math.min(200, Number(url.searchParams.get('limit') || 50)), offset = Number(url.searchParams.get('offset') || 0)
      const mine = analyses.filter((a) => a.requested_by === user.id && (!sym || a.symbol === sym)).sort((a, b) => b.created_at.localeCompare(a.created_at))
      return send(res, 200, mine.slice(offset, offset + limit).map(summary))
    }
    let m = /^\/analyses\/([\w-]+)$/.exec(p)
    if (m && req.method === 'GET') {
      const a = analyses.find((x) => x.thread_id === m[1])
      if (!a || (a.requested_by !== user.id && user.role !== 'admin')) return send(res, 404, { detail: 'Analysis not found' })
      return send(res, 200, pub(a))
    }
    m = /^\/analyze\/([\w-]+)\/resume$/.exec(p)
    if (m && req.method === 'POST') {
      if (user.role !== 'admin') return send(res, 403, { detail: 'Not enough permissions' })
      const a = analyses.find((x) => x.thread_id === m[1]); const b = await readBody(req)
      if (!a) return send(res, 404, { detail: 'Analysis not found' })
      if (a.requested_by === user.id) return send(res, 403, { detail: 'You cannot review your own submission. Ask another admin to review this case.' })
      if (a.status !== 'pending_review') return send(res, 409, { detail: 'This analysis has already been reviewed.' })
      if (!['approved', 'rejected'].includes(b?.decision)) return send(res, 422, { detail: [{ msg: "Input should be 'approved' or 'rejected'" }] })
      await sleep(Math.min(DELAY, 800))
      a.human_decision = b.decision; a._st.human_decision = b.decision; a.reviewed_by = user.id; a.reviewed_at = new Date().toISOString()
      finish(a)
      return send(res, 200, pub(a))
    }
    if (p === '/admin/pending-reviews') {
      if (user.role !== 'admin') return send(res, 403, { detail: 'Not enough permissions' })
      const q = analyses.filter((a) => a.status === 'pending_review' && a.requested_by !== user.id).sort((a, b) => a.created_at.localeCompare(b.created_at))
      return send(res, 200, q.map((a) => ({ thread_id: a.thread_id, symbol: a.symbol, risk_score: a.risk_score, fraud_flag: a.fraud_flag, fraud_confidence: a.fraud_confidence, requested_by_email: [...users.values()].find((u) => u.id === a.requested_by)?.email, created_at: a.created_at })))
    }
    return send(res, 404, { detail: 'Not Found' })
  } catch (e) {
    console.error(e)
    return send(res, 500, { detail: 'Mock server error' })
  }
})

server.listen(PORT, () => {
  console.log(`FinGuardian mock API on http://localhost:${PORT}  (fake data - not for analysis)`)
  console.log('  user@demo.dev / user12345   admin@demo.dev / admin1234   analyst@demo.dev / analyst1234')
})
