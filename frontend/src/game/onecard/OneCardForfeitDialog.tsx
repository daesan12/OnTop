import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { canRetryForfeit, canStartForfeit, useForfeit } from '../forfeit'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'

/** Only the presentation changes; the existing explicit-forfeit contract remains authoritative. */
export function OneCardForfeitDialog({ gameId, disabled }: { gameId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false), dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const state = useGame(), runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({ userId: s.sessionId, status: s.status, pending: s.pending })))
  const saved = useForfeit(s => s.attempt)
  const attempt = saved?.gameId === gameId && saved.userId === session.userId ? saved : null
  const playing = state.game?.gameId === gameId && state.game.role === 'PLAYER'
    && state.game.onecard?.status === 'PLAYING' && state.game.onecard.players.some(p => p.userId === session.userId && p.active)
  const connected = session.status === 'connected'
  const canStart = connected && !disabled && !session.pending && canStartForfeit(session.userId, state)
  const canRetry = connected && !session.pending && canRetryForfeit(session.userId, state)
  const recovering = attempt?.status === 'uncertain' || attempt?.status === 'pending'
  useEffect(() => { if (!playing && !recovering) setOpen(false) }, [playing, recovering])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (open || !playing && !recovering || !(canStart || recovering)
        || event.code !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.metaKey || event.altKey) return
      if (Object.values(inputState).some(Boolean) || document.querySelector('dialog[open],[role="dialog"]')
        || event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return
      event.preventDefault(); event.stopPropagation(); setOpen(true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, playing, canStart, recovering])
  useLayoutEffect(() => {
    const node = dialog.current
    if (open && node && !node.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      clearRoamingInput()
      if (document.pointerLockElement) document.exitPointerLock()
      node.showModal()
      node.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus()
    } else if (!open && node?.open) {
      node.close()
      ;(previousFocus.current?.isConnected ? previousFocus.current : document.querySelector<HTMLCanvasElement>('canvas'))?.focus({ preventScroll: true })
    }
  }, [open])
  return createPortal(<dialog ref={dialog} className="onecard-forfeit-dialog" aria-labelledby="onecard-forfeit-title"
    aria-describedby="onecard-forfeit-warning" onCancel={event => { event.preventDefault(); setOpen(false) }}
    onClose={() => setOpen(false)} onKeyDown={event => event.stopPropagation()}>
    {open && <>
      <h2 id="onecard-forfeit-title">기권하시겠습니까?</h2>
      <p id="onecard-forfeit-warning">배팅한 엽전은 모두 잃게 됩니다.</p>
      {attempt?.error && <p role="alert">{attempt.error}</p>}
      {attempt?.status === 'pending' ? <p role="status">기권 요청 확인 중…</p>
        : attempt?.status === 'approved' ? <p role="status">기권 요청을 확인했어요. 서버 상태를 기다리고 있습니다.</p>
        : attempt?.status === 'uncertain' ? <div className="onecard-forfeit-actions">
          <button disabled={!connected || session.pending} onClick={() => void runtime.checkRecovery()}>경기 상태 확인</button>
          <button disabled={!canRetry} onClick={() => void runtime.forfeitGame(gameId, true)}>같은 기권 요청 확인</button>
        </div> : <div className="onecard-forfeit-actions">
          <button className="onecard-forfeit-confirm" disabled={!canStart} onClick={() => void runtime.forfeitGame(gameId)}>기권 확정</button>
          <button data-initial-focus onClick={() => setOpen(false)}>계속 플레이</button>
        </div>}
      {attempt && ['pending', 'approved', 'uncertain'].includes(attempt.status) && <button data-initial-focus onClick={() => setOpen(false)}>닫기</button>}
    </>}
  </dialog>, document.body)
}
