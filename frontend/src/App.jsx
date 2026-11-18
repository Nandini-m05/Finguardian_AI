import { useEffect } from 'react'
import { matchPath, useLocation } from './lib/router.jsx'
import { RequireAuth } from './components/AppShell.jsx'
import { Btn, Empty } from './components/ui.jsx'
import Landing from './pages/Landing.jsx'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Analyze from './pages/Analyze.jsx'
import AnalysisDetail from './pages/AnalysisDetail.jsx'
import History from './pages/History.jsx'
import Compare from './pages/Compare.jsx'
import Review from './pages/Review.jsx'

const TITLES = { '/': 'Explainable market analysis', '/login': 'Log in', '/register': 'Create account', '/app': 'Dashboard', '/app/analyze': 'Analyze', '/app/history': 'History', '/app/compare': 'Compare', '/app/review': 'Admin review' }

export default function App() {
  const { path } = useLocation()
  useEffect(() => {
    const t = TITLES[path] || (path.startsWith('/app/analysis') ? 'Analysis' : 'Not found')
    document.title = `${t} — FinGuardian AI`
  }, [path])

  if (path === '/') return <Landing />
  if (path === '/login') return <Auth mode="login" />
  if (path === '/register') return <Auth mode="register" />
  if (path === '/app') return <RequireAuth><Dashboard /></RequireAuth>
  if (path === '/app/analyze') return <RequireAuth><Analyze /></RequireAuth>
  if (path === '/app/history') return <RequireAuth><History /></RequireAuth>
  if (path === '/app/compare') return <RequireAuth><Compare /></RequireAuth>
  if (path === '/app/review') return <RequireAuth admin><Review /></RequireAuth>
  const m = matchPath('/app/analysis/:id', path)
  if (m) return <RequireAuth><AnalysisDetail key={m.id} id={m.id} /></RequireAuth>

  return (
    <main className="app-main band"><div className="wrap">
      <Empty title="This page doesn’t exist." action={<Btn to="/">Go home</Btn>}>Check the address, or head back to the start.</Empty>
    </div></main>
  )
}
