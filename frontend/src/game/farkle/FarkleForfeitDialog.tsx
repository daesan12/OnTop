import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { canRetryForfeit, canStartForfeit, useForfeit } from '../forfeit'
import { useGame } from '../store'
import { useDiceUI } from './controls'
import '../../features/tableLobby/paperPopup.css'
import './forfeit.css'

/** The menu and Esc share one confirmation; the existing runtime owns actual forfeiture. */
export function FarkleForfeitDialog({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false), dialog = useRef<HTMLDialogElement>(null)
  const state = useGame(), runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({ userId: s.sessionId, status: s.status, pending: s.pending })))
  const saved = useForfeit(s => s.attempt)
  const attempt = saved?.gameId === gameId && saved.userId === session.userId ? saved : null
  const playing = state.game?.gameId === gameId && state.game.role === 'PLAYER' && state.game.dice?.status === 'PLAYING'
  const connected = session.status === 'connected'
  const canStart = connected && !session.pending && canStartForfeit(session.userId, state)
  const canRetry = connected && !session.pending && canRetryForfeit(session.userId, state)
  const recovering = attempt?.status === 'pending' || attempt?.status === 'uncertain'
  useEffect(() => { if (!playing && !recovering) setOpen(false) }, [playing, recovering])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (open || !playing && !recovering || !canStart && !recovering || event.code !== 'Escape'
        || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.altKey || event.metaKey || document.hidden || panelOwnsKeys()
        || useDiceUI.getState().cup !== 'idle'
        || event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return
      event.preventDefault()
      const menu = document.querySelector<HTMLDetailsElement>('.farkle-settings[open]')
      if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); return }
      setOpen(true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, playing, recovering, canStart])
  useLayoutEffect(() => {
    const node = dialog.current
    if (!open || !node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const owned = inputState.minigameOpen
    inputState.minigameOpen = true; clearRoamingInput()
    if (document.pointerLockElement) document.exitPointerLock()
    node.showModal(); node.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus()
    return () => {
      if (node.open) node.close()
      inputState.minigameOpen = owned
      ;(previous?.isConnected ? previous : document.querySelector<HTMLCanvasElement>('canvas'))?.focus({ preventScroll: true })
    }
  }, [open])
  useLayoutEffect(() => {
    const node = dialog.current
    if (open && node?.open && (!node.contains(document.activeElement) || document.activeElement === node))
      node.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus()
  }, [open, attempt?.status])
  return <>
    {(playing || recovering) && <div className="game-forfeit"><button disabled={!canStart && !recovering}
      aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts="Escape" onClick={() => setOpen(true)}>기권</button></div>}
    {createPortal(<dialog ref={dialog} className="table-paper-popup farkle-forfeit-dialog" aria-label="기권 확인" aria-describedby="farkle-forfeit-warning"
      onCancel={event => { event.preventDefault(); setOpen(false) }} onClose={() => setOpen(false)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.code === 'Escape' && event.repeat) event.preventDefault()
        if (event.code !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const first = buttons[0], last = buttons.at(-1), active = document.activeElement
        if (event.shiftKey ? active === first : active === last) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus()
        }
      }}>
      {open && <>
        <button className="paper-close" aria-label="기권 취소" onClick={() => setOpen(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5L19 19M19 5L5 19" /></svg>
        </button>
        <p className="paper-caption">주사위 한 판</p>
        <div className="farkle-forfeit-seal" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 27V5m0 1c6-4 9 5 16 0v13c-7 5-10-4-16 0" /></svg>
        </div>
        <h2>이번 판을<br />기권할까요?</h2>
        <p className="paper-subtitle" id="farkle-forfeit-warning">기권은 되돌릴 수 없어요.<br />기권하면 이번 경기는 패배로 처리됩니다.</p>
        {attempt?.error && <p role="alert">{attempt.error}</p>}
        {attempt?.status === 'pending' ? <p role="status">기권 요청 확인 중…</p>
          : attempt?.status === 'approved' ? <p role="status">기권 요청이 확인됐어요. 경기 결과를 기다립니다.</p>
          : attempt?.status === 'uncertain' ? <div className="farkle-forfeit-actions">
            <button disabled={!connected || session.pending} onClick={() => void runtime.checkRecovery()}>경기 상태 확인</button>
            <button disabled={!canRetry} onClick={() => void runtime.forfeitGame(gameId, true)}>같은 기권 요청 확인</button>
          </div> : <div className="farkle-forfeit-actions">
            <button className="paper-primary" data-initial-focus onClick={() => setOpen(false)}>계속 플레이</button>
            <button className="farkle-forfeit-confirm" disabled={!canStart} onClick={() => void runtime.forfeitGame(gameId)}>기권 확정</button>
          </div>}
        {recovering && <button data-initial-focus onClick={() => setOpen(false)}>닫기</button>}
        <small>확인 중에도 제한시간은 계속 흐릅니다.</small>
      </>}
    </dialog>, document.body)}
  </>
}
