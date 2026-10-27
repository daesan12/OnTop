import { useState } from 'react'
import { useSession } from '../../network/worldClient'
import { useGame, tableBusy } from '../../game/store'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import type { GatheringModel } from './gatheringModel'
import { returnToWaiting } from './gathering'
import { FinishedForfeitStatus } from '../../game/OmokSurrender'
import { PaperPopup, ResultTrophy } from './PaperPopup'
import { TABLET_ENABLED } from './tabletFeature'
import { LegacyTableGatheringHud } from './LegacyTableGatheringHud'

export function TableGatheringHud({ model }: { model: GatheringModel }) {
  return TABLET_ENABLED ? <TabletResult model={model} /> : <LegacyTableGatheringHud model={model} />
}
function TabletResult({ model }: { model: GatheringModel }) {
  const runtime = useParkRuntime(), pending = useSession(s => s.pending), connected = useSession(s => s.status === 'connected')
  const own = useSession(s => s.sessionId), error = useGame(s => s.error), busy = useGame(tableBusy), gamePending = useGame(s => s.pending)
  const [closed, setClosed] = useState('')
  const disabled = pending || gamePending || !connected
  const checkable = useGame(s => !!(s.permittedGameId || s.completedGameId) && !s.watchedGameId && s.game?.role !== 'SPECTATOR')
  const outcome = model.invalid ? '무효 경기' : model.rows.find(row => row.playerId === own)?.label ?? '경기 종료'
  if (closed === model.scope) return <button className="paper-reopen" onClick={() => setClosed('')}>경기 결과 다시 보기</button>
  return <PaperPopup title={`${model.gameName} · ${model.rows.filter(row => row.playerId).length}인 경기 종료`}
    label="경기 결과" onClose={() => setClosed(model.scope)} className="table-result-popover">
    {!model.invalid && <ResultTrophy />}<h2>{outcome}</h2><p className="paper-subtitle">{model.invalid ? '경기가 무효 처리되어 참가비 예약을 해제해요' : outcome === '승리' ? '멋진 한 판이었어요' : outcome === '무승부' ? '좋은 승부였어요' : '함께해서 즐거운 한 판이었어요'}</p>
    <ol className="paper-players" aria-label="참가자 결과">{model.rows.filter(row => row.playerId).map(row => <li key={row.playerId} data-winner={row.winner}>
      <span className="paper-person-icon" aria-hidden="true">{row.nickname.slice(0, 1)}</span>
      <span className="paper-player-name">{row.playerId === own ? '나' : row.nickname}</span><span>{row.score}</span>
      <span className="paper-player-outcome">{row.label}</span>
    </li>)}</ol>
    <div className="paper-settlement" role="status"><strong>{!model.settled && <i className="paper-pending" aria-hidden="true" />}{model.settled || model.invalid ? model.settlement : '보상 확인 중'}</strong>
      <small>{model.invalid ? model.settled ? '서버에서 참가비 예약 해제를 확인했어요' : '서버의 참가비 예약 해제를 기다리고 있어요' : model.settled ? '서버에서 정산한 결과예요' : '확인이 끝나면 엽전에 반영돼요'}</small></div>
    <div className="paper-actions"><button className="paper-primary" disabled={disabled || !model.canReturn} onClick={returnToWaiting}>다음 판 준비</button>
      <button disabled={disabled || busy} onClick={() => void runtime.leaveTable()}>자리에서 일어나기</button>
      {!model.canReturn && <small>{model.settled ? '서버가 다음 판 대기실을 여는 중이에요' : '정산을 확인한 뒤 다음 판을 준비할 수 있어요'}</small>}
      {!model.settled && <button className="paper-text-button" disabled={disabled || !checkable} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
    </div>
    <div className="paper-forfeit"><FinishedForfeitStatus /></div>
    {model.reason && <details><summary>경기 종료 사유</summary><p>{model.reason}</p></details>}
    {error && <p className="paper-error" role="alert">{error}</p>}
  </PaperPopup>
}
