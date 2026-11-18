import { useState } from 'react'
import { Link } from '../lib/router.jsx'
import { useAuth } from '../lib/auth.jsx'
import { Btn, Eyebrow, useReveal } from '../components/ui.jsx'
import { Iso, Logo, NeonMark, PixelHover, Reel } from '../components/Art.jsx'
import { AGENTS } from '../components/Pipeline.jsx'
import { useMenu, useScrollNav } from '../components/AppShell.jsx'
import { RiskGauge } from '../components/charts.jsx'

const TICKERS = [['AAPL'], ['RELIANCE.NS', 'm'], ['NVDA'], ['TCS.NS', 'm'], ['MSFT'], ['INFY.NS', 'm'], ['TSLA'], ['HDFCBANK.NS', 'm']]

const FEATURES = [
  { art: 'steps', title: 'Risk score with reasons', body: 'A 0–100 score built from volatility, news, the day’s move and volume — every point traced to a named factor.' },
  { art: 'slab', title: 'Anomaly screen, explained', body: 'XGBoost and Isolation Forest check for unusual patterns; SHAP shows which inputs pushed the model and how hard.' },
  { art: 'cube', title: 'FinBERT news sentiment', body: 'Each relevant headline scored by a finance-tuned model. Fewer than three articles? It says so instead of guessing.' },
  { art: 'link', title: 'Human in the loop', body: 'Flagged cases pause until a second analyst signs off. Nobody reviews their own case.' },
  { art: 'row', title: 'Compare any two runs', body: 'Put today’s run next to last week’s — or two companies side by side — and see exactly what moved.' },
]

