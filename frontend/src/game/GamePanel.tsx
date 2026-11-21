import {NpcResultPanel,useNpcResult} from '../features/ai/NpcResultPanel'
import { lazy, Suspense } from 'react'
import { StoneLoadingTips } from './stone-rumble/StoneLoadingTips'
const StoneRumblePanel = lazy(() => import('./stone-rumble/StoneRumblePanel').then(module => ({ default: module.StoneRumblePanel })))
const DavinciPanel = lazy(() => import('./davinci/DavinciPanel').then(module => ({ default: module.DavinciPanel })))
import { AlkkagiPanel } from './alkkagi/AlkkagiPanel'
import { useDisplayGame as useGame } from './displayGame'
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
  const npcResult=useNpcResult()
  const productGathering = useGathering(), localPractice=useGame(s=>s.localPractice)
  const gathering=localPractice?null:productGathering, details = useTableLobby(s => s.gatheringDetails)
  const spectatorResult = useGame(s => s.game?.role === 'SPECTATOR' && gameState(s.game).status === 'FINISHED' ? s.game : null)
  const stone = useGame(s => !!s.game?.stone || (s.start?.gameCode === 'STONE_RUMBLE' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const stonePlayers = useSession(s => s.tableStates[s.tableId]?.selectedPlayers ?? s.tableStates[s.tableId]?.capacity ?? 8)
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
  const davinci = useGame(s => !!s.game?.davinci)
  if (npcResult) return <NpcResultPanel practice={npcResult}/>
  if (terminalPlayer && !seated) return null
  if (davinci) return <Suspense fallback={<p role="status">다빈치 코드 게임판을 준비하고 있어요.</p>}><DavinciPanel /></Suspense>
  if (stone) return <Suspense fallback={<StoneLoadingTips ready={0} total={stonePlayers} ownReady={false} error="" retry={() => void runtime.checkRecovery()} />}><StoneRumblePanel /></Suspense>
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
