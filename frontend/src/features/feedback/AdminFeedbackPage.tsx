import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminFeedbackError, loadAdminFeedback, type AdminFeedbackPage as FeedbackPage } from './adminService'
import './adminFeedback.css'

export function AdminFeedbackPage({ onReturn, onAuthEnded }: { onReturn: () => void; onAuthEnded: () => void }) {
  const [page, setPage] = useState<FeedbackPage | null>(null), [trail, setTrail] = useState([''])
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const request = useRef<AbortController | null>(null), heading = useRef<HTMLHeadingElement>(null)
  const load = useCallback(async (nextTrail: string[]) => {
    request.current?.abort()
    const abort = request.current = new AbortController()
    setLoading(true); setError(''); setPage(null); setTrail(nextTrail)
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
    let active = true
    heading.current?.focus()
    // StrictMode's discarded mount must not issue an extra private read.
    queueMicrotask(() => { if (active) void load(['']) })
    return () => { active = false; request.current?.abort() }
  }, [load])
  return <main className="admin-feedback-page">
    <header className="admin-feedback-header">
      <a href="/park" onClick={event => { event.preventDefault(); onReturn() }}>← 공원으로 돌아가기</a>
      <small>온탑 · 관리자 전용</small><h1 ref={heading} tabIndex={-1}>소리함 의견 조회</h1>
      <p>이용자가 비공개로 남긴 의견입니다. 서버에서 조회 권한을 확인합니다.</p>
    </header>
    <section className="admin-feedback-content" aria-label="접수된 의견" aria-busy={loading}>
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
          <small>{entry.authorUserId === null ? '탈퇴 회원 · 작성자 정보 제거됨' : `회원 #${entry.authorUserId}`} · 채널 {entry.channelId}</small>
          <p>{entry.text}</p>
        </article>)}</div>
      </>}
      <nav className="admin-feedback-pagination" aria-label="의견 페이지">
        <button type="button" disabled={loading || trail.length < 2} onClick={() => void load(trail.slice(0, -1))}>이전 페이지</button>
        <button type="button" disabled={loading || !page?.nextCursor} onClick={() => page?.nextCursor && void load([...trail, page.nextCursor])}>다음 페이지</button>
      </nav>
    </section>
  </main>
}
