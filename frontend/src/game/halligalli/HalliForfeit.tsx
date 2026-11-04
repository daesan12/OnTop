import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { PaperPopup } from '../../features/tableLobby/PaperPopup'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { clearRoamingInput } from '../../world/inputOwnership'
import { canRetryForfeit, canStartForfeit, useForfeit } from '../forfeit'
import { useGame } from '../store'

/**
 * Menu trigger and a centred confirmation (the shared PaperPopup, like ALKKAGI). Presentation only: the shared forfeit
 * flow keeps the permission check, the one-request-at-a-time guard and receipt recovery. The game clock keeps running.
 */
/** True for a target on the dimmed backdrop: anything not inside the confirmation sheet itself. */
export const outsideSheet = (target: EventTarget | null) =>
  !!target && typeof (target as Element).closest === 'function' && !(target as Element).closest('.hg-forfeit-dialog')

export function HalliForfeit({ gameId, disabled }: { gameId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false), cancel = useRef<HTMLButtonElement>(null), pressedOutside = useRef(false)
  const state = useGame(), runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({ userId: s.sessionId, status: s.status, pending: s.pending })))
  const saved = useForfeit(s => s.attempt)
  const attempt = saved?.gameId === gameId && saved.userId === session.userId ? saved : null
  const playing = state.game?.gameId === gameId && state.game.role === 'PLAYER' && state.game.halli?.status === 'PLAYING'
    && state.game.halli.players.some(p => p.userId === session.userId && p.active)
  const connected = session.status === 'connected'
  const canStart = connected && !disabled && !session.pending && canStartForfeit(session.userId, state)
  const canRetry = connected && !session.pending && canRetryForfeit(session.userId, state)
  const recovering = attempt?.status === 'pending' || attempt?.status === 'uncertain'
  // Closes on its own once the server shows this player out (or the game over); a pending request stays reachable.
  useEffect(() => { if (!playing && !recovering) setOpen(false) }, [playing, recovering])
  useEffect(() => { if (open) clearRoamingInput() }, [open])
  if (!playing && !recovering) return null
  const close = () => setOpen(false)
  return <div className="hg-menu-danger">
    <button type="button" className="hg-forfeit-trigger" disabled={!canStart && !recovering} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}>기권</button>
    {/*
      A click on the dimmed backdrop cancels, like Esc and the close button. Both the press and the release must be off
      the sheet, so a drag that starts on the sheet (selecting its text) and ends outside does not close it.
    */}
    {open && createPortal(<div className="hg-forfeit-layer" onPointerDown={e => { pressedOutside.current = outsideSheet(e.target) }}
      onClick={e => { if (pressedOutside.current && outsideSheet(e.target)) close(); pressedOutside.current = false }}>
      <PaperPopup title="과일 땡" label="과일 땡 기권 확인" closeLabel="기권 취소" className="hg-forfeit-dialog" initialFocusRef={cancel} onClose={close}>
        <h2>기권하시겠어요?</h2>
        <p className="paper-subtitle">기권하면 현재 게임에서 패배 처리됩니다. 정말 기권하시겠어요?</p>
        {attempt?.error && <p className="paper-error" role="alert">{attempt.error}</p>}
        {attempt?.status === 'pending' ? <p role="status">기권 요청 확인 중…</p>
          : attempt?.status === 'approved' ? <p role="status">기권 요청을 확인했어요. 경기 상태를 기다리고 있어요.</p> : null}
        <div className="hg-forfeit-buttons">
          {attempt?.status === 'uncertain' ? <>
            <button type="button" disabled={!connected || session.pending} onClick={() => void runtime.checkRecovery()}>경기 상태 확인</button>
            <button type="button" className="hg-forfeit-confirm" disabled={!canRetry} onClick={() => void runtime.forfeitGame(gameId, true)}>같은 기권 요청 확인</button>
          </> : <>
            <button type="button" ref={cancel} onClick={close}>취소</button>
            <button type="button" className="hg-forfeit-confirm" disabled={!canStart} onClick={() => void runtime.forfeitGame(gameId)}>기권하기</button>
          </>}
        </div>
      </PaperPopup>
    </div>, document.body)}
  </div>
}
