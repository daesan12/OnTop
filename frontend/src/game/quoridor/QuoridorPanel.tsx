import { useLayoutEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { openManual } from '../../features/manual/manualState'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import type { ParkRuntimePort } from '../../park/runtime/contracts'
import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { useTableLobby } from '../../features/tableLobby/state'
import { panelOwnsGameClicks } from '../../world/inputOwnership'
import { GameHudMenu } from '../GameHud'
import { OmokSurrender } from '../OmokSurrender'
import { useOmokEvents } from '../omok/spectatorEvents'
import { useQuoridorControls, useQuoridorUI } from './controls'
import { coordinate, GOAL_LABELS, PLAYER_COLORS, sameWall } from './presentation'
import { quoridorViewport } from './camera'
import './quoridor.css'

type Runtime = Pick<ParkRuntimePort, 'actQuoridor' | 'unwatchGame' | 'checkRecovery'>
export function QuoridorPanel() { return <QuoridorHud runtime={useParkRuntime()} /> }

/** 투명한 HUD만 겹친다. 판·말·장벽·훈수 표시는 공원의 동일한 WebGL Canvas에서 그린다. */
export function QuoridorHud({ runtime }: { runtime: Runtime }) {
  const c = useQuoridorControls()
  const root = useRef<HTMLElement>(null), toolbar = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!c.game || !root.current || !toolbar.current) return
    const page = root.current.closest<HTMLElement>('.park-page')
    let frame = 0
    const update = () => {
      if (!root.current || !toolbar.current) return
      const h = window.innerHeight, lowWide = window.innerWidth >= 700 && h <= 560, bar = toolbar.current.getBoundingClientRect()
      const top = lowWide ? root.current.querySelector('.qr-roster')!.getBoundingClientRect().bottom + 12
        : Math.max(...Array.from(root.current.querySelectorAll('.qr-status,.qr-roster')).map(node => node.getBoundingClientRect().bottom)) + 12
      const statusBottom = root.current.querySelector('.qr-status')!.getBoundingClientRect().bottom
      const chat = page?.querySelector('.park-chat')?.getBoundingClientRect()
      const chatBottom = chat && chat.height > 0 ? h - chat.top + 12 : 0
      const bottom = Math.max(h - bar.top + 12, chatBottom)
      Object.assign(quoridorViewport, { gameId: c.game!.gameId, top, bottom: lowWide ? 32 : bottom,
        left: lowWide ? 252 : 16, right: lowWide ? 212 : 16 })
      page?.style.setProperty('--qr-toolbar-height', `${Math.ceil(bar.height)}px`)
      page?.style.setProperty('--qr-chat-height', `${Math.ceil(chat?.height ?? 0)}px`)
      const headerBottom = `${Math.max(116,Math.ceil(statusBottom+12))}px`
      if (page && page.style.getPropertyValue('--qr-header-bottom') !== headerBottom) {
        page.style.setProperty('--qr-header-bottom', headerBottom)
        cancelAnimationFrame(frame); frame = requestAnimationFrame(update)
      }
    }
    const observer = new ResizeObserver(update)
    for (const node of root.current.querySelectorAll('.qr-status,.qr-roster,.qr-toolbar')) observer.observe(node)
    const chat = page?.querySelector('.park-chat'); if (chat) observer.observe(chat)
    update(); window.addEventListener('resize', update)
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', update)
      page?.style.removeProperty('--qr-toolbar-height')
      page?.style.removeProperty('--qr-chat-height')
      page?.style.removeProperty('--qr-header-bottom')
      if (quoridorViewport.gameId === c.game?.gameId) quoridorViewport.gameId = '' }
  }, [c.game?.gameId])
  const board = c.board, game = c.game
  if (!board || !game) return null
  const name = (id: string) => c.session.profiles[id]?.nickname ?? `참가자 ${board.players.findIndex(p => p.userId === id) + 1}`
  const title = !c.playing ? `${board.winnerUserIds.map(name).join(' · ')} 승리`
    : c.player && board.turnUserId === c.session.sessionId ? '내 차례' : `${name(board.turnUserId!)} 차례`
  const selected = c.ui.selected && c.ui.version === game.version && board.legalWalls.some(wall => sameWall(wall, c.ui.selected!)) ? c.ui.selected : null
  const hint = !c.playing ? board.endReason === 'GOAL_REACHED' ? '맞은편 끝줄에 도착했습니다.' : '마지막까지 남은 참가자가 승리했습니다.'
    : !c.focused ? '게임 메뉴에서 판으로 돌아갈 수 있어요.' : !c.player ? '칸을 눌러 위치를 추천하세요 · 1초에 한 번'
    : !c.me?.active ? '기권했습니다. 남은 경기를 지켜볼 수 있어요.' : !c.canAct ? '상대가 생각 중이에요.'
    : c.ui.wallMode ? selected ? `${coordinate(selected)} ${selected.orientation === 'HORIZONTAL' ? '가로' : '세로'} 장벽을 놓을까요?` : '밝은 홈을 선택한 뒤 장벽을 놓으세요.'
    : '금색 표시가 있는 칸을 눌러 말을 옮기세요.'
  return <section ref={root} className="quoridor-hud" aria-label="길목 한 수 경기" data-spectator={!c.player}>
    <div className="game-hud-clock qr-status" role="status" data-my-turn={c.canAct}>
      <span className="game-hud-eyebrow">길목 한 수 · {board.players.length}인전{!c.player ? ' · 관전 중' : ''}</span>
      <strong>{title}</strong><small>{c.me?.active ? `${GOAL_LABELS[c.me.goal]}이 목표예요 · 장벽 ${c.me.wallsRemaining}개` : '한 차례에 이동 또는 장벽 하나'}</small>
    </div>
    <header className="qr-roster" aria-label="참가자 상태" style={{ gridTemplateColumns: `repeat(${board.players.length},minmax(0,1fr))` }}>
      {board.players.map((player, index) => <div key={player.userId} data-turn={player.userId === board.turnUserId} data-active={player.active}>
        <i style={{ background: PLAYER_COLORS[index] }} aria-hidden="true" /><span><b>{name(player.userId)}</b><small>{player.active ? `장벽 ${player.wallsRemaining}개` : '기권'}</small></span>
      </div>)}
    </header>
    <GameHudMenu>
      <button onClick={() => openManual('quoridor')}>게임 설명 · F1</button>
      {c.player ? <><SeatedLookButton /><OmokSurrender key={game.gameId} context={{ userId: c.session.sessionId, gameId: game.gameId, version: game.version }} disabled={!c.ready || !c.me?.active} /></>
        : <><div role="group" aria-label="관전 시점"><button aria-pressed={c.focused} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>판 보기</button>
          <button aria-pressed={!c.focused} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>주변 보기</button></div>
          <button disabled={!c.session.connected || c.session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button></>}
      {c.state.uncertain || c.player && c.state.recovery !== 'RESTORED' ? <button disabled={!c.session.connected || c.session.pending} onClick={() => void runtime.checkRecovery()}>경기 상태 다시 확인</button> : null}
    </GameHudMenu>
    <footer ref={toolbar} className="qr-toolbar" aria-label="길목 한 수 조작" onKeyDown={event => event.stopPropagation()}>
      {c.player && c.playing && c.me?.active && c.focused ? <div className="qr-tools">
        <div role="group" aria-label="행동 선택"><button aria-pressed={!c.ui.wallMode} onClick={() => useQuoridorUI.setState({ wallMode: false, selected: null, hover: null })}>말 이동</button>
          <button aria-pressed={c.ui.wallMode} disabled={c.me.wallsRemaining === 0} onClick={() => useQuoridorUI.setState({ wallMode: true })}>장벽 설치</button></div>
        {c.ui.wallMode ? <><div role="group" aria-label="장벽 방향">{(['HORIZONTAL', 'VERTICAL'] as const).map(value => <button key={value} aria-pressed={c.ui.orientation === value}
          onClick={() => useQuoridorUI.setState({ orientation: value, selected: null, hover: null })}>{value === 'HORIZONTAL' ? '가로' : '세로'}</button>)}</div>
          <button className="qr-confirm" disabled={!c.canAct || !selected} onClick={() => { if (selected && !panelOwnsGameClicks()) void runtime.actQuoridor?.({ kind: 'wall', ...selected }) }}>장벽 놓기</button></> : null}
      </div> : null}
      <p>{c.state.pending ? '서버 판정 확인 중…' : hint}</p>
      {c.state.error ? <p role="alert">{c.state.error}</p> : null}
      {!c.session.connected ? <p role="alert">연결이 끊겼습니다. 재접속 후 경기 상태를 확인하세요.</p> : null}
      <KeyboardActions runtime={runtime} />
    </footer>
    <Recommendations gameId={game.gameId} playing={!!c.playing} />
  </section>
}
function Recommendations({ gameId, playing }: { gameId: string; playing: boolean }) {
  const events = useOmokEvents(useShallow(s => ({ pings: s.pings, sending: s.pingSending, notice: s.pingNotice, error: s.pingError })))
  const profiles = useQuoridorControls().session.profiles
  const pings = playing ? events.pings.filter(ping => ping.gameId === gameId) : []
  if (!pings.length && !events.sending && !events.notice && !events.error) return null
  return <div className="qr-recommendations" role="status" aria-label="관전자 훈수">{pings.map(ping => <p key={ping.eventId}>
    {ping.displayName ?? profiles[ping.senderUserId]?.nickname ?? '관전자'} · {coordinate(ping)} 추천
  </p>)}{events.error || events.sending || events.notice ? <p>{events.error || (events.sending ? '추천 전송 중…' : events.notice)}</p> : null}</div>
}
function KeyboardActions({ runtime }: { runtime: Runtime }) {
  const c = useQuoridorControls()
  if (!c.board || !c.canAct) return null
  return <div className="qr-keyboard-actions" aria-label="키보드로 칸과 장벽 선택">
    {!c.ui.wallMode ? c.board.legalMoves.map(cell => <button key={`${cell.x}:${cell.y}`} onClick={() => { if (!panelOwnsGameClicks()) void runtime.actQuoridor?.({ kind: 'move', ...cell }) }}>{coordinate(cell)} 이동</button>)
      : c.board.legalWalls.filter(wall => wall.orientation === c.ui.orientation).map(wall => <button key={`${wall.x}:${wall.y}`} onClick={() => { if (!panelOwnsGameClicks()) useQuoridorUI.setState({ selected: wall }) }}>{coordinate(wall)} {wall.orientation === 'HORIZONTAL' ? '가로' : '세로'} 장벽 선택</button>)}
  </div>
}
