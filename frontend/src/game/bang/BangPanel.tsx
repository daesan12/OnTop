import { useEffect, useState } from 'react'
import { useGame } from '../store'
import { useSession, estimatedServerTime } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { BangView } from './BangView'
import { openManual } from '../../features/manual/manualState'
import { OmokSurrender } from '../OmokSurrender'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { returnToWaiting, useGathering } from '../../features/tableLobby/gathering'
import { useOmokEvents } from '../omok/spectatorEvents'
import { clearRoamingInput, setChatInputOpen } from '../../world/inputOwnership'
import { forfeitBlocksInput } from '../forfeit'
import { useBangPings } from './social'

export function BangPanel() {
  const state = useGame(), game = state.game?.bang ? state.game : null
  const ownId = useSession(s => s.sessionId), profiles = useSession(s => s.profiles), connected = useSession(s => s.status === 'connected')
  const runtime = useParkRuntime(), chats = useOmokEvents(s => s.history), pings = useBangPings(s => s.pings)
  const chatError = useOmokEvents(s => s.error), chatSending = useOmokEvents(s => s.sending)
  const gathering = useGathering()
  const [text, setText] = useState(''), [notice, setNotice] = useState(''), [now, setNow] = useState(estimatedServerTime)
  useEffect(() => { clearRoamingInput(); if (document.pointerLockElement) document.exitPointerLock(); const timer = setInterval(() => setNow(estimatedServerTime()), 250); return () => clearInterval(timer) }, [])
  useEffect(() => () => setChatInputOpen(false), [])
  if (!game) return null
  const names = Object.fromEntries(game.bang.players.map((player, i) => [player.userId, player.userId === ownId ? '나' : profiles[player.userId]?.nickname ?? `참가자 ${i + 1}`]))
  const blocked = state.pending || state.uncertain || game.version < state.awaitingVersion || forfeitBlocksInput(game.gameId)
    || game.role === 'PLAYER' && state.recovery !== 'RESTORED'
  const result = state.result?.gameSessionId === game.gameId ? state.result : null
  return <BangView state={game.bang} hand={game.bangHand} ownId={ownId} scope={`${game.gameId}/${game.version}`} now={now}
    names={names} busy={blocked} connected={connected} error={state.error || notice || chatError}
    onAction={action => { setNotice(''); void runtime.actBang?.(action).catch(() => {}) }}
    onPing={game.role === 'SPECTATOR' && game.bang.status === 'PLAYING' ? userId => { void runtime.pingBang?.(userId).catch(error => setNotice(error instanceof Error ? error.message : '위치 표시를 보내지 못했어요.')) } : undefined}
    pingedUserIds={pings.filter(ping => ping.gameId === game.gameId && ping.until > now && ping.version === game.version).map(ping => ping.targetUserId)}
    menu={<><button onClick={() => openManual('bang')}>설명서</button>{game.role === 'PLAYER' ? <OmokSurrender context={{ userId: ownId, gameId: game.gameId, version: game.version }} disabled={blocked || !game.bang.players.some(player => player.userId === ownId && player.active)} /> : <button onClick={() => void runtime.unwatchGame()}>관전 종료</button>}</>}
    settlement={game.bang.status === 'FINISHED' ? <p>{result ? resultSettlement(result) : game.role === 'SPECTATOR' ? '공개 경기 결과입니다.' : '정산 결과를 확인하고 있어요.'}<button disabled={!connected} onClick={() => void (game.role === 'SPECTATOR' ? runtime.unwatchGame() : runtime.checkResult())}>{game.role === 'SPECTATOR' ? '관전 종료' : '정산 확인'}</button>{gathering?.canReturn && <button disabled={blocked || !connected} onClick={() => returnToWaiting()}>테이블로 돌아가기</button>}</p>
      : state.uncertain || !connected ? <button onClick={() => void runtime.checkRecovery()}>경기 상태 확인</button> : null}
    chat={<div className="bang-chat"><h2>경기 채팅</h2><div aria-live="polite">{chats.filter(chat => chat.gameId === game.gameId).map(chat => <p key={chat.eventId}><b>{profiles[chat.senderUserId]?.nickname ?? '참가자'}</b> {chat.text}</p>)}</div>
      <form onSubmit={event => { event.preventDefault(); const content = text.trim(); if (!content || chatSending) return; void runtime.sendSpectatorChat(content).then(ok => { if (ok) setText(''); else setNotice(useOmokEvents.getState().error || '채팅 전송 결과를 확인해주세요.') }).catch(() => setNotice('채팅 전송 결과를 확인해주세요.')) }}>
        <label><span className="bang-sr-only">경기 채팅 메시지</span><input value={text} onChange={event => setText(event.target.value)} maxLength={200} onFocus={() => setChatInputOpen(true)} onBlur={() => setChatInputOpen(false)} placeholder="메시지를 입력하세요" /></label><button disabled={!connected || chatSending || !text.trim()}>전송</button></form></div>} />
}
