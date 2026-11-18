import { useEffect, useState } from 'react'
import { Api } from '../lib/api.js'
import { Badge, Btn, Empty, Eyebrow, Modal, Notice, Skeleton, useToast } from '../components/ui.jsx'
import { Iso } from '../components/Art.jsx'
import AnalysisView from '../components/AnalysisView.jsx'
import { fmtNum, fmtPct, timeAgo } from '../lib/format.js'

export default function Review() {
  const toast = useToast()
  const [queue, setQueue] = useState(null)
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'approved' | 'rejected'
  const [busy, setBusy] = useState(false)
  const [actionErr, setActionErr] = useState('')

  const load = () => Api.pending().then((q) => { setQueue(q); if (q.length && !openId) setOpenId(q[0].thread_id) }).catch((e) => setErr(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openId) { setDetail(null); return }
    let alive = true
    setDetail(null); setActionErr('')
    Api.detail(openId).then((d) => alive && setDetail(d)).catch((e) => alive && setActionErr(e.message))
    return () => { alive = false }
  }, [openId])

  const decide = async () => {
    setBusy(true); setActionErr('')
    try {
      await Api.resume(openId, confirm)
      toast(`${detail?.symbol || 'Case'} ${confirm}. The outlook and report are now written.`)
      window.dispatchEvent(new Event('fg:pending-changed'))
      setConfirm(null)
      const rest = queue.filter((q) => q.thread_id !== openId)
      setQueue(rest)
      setOpenId(rest[0]?.thread_id || null)
    } catch (e) {
      setActionErr(e.message)
      setConfirm(null)
      if (e.status === 409) { const q = await Api.pending().catch(() => queue); setQueue(q); setOpenId(q[0]?.thread_id || null) }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="l">
          <Eyebrow>Admin review</Eyebrow>
          <h1 className="h2">Cases waiting for a human</h1>
          <p className="body">Flagged by the anomaly screen, from other users only — you can’t review your own submissions. Your decision overrides the models and is recorded with your account.</p>
        </div>
        {queue && <Badge tone="ink" size="lg">{queue.length} pending</Badge>}
      </div>

      {err && <Notice tone="bad">{err}</Notice>}
      {!queue && !err && <Skeleton h={300} />}
      {queue && queue.length === 0 && (
        <Empty title="Queue is clear." art={<Iso name="grid" />}>
          Nothing is waiting for a decision. New flagged cases from other users appear here automatically.
        </Empty>
      )}

      {queue && queue.length > 0 && (
        <>
          <div className="grid g3">
            {queue.map((q) => (
              <button key={q.thread_id} className="panel" onClick={() => setOpenId(q.thread_id)}
                style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, outline: openId === q.thread_id ? '2px solid var(--ink)' : 'none', background: openId === q.thread_id ? 'var(--paper)' : 'var(--fog)' }}>
                <div className="spread"><b className="h4">{q.symbol}</b>{q.fraud_flag ? <Badge tone="neg">Flagged</Badge> : <Badge tone="mid">Uncertain</Badge>}</div>
                <span className="small muted">From {q.requested_by_email || 'a deleted user'} · {timeAgo(q.created_at)}</span>
                <span className="small">Risk <b className="num">{fmtNum(q.risk_score, 1)}</b> · anomaly <b className="num">{q.fraud_confidence != null ? fmtPct(q.fraud_confidence * 100, 1, false) : '—'}</b></span>
              </button>
            ))}
          </div>

          {actionErr && <div className="mt24"><Notice tone="bad">{actionErr}</Notice></div>}
          {openId && !detail && !actionErr && <div className="mt40"><Skeleton h={400} /></div>}
          {detail && (
            <div className="mt56">
              <AnalysisView a={detail} compact reviewSlot={
                <div className="panel lime mt24 spread">
                  <div><span className="mono">/ Your decision</span><p className="body mt8" style={{ maxWidth: 560 }}>Approve if the movement has an ordinary explanation; reject if it looks suspicious. A rejection always produces negative signals and a critical alert.</p></div>
                  <div className="row">
                    <Btn variant="dark" onClick={() => setConfirm('approved')}>Approve</Btn>
                    <Btn variant="light" onClick={() => setConfirm('rejected')}>Reject</Btn>
                  </div>
                </div>
              } />
            </div>
          )}
        </>
      )}

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} labelledBy="confirm-title">
        <span className="eyebrow mono short">/ Confirm</span>
        <h2 className="h3" id="confirm-title">{confirm === 'approved' ? 'Approve' : 'Reject'} {detail?.symbol}?</h2>
        <p className="body ink2">
          {confirm === 'approved'
            ? 'The pipeline resumes and writes the outlook from the measured signals. This can’t be undone.'
            : 'The pipeline resumes with your rejection: the outlook becomes negative signals and a critical alert is recorded. This can’t be undone.'}
        </p>
        <div className="row">
          <Btn variant={confirm === 'approved' ? 'dark' : 'lime'} loading={busy} onClick={decide}>{confirm === 'approved' ? 'Yes, approve' : 'Yes, reject'}</Btn>
          <Btn variant="ghost" icon={false} onClick={() => setConfirm(null)} disabled={busy}>Cancel</Btn>
        </div>
      </Modal>
    </>
  )
}
