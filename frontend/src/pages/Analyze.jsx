import { useEffect, useRef, useState } from 'react'
import { navigate, useLocation } from '../lib/router.jsx'
import { Api } from '../lib/api.js'
import { Btn, Eyebrow, Notice } from '../components/ui.jsx'
import { PipelineProgress } from '../components/Pipeline.jsx'
import AnalysisView, { CompareLink } from '../components/AnalysisView.jsx'

const SUGGEST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS']
const SYMBOL_RE = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/

export default function Analyze() {
  const { query } = useLocation()
  const [symbol, setSymbol] = useState((query.get('symbol') || '').toUpperCase())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [prevId, setPrevId] = useState(null)
  const [err, setErr] = useState('')
  const ctl = useRef(null)
  const autoRan = useRef(false)

  const run = async (sym) => {
    const s = (sym ?? symbol).trim().toUpperCase()
    setErr('')
    if (!SYMBOL_RE.test(s)) { setErr('Use a Yahoo Finance ticker: letters, digits, ".", "-", "=" or "^" (e.g. AAPL, RELIANCE.NS).'); return }
    setSymbol(s); setResult(null); setPrevId(null); setRunning(true)
    ctl.current = new AbortController()
    try {
      // previous run of the same symbol, for the "compare" shortcut
      const prev = await Api.list({ symbol: s, limit: 1 }).catch(() => [])
      const r = await Api.analyze(s, ctl.current.signal)
      setResult(r)
      setPrevId(prev[0]?.thread_id || null)
      window.history.replaceState({}, '', `/app/analyze?symbol=${encodeURIComponent(s)}`)
    } catch (e) {
      if (e.name !== 'AbortError') {
        setErr(e.status === 429 ? 'Rate limit reached (5 analyses per minute). Wait a moment and try again.' : e.message)
      }
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => () => ctl.current?.abort(), [])
  useEffect(() => {
    if (!autoRan.current && query.get('symbol') && query.get('run') === '1') { autoRan.current = true; run(query.get('symbol')) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="page-head">
        <div className="l">
          <Eyebrow>Analyze</Eyebrow>
          <h1 className="h2">Run the eight-agent pipeline</h1>
          <p className="body">Any Yahoo Finance symbol: US tickers as they are, NSE with <b>.NS</b>, BSE with <b>.BO</b>. Limited to five runs a minute.</p>
        </div>
      </div>

      <form className="panel" onSubmit={(e) => { e.preventDefault(); run() }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 320px' }}>
            <span>Ticker symbol</span>
            <input className="input big" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" maxLength={20}
              autoFocus aria-invalid={!!err} disabled={running} spellCheck="false" autoComplete="off" />
          </label>
          <Btn type="submit" loading={running} style={{ height: 66 }}>{running ? 'Running' : 'Run analysis'}</Btn>
        </div>
        <div className="row mt16" style={{ gap: 8 }}>
          <span className="mono-s muted" style={{ marginRight: 4 }}>Try</span>
          {SUGGEST.map((s) => <button type="button" key={s} className={`chip${s === symbol ? ' on' : ''}`} disabled={running} onClick={() => run(s)}>{s}</button>)}
        </div>
        {err && <div className="mt16"><Notice tone="bad">{err}</Notice></div>}
      </form>

      {(running || result) && (
        <div className="mt24">
          <div className="section-title" style={{ marginTop: 32 }}><h2>{running ? `Analysing ${symbol}…` : 'Pipeline'}</h2>
            {running && <button className="chip" onClick={() => ctl.current?.abort()}>Cancel</button>}
          </div>
          <PipelineProgress running={running} result={result} />
        </div>
      )}

      {result && (
        <div className="mt56">
          {result.status === 'pending_review' && (
            <Notice tone="warn">
              <b>Paused for review.</b>&nbsp;The anomaly screen was not confident this case is clean, so an admin (not you) has to approve or reject it before the outlook is written. You will find it in History.
            </Notice>
          )}
          <div className="mt24">
            <AnalysisView a={result} actions={<>
              <CompareLink a={result} prevId={prevId} />
              <Btn variant="light" size="sm" onClick={() => navigate(`/app/analysis/${result.thread_id}`)}>Open as page</Btn>
            </>} />
          </div>
        </div>
      )}
    </>
  )
}
