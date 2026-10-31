import { useSession } from '../../network/worldClient'
import { useGame, tableBusy } from '../../game/store'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { openManual } from '../manual/manualState'
import { GAME_MANUAL, type GatheringModel } from './gatheringModel'
import { getGathering, returnToWaiting } from './gathering'
import { resetSeatedLook, seatScope, useTableLobby } from './state'
import { FinishedForfeitStatus } from '../../game/OmokSurrender'
import { BoardRewardCoinSource } from '../wallet/RewardCoinFlight'
import './gathering.css'

export function LegacyTableGatheringHud({ model }: { model: GatheringModel }) {
  const runtime = useParkRuntime(), pending = useSession(s => s.pending), connected = useSession(s => s.status === 'connected')
  const error = useGame(s => s.error), busy = useGame(tableBusy), gamePending = useGame(s => s.pending)
  const looking = useTableLobby(s => !!s.lookScope)
  const anchor = useSession(s => s.bindings.find(b => b.channelId === s.roomId && b.tableId === model.tableId)?.anchorId)
  const disabled = pending || gamePending || !connected
  const primary = () => {
    const current = getGathering()
    if (disabled || current?.scope !== model.scope) return
    if (current.finished) { if (current.canReturn) returnToWaiting(); else void runtime.checkResult() }
    else if (!busy && current.playable) void runtime.setReady(!current.own?.ready)
  }
  const manual = GAME_MANUAL[model.gameCode as keyof typeof GAME_MANUAL]
  return <aside className="gathering-hud" role="region" aria-label="테이블 함께 보기" data-phase={model.finished ? 'finished' : 'waiting'} data-camera-mode={looking ? 'seated' : 'gathering'}>
    <header className="gathering-caption"><span>{anchor ? `TABLE ${anchor.replace('table-', '').padStart(2, '0')} · ` : ''}{model.gameName}</span><h2>{model.title}</h2><p role="status">{model.headline}</p></header>
    <div className="gathering-accessible-roster" aria-label="참가자 상태">{model.rows.map(row => <p key={row.seat}>{row.nickname} · {row.label}{row.score ? ` · ${row.score}` : ''}</p>)}</div>
    <div className="gathering-actions">
      <p className="gathering-social-hint">관전자와 함께 한 판 <span>Enter · 훈수와 응원</span></p>
      {model.finished && <p className="settlement-note"><BoardRewardCoinSource>{model.settlement}</BoardRewardCoinSource></p>}
      {model.finished && <FinishedForfeitStatus />}
      <div className="button-row">
        <button className="primary" disabled={disabled || (!model.finished && (busy || !model.playable))} onClick={primary}>
          {model.finished ? model.canReturn ? '다음 판 준비' : '정산 결과 확인' : model.own?.ready ? '준비 취소' : '준비'}</button>
        <button onClick={() => useTableLobby.setState({ gatheringDetails: model.scope })}>{model.finished ? '결과 자세히' : '게임 설정'}</button>
        {manual && <button onClick={() => openManual(manual)}>게임 설명</button>}
        <button onClick={() => {
          if (looking) resetSeatedLook()
          else useTableLobby.setState({ lookScope: seatScope(useSession.getState()) })
        }}>{looking ? '테이블 함께 보기' : '주변 둘러보기'}</button>
        <button disabled={disabled || busy} onClick={() => void runtime.leaveTable()}>자리에서 일어나기</button>
      </div>
      {error && <p className="gathering-error" role="alert">{error}</p>}
    </div>
  </aside>
}
