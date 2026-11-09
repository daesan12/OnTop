import { useEffect, useId, useRef } from 'react'
import './exitConfirmation.css'
import { HallIcon } from './serviceHall/Icons'
import './gameTools.css'

export function ExitConfirmation({ open, busy = false, paused = true, cooperative = false, intent = 'exit', error = '', onContinue, onExit, onRetry }: {
  open: boolean; busy?: boolean; paused?: boolean; cooperative?: boolean; intent?: 'exit' | 'restart'; error?: string
  onContinue: () => void; onExit: () => void; onRetry?: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId(), restarting = intent === 'restart'
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open && dialog.current?.open) dialog.current.close()
  }, [open])
  useEffect(() => {
    if (open && !busy && (document.activeElement === dialog.current || !dialog.current?.contains(document.activeElement))) {
      dialog.current?.querySelector<HTMLButtonElement>('.skewer-exit-continue')?.focus({ preventScroll: true })
    }
  }, [open, busy])
  return <dialog ref={dialog} className="skewer-exit-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onContinue() }}>
    <p className="skewer-exit-caption">온탑 꼬치왕 · {restarting ? '다시 시작' : '잠깐 쉬어가기'}</p>
    <span className="skewer-exit-mark" aria-hidden="true"><HallIcon name={restarting ? 'reset' : 'pause'} /></span>
    <p className="skewer-exit-status" role="status">{paused ? '잠시 쉬어가는 중' : busy ? '게임을 멈추고 있어요…' : '일시정지를 확인하지 못했어요'}</p>
    <h2 id={titleId}>{restarting ? '처음부터 다시 시작할까요?' : '공원으로 나갈까요?'}</h2>
    <p>{restarting ? <>남은 시간과 점수, 주문이 처음 상태로 돌아가요.<br />지금의 연습을 이어가려면 계속하기를 눌러 주세요.</> : cooperative ? <>나가면 친구의 경기도 함께 끝나요.<br />계속하려면 가게로 돌아가 주세요.</> : <>진행 중인 연습이 끝나요.<br />계속하려면 가게로 돌아가 주세요.</>}</p>
    {error ? <p className="skewer-exit-error" role="alert">{error}</p> : null}
    {!paused && !busy && onRetry ? <button onClick={onRetry}>일시정지 다시 시도</button> : null}
    <div className="skewer-exit-actions">
      <button autoFocus className="skewer-exit-continue" disabled={busy} onClick={onContinue}>계속하기</button>
      <button className="skewer-exit-leave" disabled={busy} onClick={onExit}>{restarting ? '다시 시작' : '나가기'}</button>
    </div>
    <small>Esc로 가게에 돌아갈 수 있어요</small>
  </dialog>
}
