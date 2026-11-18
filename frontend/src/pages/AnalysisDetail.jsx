import { useEffect, useState } from 'react'
import { Api } from '../lib/api.js'
import { Btn, Empty, Notice, Skeleton } from '../components/ui.jsx'
import AnalysisView, { CompareLink } from '../components/AnalysisView.jsx'

export default function AnalysisDetail({ id }) {
  const [a, setA] = useState(null)
  const [prevId, setPrevId] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setA(null); setErr(null); setPrevId(null)
    Api.detail(id).then(async (d) => {
      if (!alive) return
      setA(d)
      // earlier run of the same symbol (list is newest first)
      const runs = await Api.list({ symbol: d.symbol, limit: 50 }).catch(() => [])
      const idx = runs.findIndex((r) => r.thread_id === d.thread_id)
      if (alive) setPrevId(idx >= 0 ? runs[idx + 1]?.thread_id || null : runs.find((r) => r.thread_id !== d.thread_id)?.thread_id || null)
    }).catch((e) => alive && setErr(e))
    return () => { alive = false }
  }, [id])

  if (err) {
    return err.status === 404
      ? <Empty title="This analysis doesn’t exist, or it isn’t yours." action={<Btn to="/app/history">Back to history</Btn>}>Only the person who ran an analysis (and admins) can open it.</Empty>
      : <Notice tone="bad">{err.message}</Notice>
  }
  if (!a) return <div className="grid"><Skeleton h={140} /><Skeleton h={360} /><Skeleton h={160} /></div>

  return (
    <AnalysisView a={a} actions={<>
      <CompareLink a={a} prevId={prevId} />
      <Btn variant="dark" size="sm" to={`/app/analyze?symbol=${encodeURIComponent(a.symbol)}&run=1`}>Run again</Btn>
    </>} reviewSlot={a.status === 'pending_review' ? <div className="mt24"><Notice tone="warn"><b>Awaiting review.</b>&nbsp;An admin other than the requester must approve or reject this case before its outlook is written.</Notice></div> : null} />
  )
}
