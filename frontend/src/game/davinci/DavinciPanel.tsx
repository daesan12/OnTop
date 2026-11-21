import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { OmokSurrender } from '../OmokSurrender'
import { forfeitBlocksInput } from '../forfeit'
import { returnToWaiting, useGathering } from '../../features/tableLobby/gathering'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { useOmokEvents } from '../omok/spectatorEvents'
import { filterChat } from '../../features/chat/filterChat'
import { DavinciScreen } from './DavinciScreen'
import { useDavinciPing } from './social'

/** 통신은 기존 공원 Runtime, 판정은 BE, 이 컴포넌트는 표시만 담당한다. */
export function DavinciPanel() {
  const game = useGame(s => s.game), pending = useGame(s => s.pending), error = useGame(s => s.error)
  const recovery = useGame(s => s.recovery), uncertain = useGame(s => s.uncertain), awaiting = useGame(s => s.awaitingVersion)
  const own = useSession(s => s.sessionId), connected = useSession(s => s.status === 'connected')
  const worldPending = useSession(s => s.pending)
  const profiles = useSession(s => s.profiles), runtime = useParkRuntime(), gathering = useGathering()
  const result = useGame(s => (s.result ?? s.lastResult)?.gameSessionId === game?.gameId ? s.result ?? s.lastResult : null)
  const history = useOmokEvents(s => s.history), canChat = useOmokEvents(s => s.canSend)
  const ping = useDavinciPing(s => s.ping), [now, setNow] = useState(Date.now)
  useEffect(() => {
    const previous = inputState.minigameOpen
    inputState.minigameOpen = true; clearRoamingInput()
    if (document.pointerLockElement) void document.exitPointerLock()
    return () => { inputState.minigameOpen = previous; clearRoamingInput() }
  }, [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer) }, [])
  if (!game?.davinci) return null
  const spectator = game.role === 'SPECTATOR'
  const names = Object.fromEntries(game.davinci.players.map((p, i) => [p.userId, profiles[p.userId]?.nickname ?? `참가자 ${i + 1}`]))
  const enabled = connected && !worldPending && !uncertain && recovery === 'RESTORED' && !forfeitBlocksInput(game.gameId) && game.version >= awaiting
  return createPortal(<DavinciScreen tabletop gameId={game.gameId} state={game.davinci} hand={game.davinciHand} viewerId={spectator ? '' : own} names={names}
    enabled={enabled} busy={pending || worldPending} error={!connected ? '연결이 끊겼어요. 다시 연결한 뒤 경기 상태를 확인해주세요.' : error}
    act={input => { void runtime.actDavinci?.(input) }} recover={() => { if (!connected) runtime.reconnect(); else void runtime.checkRecovery() }}
    topActions={spectator ? <button onClick={() => void runtime.unwatchGame()}>관전 종료</button>
      : <OmokSurrender key={game.gameId} context={{ userId: own, gameId: game.gameId, version: game.version }} disabled={!enabled || pending} />}
    resultActions={spectator ? <button onClick={() => void runtime.unwatchGame()}>관전 종료</button> : <>
      <button onClick={() => void runtime.checkResult()}>정산 결과 확인</button><button className="davinci-primary" disabled={!gathering?.canReturn || pending} onClick={returnToWaiting}>대기실로 돌아가기</button></>}
    rewardStatus={spectator ? undefined : result ? resultSettlement(result) : '서버의 결과·정산을 확인하고 있어요.'}
    chat={{ messages: history.filter(m => m.gameId === game.gameId).map(m => ({ id: m.eventId, userId: m.senderUserId, text: m.text })),
      canSend: connected && canChat, send: text => runtime.sendSpectatorChat(filterChat(text)) }}
    ping={{ tileId: ping?.gameId === game.gameId && ping.basedOnVersion === game.version && ping.until > now ? ping.tileId : null,
      canSend: connected && spectator && game.davinci.status === 'PLAYING' && game.davinci.stage !== 'SETUP',
      send: (userId, tileId) => runtime.pingDavinci?.(userId, tileId) ?? Promise.resolve(false) }}
  />, document.body)
}
