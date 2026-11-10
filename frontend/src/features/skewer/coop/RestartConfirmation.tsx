import { useEffect, useId, useRef, useState } from 'react'
import type { CoopPublic } from './contracts'
import '../exitConfirmation.css'

export function RestartConfirmation({ request, own, busy, error, onReply }: {
  request: NonNullable<CoopPublic['restart']> | null; own: boolean; busy: boolean; error: string
  onReply: (accept: boolean) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!request) { dialog.current?.close(); return }
    setNow(Date.now())
    // 사용자가 열어 둔 안내창 위에서도 동의 요청을 확인할 수 있도록 최상위 모달로 연다.
    if (!dialog.current?.open) dialog.current?.showModal()
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [request?.id])
  const seconds = request ? Math.min(15, Math.max(0, Math.ceil((request.expiresAt - now) / 1000))) : 0
  return <dialog ref={dialog} className="skewer-exit-dialog coop-restart-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!own && !busy) onReply(false) }}>
    <p className="skewer-exit-caption">온탑 꼬치왕 · 함께 다시 시작</p>
    <span className="skewer-exit-mark" aria-hidden="true">↻</span>
    <p className="skewer-exit-status" role="status">{own ? '친구의 동의를 기다리고 있어요' : '친구가 다시 시작을 요청했어요'}</p>
    <h2 id={titleId}>{own ? '친구의 응답을 기다려요' : '함께 다시 시작할까요?'}</h2>
    <p>현재 점수와 주문을 초기화하고 다시 시작할까요?<br />두 사람 모두 동의해야 다시 시작해요.</p>
    <p>응답 대기 <b>{seconds}초</b> · 영업 시간은 잠시 멈춰요.</p>
    {error ? <p className="skewer-exit-error" role="alert">{error}</p> : null}
    {!own ? <div className="skewer-exit-actions">
      <button autoFocus className="skewer-exit-continue" disabled={busy} onClick={() => onReply(false)}>기존 경기 계속</button>
      <button disabled={busy} onClick={() => onReply(true)}>동의하고 다시 시작</button>
    </div> : null}
    <small>거절하거나 15초 동안 응답하지 않으면 기존 경기를 이어가요.</small>
  </dialog>
}
