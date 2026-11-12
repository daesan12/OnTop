import { useCallback, useEffect, useState } from 'react'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { useGathering, returnToWaiting } from '../../features/tableLobby/gathering'
import { StoneRumbleGame } from './StoneRumbleGame'
import type { StoneControl } from './protocol'
import { useOmokEvents } from '../omok/spectatorEvents'
import { filterChat } from '../../features/chat/filterChat'
import { StoneRecoveryNotice } from './StoneRecoveryNotice'

/** 공원 통합은 기존 인증 소켓·복구·기권·정산 경로를 사용한다. */
export function StoneRumblePanel() {
  const game = useGame(s => s.game), recovery = useGame(s => s.recovery)
  const connected = useSession(s => s.status === 'connected'), ownId = useSession(s => s.sessionId)
  const runtime = useParkRuntime(), gathering = useGathering(), profiles = useSession(s => s.profiles)
  const [sceneReady, setSceneReady] = useState(false)
  const reportScene = useCallback((ready: boolean) => setSceneReady(ready), [])
  const history = useOmokEvents(s => s.history), canChat = useOmokEvents(s => s.canSend)
  const send = useCallback((input: StoneControl, clearQueuedActions?: boolean) => { void runtime.actStoneRumble?.(input, clearQueuedActions) }, [runtime])
  const acknowledged = game?.stone?.readyUserIds?.includes(ownId) ?? false
  useEffect(() => {
    if (!game?.stone || game.role !== 'PLAYER' || game.stone.phase !== 'LOADING' || !connected
      || recovery !== 'RESTORED' || acknowledged === sceneReady) return
    let pending = false, live = true
    const report = async () => {
      if (pending || !live) return
      pending = true
      try { await runtime.actStoneRumble?.({ kind: 'scene_ready', ready: sceneReady }) }
      finally { pending = false }
    }
    void report()
    const timer = setInterval(() => void report(), 750)
    return () => { live = false; clearInterval(timer) }
  }, [game?.gameId, game?.role, game?.stone?.phase, connected, recovery, acknowledged, sceneReady, runtime])
  const exit = useCallback(() => {
    if (game?.role === 'SPECTATOR') void runtime.unwatchGame()
    else if (game?.stone?.status === 'PLAYING') void runtime.forfeitGame(game.gameId)
    else returnToWaiting()
  }, [game, runtime])
  useEffect(() => {
    const previous = inputState.minigameOpen
    inputState.minigameOpen = true
    clearRoamingInput()
    return () => { inputState.minigameOpen = previous; clearRoamingInput() }
  }, [])
  if (!game?.stone) return <section className="stone-rumble-connection" aria-label="돌탑 경기 상태"><p role="status">돌탑 경기 상태를 확인하고 있어요.</p><button onClick={() => void runtime.checkRecovery()}>경기 상태 다시 확인</button></section>
  return <StoneRumbleGame state={game.stone} ownId={ownId} connected={connected} inputReady={recovery === 'RESTORED'}
    name={id => profiles[id]?.nickname ?? (id === ownId ? '나' : `참가자 ${game.stone!.players.findIndex(p => p.userId === id) + 1}`)}
    topActions={game.role === 'SPECTATOR' ? <button onClick={() => void runtime.unwatchGame()}>관전 종료</button> : undefined}
    send={send} onSceneStatus={reportScene} leave={() => void runtime.forfeitGame(game.gameId)} exit={exit}
    chat={{ messages: history.filter(message => message.gameId === game.gameId).map(message => ({ id: message.eventId, userId: message.senderUserId, text: message.text })), canSend: connected && canChat, send: text => runtime.sendSpectatorChat(filterChat(text)) }}>
    <StoneRecoveryNotice />
    <button className="paper-primary" onClick={() => void runtime.checkResult()}>정산 결과 확인</button>
    <button disabled={!gathering?.canReturn} onClick={returnToWaiting}>테이블로 돌아가기</button>
  </StoneRumbleGame>
}