const FAQ = [
  ['Is this investment advice?', 'No. FinGuardian is an educational capstone project. It describes what public data shows (positive, mixed or negative signals) and never tells anyone to buy, sell or hold. It is not registered with SEBI or any other regulator.'],
  ['Where does the data come from?', 'Prices, volume and headlines come from Yahoo Finance through the open-source yfinance library. Free data can be delayed, incomplete or wrong, and the report says when news is too thin to use.'],
  ['How is the risk score calculated?', 'It is a transparent rule: up to 40 points for volatility (standard deviation of daily % returns), 30 for negative news sentiment, 20 for a large single-day move and 10 for a volume spike. The breakdown is shown on every analysis.'],
  ['What happens when a case is flagged?', 'The LangGraph pipeline genuinely pauses (its state is checkpointed in Postgres) until an admin approves or rejects it. A rejection always produces negative signals, and every decision records who made it and when.'],
  ['Are the anomaly models validated?', 'Not yet. They are trained on synthetic data generated at startup, so they demonstrate the method rather than prove anything about real manipulation. The interface labels this wherever the score appears.'],
]

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <div className="qa">
      {FAQ.map(([q, a], i) => (
        <div key={q} className={`q${open === i ? ' open' : ''}`} data-rv>
          <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{q}<span className="pm" /></button>
          <div className="a"><div><p className="body">{a}</p></div></div>
        </div>
      ))}
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const { solid, hide } = useScrollNav()
  const [open, setOpen] = useMenu()
  useReveal([])
  const start = user ? '/app/analyze' : '/register'

  return (
    <>
      <header className={`nav band${solid ? ' solid' : ''}${hide ? ' hide' : ''}`}>
        <div className="wrap">
          <Link to="/" aria-label="FinGuardian home"><Logo /></Link>
          <nav className="nav-links" aria-label="Primary">
            <a href="#pipeline">Pipeline</a><a href="#features">Features</a><a href="#stack">Stack</a><a href="#scope">Scope</a>
          </nav>
          <div className="nav-end">
            {user ? <Link to="/app" className="nav-cta dark">Open dashboard</Link> : <>
              <Link to="/login" className="nav-cta">Log in</Link>
              <Link to="/register" className="nav-cta dark">Create account</Link>
            </>}
            <button className="burger" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}><span /><span /><span /></button>
          </div>
        </div>
      </header>
      <div className="mmenu" aria-hidden={!open}>
        <a href="#pipeline" onClick={() => setOpen(false)}>Pipeline</a>
        <a href="#features" onClick={() => setOpen(false)}>Features</a>
        <a href="#scope" onClick={() => setOpen(false)}>Scope</a>
        {user ? <Link to="/app">Dashboard</Link> : <><Link to="/login">Log in</Link><Link to="/register">Create account</Link></>}
      </div>

      <main id="top">
        {/* HERO */}
        <section className="hero band">
          <div className="wrap">
            <div className="hero-top">
              <h1 className="h1 fade-up">Explainable market analysis, with a human in the loop.</h1>
              <div className="fade-up" style={{ animationDelay: '.3s' }}><Reel label="/ Signal trace" ticker="AAPL · RELIANCE.NS" right="8 agents" /></div>
            </div>
            <div className="hero-bottom">
              <div className="hero-art fade-up" style={{ animationDelay: '.2s' }}><Iso name="hero" /></div>
              <div>
                <p className="lead fade-up" style={{ animationDelay: '.4s' }}>
                  FinGuardian runs eight AI agents over live prices and news for any listed stock. It scores risk, screens for anomalies,
                  and pauses for an analyst when something looks off — then tells you, in plain words, why.
                </p>
                <div className="hero-ctas fade-up" style={{ animationDelay: '.5s' }}>
                  <Btn to={start} variant="dark">Analyse a stock</Btn>
                  <Btn href="#pipeline" variant="ghost">See the pipeline</Btn>
                </div>
                <div className="mt40 fade-up" style={{ animationDelay: '.6s' }}>
                  <span className="mono">/ Any Yahoo Finance ticker, US or NSE</span>
                  <div className="marquee" aria-label="Example tickers">
                    <div className="track">
                      {[...TICKERS, ...TICKERS].map(([t, k], i) => <span key={i} className={k || ''} aria-hidden={i >= TICKERS.length}>{!k && <i />}{t}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PIPELINE */}
        <section className="sec band" id="pipeline">
          <div className="wrap">
            <div className="head">
              <div className="head-l"><Eyebrow data-rv>The pipeline</Eyebrow><h2 className="h2" data-rv>Eight agents, one explainable outlook</h2></div>
              <p className="body" data-rv>Each agent reads what the previous ones found and adds its own piece. LangGraph checkpoints the state after every step in Postgres, so a paused case survives a restart.</p>
            </div>
            <div className="agents">
              {AGENTS.map((a, i) => (
                <article key={a.key} className={`agent${a.key === 'review' ? ' hl' : ''}`} data-rv>
                  <span className="n">/0{i + 1}</span>
                  <div><h3>{a.name}</h3><p>{a.line}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* PREVIEW */}
        <section className="band">
          <div className="wrap">
            <div className="preview" data-rv>
              <div className="glow" />
              <div style={{ position: 'relative' }}>
                <span className="mono" style={{ color: 'var(--lime)' }}>/ What a result looks like</span>
                <h2 className="h3 mt24" style={{ maxWidth: 560 }}>Every number arrives with the reason behind it.</h2>
                <ul className="changes mt24" style={{ maxWidth: 560 }}>
                  <li><span className="ck" />Risk 27.9 / 100 — volatility contributes 18 of those points</li>
                  <li><span className="ck" />News: 6 positive, 3 neutral, 1 negative headline (FinBERT)</li>
                  <li><span className="ck" />Anomaly probability 2.1% — clear, no review needed</li>
                  <li><span className="ck" />Outlook: positive signals. Describes conditions, never advises.</li>
                </ul>
                <div className="mt40"><Btn to={start} variant="lime">Run your first analysis</Btn></div>
              </div>
              <div style={{ position: 'relative', display: 'grid', alignContent: 'center', gap: 12 }}>
                <div className="panel" style={{ background: '#1c1c1c' }}><RiskGauge value={27.9} dark /></div>
                <span className="mono-s" style={{ color: '#8f8f8f', textAlign: 'center' }}>Illustrative example</span>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="sec band" id="features">
          <div className="wrap">
            <div className="head">
              <div className="head-l"><Eyebrow data-rv>What you get</Eyebrow><h2 className="h2" data-rv>A dashboard built for explaining, not predicting</h2></div>
            </div>
            <div className="bento">
              {FEATURES.map((f) => (
                <article className="card" key={f.title} data-rv>
                  <PixelHover />
                  <Iso name={f.art} className="art" />
                  <h3 className="h4">{f.title}</h3>
                  <p className="body">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* STACK */}
        <section className="sec band" id="stack" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="head"><div className="head-l"><Eyebrow data-rv>Under the hood</Eyebrow><h2 className="h2" data-rv>What it is built with</h2></div></div>
            <div className="stackbar" data-rv>
              {[
                ['FastAPI', <path key="a" d="M24 6L10 26h12l-4 16 16-22H22z" />],
                ['LangGraph', <g key="b"><rect x="8" y="8" width="12" height="12" rx="2" /><rect x="28" y="28" width="12" height="12" rx="2" /><path d="M20 14h8a6 6 0 0 1 6 6v8M28 34h-8a6 6 0 0 1-6-6v-8" /></g>],
                ['FinBERT', <g key="c"><circle cx="24" cy="24" r="9" /><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11.3 11.3l4.2 4.2M32.5 32.5l4.2 4.2M11.3 36.7l4.2-4.2M32.5 15.5l4.2-4.2" /></g>],
                ['XGBoost', <g key="d"><circle cx="10" cy="24" r="4" /><circle cx="38" cy="12" r="4" /><circle cx="38" cy="36" r="4" /><path d="M14 24h8l12-10M22 24l12 10" /></g>],
                ['Supabase', <g key="e"><ellipse cx="24" cy="12" rx="14" ry="5" /><path d="M10 12v24c0 2.8 6.3 5 14 5s14-2.2 14-5V12M10 24c0 2.8 6.3 5 14 5s14-2.2 14-5" /></g>],
              ].map(([name, icon], i) => (
                <div className="tool" key={name}>
                  <span className="n mono">/0{i + 1}</span>
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">{icon}</svg>
                  <span className="nm mono">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec band" id="scope" style={{ paddingTop: 0 }}>
          <div className="wrap faq">
            <div className="head-l"><Eyebrow data-rv>Scope</Eyebrow><h2 className="h2" data-rv>Read this before you trust a number</h2></div>
            <Faq />
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="foot band">
        <div className="wrap">
          <div className="f-cta">
            <div className="l">
              <h2 className="h2">Pick a ticker. See what the data says, and why.</h2>
              <div className="mt40"><Btn to={start} variant="lime">{user ? 'Open the analyzer' : 'Create a free account'}</Btn></div>
            </div>
            <NeonMark />
          </div>
          <div className="rule" />
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 40 }}>
            <div style={{ maxWidth: 560 }}>
              <span className="mono" style={{ color: '#8f8f8f' }}>/ Disclaimer</span>
              <p className="small mt16" style={{ color: '#cfcfcf' }}>
                FinGuardian AI is an educational, automated analysis of public market data built as a B.Tech CSE capstone. It is not investment advice,
                a research report, or a recommendation to buy, sell or hold any security, and it is not registered with SEBI or any other financial regulator.
              </p>
            </div>
            <div className="row" style={{ gap: 32 }}>
              <div className="stack-sm"><span className="mono" style={{ color: '#8f8f8f' }}>/ App</span><Link className="small" to="/login">Log in</Link><Link className="small" to="/register">Register</Link></div>
              <div className="stack-sm"><span className="mono" style={{ color: '#8f8f8f' }}>/ Page</span><a className="small" href="#pipeline">Pipeline</a><a className="small" href="#scope">Scope</a></div>
            </div>
          </div>
          <div className="f-bar"><span className="mono">© 2026 FinGuardian AI</span><span className="small">LangGraph · FastAPI · Supabase · React</span></div>
          <svg className="wordmark" viewBox="0 0 1240 200" aria-hidden="true">
            <text x="0" y="190" textLength="1240" lengthAdjust="spacingAndGlyphs" fontFamily="Figtree, Arial, sans-serif" fontWeight="700" fontSize="240" fill="none" stroke="#2e2e2e" strokeWidth="1.5">FinGuardian</text>
          </svg>
        </div>
      </footer>
    </>
  )
}
