import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { openManual } from '../../features/manual/manualState'
import { OmokSurrender } from '../OmokSurrender'
import { useOmokEvents } from '../omok/spectatorEvents'
import { clearRoamingInput, panelOwnsGameClicks, setChatInputOpen } from '../../world/inputOwnership'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { GOAL_LABELS, PLAYER_COLORS, QuoridorBoard, QuoridorPawn } from './QuoridorBoard'
import type { Orientation, Wall } from './protocol'
import './quoridor.css'

export function QuoridorPanel() {
  const runtime = useParkRuntime()
  const pings = useOmokEvents(s => s.pings)
  const state = useGame(useShallow(s => ({ game: s.game, pending: s.pending, uncertain: s.uncertain,
    recovery: s.recovery, awaitingVersion: s.awaitingVersion, permitted: s.permittedGameId, error: s.error, result: s.result })))
  const session = useSession(useShallow(s => ({ own: s.sessionId, connected: s.status === 'connected', pending: s.pending, profiles: s.profiles })))
  const [wallMode, setWallMode] = useState(false), [orientation, setOrientation] = useState<Orientation>('HORIZONTAL')
  const [selected, setSelected] = useState<Wall | null>(null)
  const game = state.game, board = game?.quoridor
  useEffect(() => { setSelected(null) }, [game?.gameId, game?.version, orientation, wallMode])
  useEffect(() => { clearRoamingInput() }, [game?.gameId])
  if (!game || !board) return null
  const player = game.role === 'PLAYER', me = board.players.find(p => p.userId === session.own)
  const mine = player && board.turnUserId === session.own
  const playing = board.status === 'PLAYING'
  const ready = session.connected && !session.pending && !state.pending && !state.uncertain && game.version >= state.awaitingVersion
  const canAct = ready && player && mine && !!me?.active && state.recovery === 'RESTORED' && state.permitted === game.gameId
  const name = (id: string) => session.profiles[id]?.nickname ?? `참가자 ${board.players.findIndex(p => p.userId === id) + 1}`
  const title = !playing ? `${board.winnerUserIds.map(name).join(' · ')} 승리` : mine ? '내 차례' : `${name(board.turnUserId!)} 차례`
  return <section className="quoridor-panel" aria-label="길목 한 수 경기" onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <header className="qr-header"><h2>길목 한 수</h2><p role="status">{board.players.length}인전 · {title}</p><div>
      <button type="button" onClick={() => openManual('quoridor')}>규칙</button>
      {player ? <OmokSurrender context={{ userId: session.own, gameId: game.gameId, version: game.version }} disabled={!ready || !me?.active} />
        : <button type="button" disabled={!session.connected || session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
    </div></header>
    <div className="qr-players">{board.players.map((p, index) => <div key={p.userId} className="qr-player" data-turn={p.userId === board.turnUserId} data-active={p.active}>
      <QuoridorPawn color={PLAYER_COLORS[index]} /><span><strong>{name(p.userId)}{p.userId === session.own ? ' (나)' : ''}</strong>
        <small>{p.active ? GOAL_LABELS[p.goal] : '기권'} · 장벽 {p.wallsRemaining}개</small></span>
    </div>)}</div>
    <div className="qr-layout"><QuoridorBoard state={board} ownId={session.own} canAct={canAct} wallMode={wallMode} orientation={orientation}
      selected={selected} onSelect={wall => { if (!panelOwnsGameClicks()) setSelected(wall) }}
      onMove={cell => { if (!panelOwnsGameClicks()) void runtime.actQuoridor?.({ kind: 'move', ...cell }) }}
      spectator={!player && playing && ready} onPing={cell => { if (!panelOwnsGameClicks()) void runtime.pingOmok(cell.x, cell.y) }}
      pings={pings.filter(p => p.gameId === game.gameId).map(p => ({ x: p.x, y: p.y }))} />
      <aside className="qr-actions"><h3>{title}</h3><p>{!playing ? board.endReason === 'GOAL_REACHED' ? '맞은편 끝줄에 도착했습니다.' : '마지막까지 남은 참가자가 승리했습니다.'
        : !player ? '칸을 누르면 참가자에게 위치를 추천합니다.' : !me?.active ? '기권했습니다. 남은 경기를 지켜볼 수 있습니다.' : '말을 옮기거나 장벽을 놓으세요.'}</p>
        {player && playing && me?.active ? <><div className="qr-modes"><button type="button" aria-pressed={!wallMode} onClick={() => setWallMode(false)}>말 이동</button>
          <button type="button" aria-pressed={wallMode} onClick={() => setWallMode(true)} disabled={me.wallsRemaining === 0}>장벽 설치</button></div>
          {wallMode ? <><div className="qr-directions">{(['HORIZONTAL', 'VERTICAL'] as const).map(value => <button type="button" key={value}
            aria-pressed={orientation === value} onClick={() => setOrientation(value)}>{value === 'HORIZONTAL' ? '가로 ━' : '세로 ┃'}</button>)}</div>
            <p className="qr-hint">밝은 홈을 선택한 뒤 확정하세요. 막힌 경로에는 장벽을 놓을 수 없습니다.</p>
            <button type="button" className="qr-primary" disabled={!canAct || !selected} onClick={() => { if (selected && !panelOwnsGameClicks()) void runtime.actQuoridor?.({ kind: 'wall', ...selected }) }}>장벽 놓기</button></>
            : <p className="qr-hint">이동 가능한 칸의 금색 점을 누르세요. 한 번의 이동으로 차례가 끝납니다.</p>}</> : null}
        <p className="qr-goal">{me ? `${GOAL_LABELS[me.goal]}에 먼저 도착하세요.` : '모든 참가자의 탈출 경로는 남겨야 합니다.'}</p>
        {state.pending ? <p role="status">서버 판정 확인 중…</p> : null}
        {state.error ? <p role="alert">{state.error}</p> : null}
        {!session.connected ? <p role="alert">연결이 끊겼습니다. 재접속 후 경기 상태를 확인하세요.</p> : null}
        {state.uncertain || player && state.recovery !== 'RESTORED' ? <button type="button" disabled={!session.connected || session.pending} onClick={() => void runtime.checkRecovery()}>경기 상태 다시 확인</button> : null}
        {player && !playing ? <><p>{state.result ? resultSettlement(state.result) : '결과·정산 확인 중'}</p>
          <button type="button" onClick={() => void runtime.checkResult()}>정산 결과 확인</button></> : null}
        <QuoridorChat gameId={game.gameId} names={session.profiles} send={text => runtime.sendSpectatorChat(text)} playing={playing} />
      </aside></div>
  </section>
}

function QuoridorChat({ gameId, names, send, playing }: { gameId: string; names: Record<string, { nickname?: string }>; send(text: string): Promise<boolean>; playing: boolean }) {
  const events = useOmokEvents(useShallow(s => ({ history: s.history, canSend: s.canSend, sending: s.sending, error: s.error, pingError: s.pingError })))
  const [draft, setDraft] = useState('')
  useEffect(() => () => setChatInputOpen(false), [])
  return <div className="qr-chat"><h4>경기 채팅</h4><div className="qr-chat-log" role="log">{events.history.filter(message => message.gameId === gameId).slice(-8).map(message =>
    <p key={message.eventId}><b>{names[message.senderUserId]?.nickname ?? '관전자'}</b> {message.text}</p>)}</div>
    <form onSubmit={event => { event.preventDefault(); if (draft.trim()) void send(draft).then(sent => { if (sent) setDraft('') }) }}>
      <input aria-label="길목 한 수 경기 채팅" value={draft} maxLength={200} disabled={!playing} onFocus={() => setChatInputOpen(true)} onBlur={() => setChatInputOpen(false)} onChange={event => setDraft(event.target.value)} placeholder="경기 채팅을 입력하세요" />
      <button type="submit" disabled={!playing || !events.canSend || events.sending || !draft.trim()}>전송</button></form>
    {events.error || events.pingError ? <p role="status">{events.error || events.pingError}</p> : null}
  </div>
}
