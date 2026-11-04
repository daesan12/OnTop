import { AlkkagiPanel } from './alkkagi/AlkkagiPanel'
import { useGame } from './store'
import { OmokPanel } from './OmokPanel'
import { FarklePanel } from './farkle/FarklePanel'
import { OneCardPanel } from './onecard/OneCardPanel'
import { BridgePanel } from './bridge/BridgePanel'
import { LedgerPanel } from './ledger/LedgerPanel'
import { HalliGalliPanel } from './halligalli/HalliGalliPanel'
import { useGathering } from '../features/tableLobby/gathering'
import { useTableLobby } from '../features/tableLobby/state'
import './prototypeTable.css'
import './gameHudUsability.css'
import './gameHudLayout.css'
import { useParkRuntime } from '../park/runtime/ParkRuntime'
import { useSession } from '../network/worldClient'
import { gameState } from './protocol'
import { FinishedForfeitStatus } from './OmokSurrender'
import { BoardRewardCoinSource } from '../features/wallet/RewardCoinFlight'

export function GamePanel() {
  const runtime = useParkRuntime(), pending = useSession(s => s.pending), connected = useSession(s => s.status === 'connected')
  const gathering = useGathering(), details = useTableLobby(s => s.gatheringDetails)
  const spectatorResult = useGame(s => s.game?.role === 'SPECTATOR' && gameState(s.game).status === 'FINISHED' ? s.game : null)
  const alkkagi = useGame(s => !!s.game?.alkkagi)
  const profiles = useSession(s => s.profiles)
  const seated = useSession(s => !!s.tableId && s.seatIndex >= 0
    && !!s.tableStates[s.tableId]?.seats.some(seat => seat.userId === s.sessionId))
  const terminalPlayer = useGame(s => s.game?.role === 'PLAYER'
    && (gameState(s.game).status === 'FINISHED' || !!s.result || !!s.lastResult))
  const dice = useGame(s => !!s.game?.dice || (s.start?.gameCode === 'DICE' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const card = useGame(s => !!s.game?.onecard || (s.start?.gameCode === 'ONE_CARD' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const bridge = useGame(s => !!s.game?.bridge || (s.start?.gameCode === 'LIAR_BRIDGE' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const ledger = useGame(s => !!s.game?.ledger || (s.start?.gameCode === 'DICE_LEDGER' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const halli = useGame(s => !!s.game?.halli || (s.start?.gameCode === 'HALLI_GALLI' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  if (terminalPlayer && !seated) return null
  if (alkkagi) return <AlkkagiPanel />
  if (spectatorResult) {
    if (spectatorResult.dice) return <FarklePanel />
    if (spectatorResult.ledger) return <LedgerPanel />
    if (spectatorResult.halli) return <HalliGalliPanel />
    const winners = spectatorResult.onecard?.winnerUserIds ?? spectatorResult.bridge?.winnerUserIds
      ?? [spectatorResult.omok?.winnerUserId].filter((id): id is string => !!id)
    const label = spectatorResult.bridge ? '다리 경기' : spectatorResult.onecard ? '원카드 경기' : '오목 경기'
    return <section className="park-runtime-panel prototype-result-detail" role="region" aria-label={label}>
      <h2>관전 경기 결과</h2><p role="status">{winners.length ? `${winners.map(id => profiles[id]?.nickname ?? '참가자').join(' · ')} ${winners.length > 1 ? '공동 승리' : '승리'}` : '무승부 · 경기 종료'}</p>
      <p>공개 결과입니다. 관전자에게 개인 손패와 정산 정보는 제공하지 않습니다.</p>
      <button disabled={pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>
    </section>
  }
  if (gathering?.finished && details !== gathering.scope) return null
  if (gathering?.finished) return <section className="park-runtime-panel prototype-result-detail" role="region" aria-label="경기 결과 상세">
    <button onClick={() => useTableLobby.setState({ gatheringDetails: '' })}>테이블 함께 보기</button>
    <h2>{gathering.gameName} · 경기 결과</h2><p role="status">{gathering.headline}</p>
    <ol>{gathering.rows.map(row => <li key={row.seat}>{row.nickname} · {row.label}{row.score && ` · ${row.score}`}</li>)}</ol>
    <p><BoardRewardCoinSource>{gathering.settlement}</BoardRewardCoinSource></p><p>좌석은 유지됩니다. 서버가 대기실을 연 뒤 다시 준비하면 새 판을 시작합니다.</p>
    <FinishedForfeitStatus />
    <button disabled={pending || !connected} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>
  </section>
  return halli ? <HalliGalliPanel /> : ledger ? <LedgerPanel /> : bridge ? <BridgePanel /> : card ? <OneCardPanel /> : dice ? <FarklePanel /> : <OmokPanel />
}
