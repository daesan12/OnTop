import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { surrenderService } from './surrender'
import type { SurrenderContext } from './surrender'
import { canStartForfeit, canRetryForfeit, useForfeit } from './forfeit'
import { useGame } from './store'
import { gameState } from './protocol'
import { useSession } from '../network/worldClient'
import { useParkRuntime } from '../park/runtime/ParkRuntime'

export function OmokSurrender({ context, disabled }: { context: SurrenderContext; disabled: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const [completed, setCompleted] = useState(false)
  const runtime = useParkRuntime(), state = useGame()
  const session = useSession(useShallow(s => ({ sessionId: s.sessionId, status: s.status, pending: s.pending })))
  const saved = useForfeit(s => s.attempt)
  const attempt = saved?.gameId === context.gameId && saved.userId === context.userId ? saved : null
  const playing = state.game?.gameId === context.gameId && gameState(state.game).status === 'PLAYING'
  if (import.meta.env.DEV && import.meta.env.MODE === 'facility-preview') {
    if (!playing) return null
    return <div className="omok-surrender-preview">
      <p>수동 기권 목업 · 실제 경기·좌석·정산은 바뀌지 않습니다.</p>
      {completed ? <p role="status">기권 의사 확인 미리보기 완료 · 실제 경기는 계속됩니다.</p>
        : confirm && !disabled ? <div role="group" aria-label="기권 미리보기 확인">
          <p>기권 의사를 확인할까요? 이 미리보기는 서버에 전송되지 않습니다.</p>
          <button onClick={() => { surrenderService.preview(context); setCompleted(true); setConfirm(false) }}>기권 확인 (목업)</button>
          <button onClick={() => setConfirm(false)}>계속 두기</button>
        </div> : <button disabled={disabled} onClick={() => setConfirm(true)}>기권 미리보기 (목업)</button>}
    </div>
  }
  const connected = session.status === 'connected' && session.sessionId === context.userId
  const canStart = connected && !disabled && !session.pending && canStartForfeit(context.userId, state)
  const canRetry = connected && !session.pending && canRetryForfeit(context.userId, state)
  if (!playing && !attempt) return null
  return <div className="game-forfeit">
    {attempt?.status === 'pending' ? <p role="status">기권 요청 확인 중…</p>
      : attempt?.status === 'approved' ? <p role="status">기권 요청이 확인됐어요. 경기 진행·좌석·정산은 서버 상태를 따릅니다.</p>
      : attempt?.status === 'uncertain' ? <>
        <p role="alert">{attempt.error}</p>
        <button disabled={!connected || session.pending} onClick={() => void runtime.checkRecovery()}>경기 상태 확인</button>
        <button disabled={!canRetry} onClick={() => void runtime.forfeitGame(context.gameId, true)}>같은 기권 요청 확인</button>
      </> : <>
        {attempt?.error && <p role="alert">{attempt.error}</p>}
        {playing && (confirm ? <div role="group" aria-label="기권 확인">
          <p>이번 경기를 기권할까요? 기권은 되돌릴 수 없으며 결과·정산은 서버에서 확인합니다.</p>
          <button disabled={!canStart} onClick={() => { setConfirm(false); void runtime.forfeitGame(context.gameId) }}>기권 확정</button>
          <button onClick={() => setConfirm(false)}>계속 플레이</button>
        </div> : <button disabled={!canStart} onClick={() => setConfirm(true)}>기권</button>)}
      </>}
  </div>
}
