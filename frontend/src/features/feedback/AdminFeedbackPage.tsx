import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminFeedbackError, loadAdminFeedback, type AdminFeedbackEntry, type AdminFeedbackPage as FeedbackPage } from './adminService'
import { loadAdminAccess } from '../admin/adminAccess'
import { InboxError, saveFeedbackStatus, sendFeedbackReply, statusLabels, type FeedbackStatus } from '../notifications/api'
import './adminFeedback.css'

export function AdminFeedbackPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [page, setPage] = useState<FeedbackPage | null>(null), [trail, setTrail] = useState([''])
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [canOperate, setCanOperate] = useState(false)
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async (nextTrail: string[]) => {
    request.current?.abort()
    const abort = request.current = new AbortController()
    setLoading(true); setError(''); setTrail(nextTrail)
    try {
      const value = await loadAdminFeedback(nextTrail.at(-1)!, abort.signal)
      if (!abort.signal.aborted) setPage(value)
    } catch (cause) {
      if (abort.signal.aborted) return
      if (cause instanceof AdminFeedbackError && cause.authEnded) { onAuthEnded(); return }
      setError(cause instanceof AdminFeedbackError ? cause.message : '연결 상태를 확인한 뒤 다시 조회해주세요.')
    } finally { if (!abort.signal.aborted) setLoading(false) }
  }, [onAuthEnded])
  useEffect(() => {
    const controller = new AbortController()
    void loadAdminAccess(controller.signal).then(access => {
      if (!controller.signal.aborted) setCanOperate(access.canOperate)
    }).catch(() => { if (!controller.signal.aborted) setCanOperate(false) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    let active = true
    // StrictMode's discarded mount must not issue an extra private read.
    queueMicrotask(() => { if (active) void load(['']) })
    return () => { active = false; request.current?.abort() }
  }, [load])
  return <section className="admin-feedback-content" aria-label="접수된 의견" aria-busy={loading}>
      <div className="admin-feedback-toolbar"><h2>접수 내역</h2>
        <button type="button" disabled={loading} onClick={() => void load([''])}>최신 의견 새로고침</button></div>
      {loading && <p role="status">의견을 확인하고 있어요…</p>}
      {error && <div className="admin-feedback-error" role="alert"><p>{error}</p>
        <button type="button" onClick={() => void load(trail)}>다시 조회</button></div>}
      {page && <>
        <p className="admin-feedback-count" role="status">{trail.length}페이지 · {page.items.length}건 · 최근 접수순</p>
        {page.items.length === 0 && <p className="admin-feedback-empty">접수된 의견이 없습니다.</p>}
        <div className="admin-feedback-entries">{page.items.map(entry => <article key={entry.receiptId}>
          <header><strong>접수 #{entry.receiptId}</strong><time dateTime={entry.acceptedAt}>{new Date(entry.acceptedAt).toLocaleString('ko-KR')}</time></header>
          <small>{entry.authorUserId === null ? '탈퇴 회원 · 작성자 정보 제거됨' : entry.authorNickname ?? `회원 #${entry.authorUserId}`} · 채널 {entry.channelId}
            {' · '}{statusLabels[entry.status ?? 'RECEIVED']}</small>
          <p>{entry.text}</p>
          {entry.latestReply && <aside className="admin-feedback-replied"><strong>최근 운영진 답변</strong><p>{entry.latestReply.text}</p>
            <time dateTime={entry.latestReply.createdAt}>{new Date(entry.latestReply.createdAt).toLocaleString('ko-KR')}</time></aside>}
          {canOperate && <FeedbackReplyForm entry={entry} onSaved={() => void load(trail)} onAuthEnded={onAuthEnded} />}
        </article>)}</div>
      </>}
      <nav className="admin-feedback-pagination" aria-label="의견 페이지">
        <button type="button" disabled={loading || trail.length < 2} onClick={() => void load(trail.slice(0, -1))}>이전 페이지</button>
        <button type="button" disabled={loading || !page?.nextCursor} onClick={() => page?.nextCursor && void load([...trail, page.nextCursor])}>다음 페이지</button>
      </nav>
  </section>
}

function FeedbackReplyForm({ entry, onSaved, onAuthEnded }: { entry: AdminFeedbackEntry; onSaved: () => void; onAuthEnded: () => void }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [status, setStatus] = useState<FeedbackStatus>(entry.status ?? 'RECEIVED')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('')
  const operationId = useRef<string | null>(null), pending = useRef(false), request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { setStatus(entry.status ?? 'RECEIVED') }, [entry.status])
  const save = async (reply: boolean) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setDone('')
    const controller = request.current = new AbortController()
    try {
      if (reply) {
        operationId.current ??= crypto.randomUUID()
        await sendFeedbackReply(entry.receiptId, { operationId: operationId.current, text, status, expectedVersion: entry.version! }, controller.signal)
      } else await saveFeedbackStatus(entry.receiptId, status, entry.version!, controller.signal)
      if (controller.signal.aborted) return
      if (reply) { setText(''); operationId.current = null; setOpen(false) }
      setDone(reply ? '답변을 보냈어요. 작성자의 알림함에 저장됐습니다.' : '처리 상태를 저장했어요.')
      onSaved()
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof InboxError && cause.status === 401) { onAuthEnded(); return }
      setError(cause instanceof Error ? cause.message : '처리하지 못했어요. 같은 요청으로 다시 시도해주세요.')
    } finally { pending.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  return <div className="admin-feedback-reply">
    <div className="admin-feedback-status"><label>처리 상태 <select value={status} disabled={busy || entry.version === undefined}
      onChange={event => { setStatus(event.target.value as FeedbackStatus); operationId.current = null }}>
      {Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
    </select></label><button disabled={busy || entry.version === undefined || status === entry.status} onClick={() => void save(false)}>상태 저장</button>
      <button disabled={busy || entry.authorUserId === null || entry.version === undefined} onClick={() => { setOpen(value => !value); setDone('') }}>답변 작성</button></div>
    {entry.version === undefined && <small>최신 서버에서 답변 기능을 사용할 수 있어요.</small>}
    {open && <form onSubmit={event => { event.preventDefault(); void save(true) }}>
      <label htmlFor={`reply-${entry.receiptId}`}>작성자에게 보낼 답변</label>
      <textarea id={`reply-${entry.receiptId}`} value={text} maxLength={2000} rows={4} disabled={busy}
        placeholder="반영한 내용과 감사 인사를 전해주세요."
        onChange={event => { setText(event.target.value); operationId.current = null }} />
      <div><small>{text.length} / 2000</small><button disabled={busy || !text.trim()} type="submit">{busy ? '보내는 중…' : '답변 보내기'}</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}{done && <p role="status">{done}</p>}
  </div>
}
