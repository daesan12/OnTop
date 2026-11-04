import { GameSpectatorCount } from './GameSpectatorCount'
import { OmokCoinToss } from './omok/OmokCoinToss'
import { OmokTurnClock } from './omok/OmokTurnClock'
import { openManual } from '../features/manual/manualState'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGame, tableBusy, recoveryBlocked } from './store'
import { useSession, estimatedServerTime } from '../network/worldClient'
import { OmokUndoControls } from './omok/OmokUndoControls'
import { OmokDrawControls } from './omok/OmokDrawControls'
import { useParkRuntime } from '../park/runtime/ParkRuntime'
import { GAME_CONSTRUCTION_NOTICE, isTableGamePlayable, TABLE_GAMES, TARGET_SCORES, lobbyStatus } from '../features/tableLobby/model'
import { useTableLobby } from '../features/tableLobby/state'
import { lastMoveText, omokOutcome } from './omokPresentation'
import { OmokSurrender } from './OmokSurrender'
import { omokSpectatorViewport } from './cameraState'
import { useOmokEvents } from './omok/spectatorEvents'
import './game.css'
import { useReadyBalance, canAffordBet, BetBalanceNotice, startFailureNotice } from '../features/tableLobby/readyBalance'

export function GameControls({ tableId }: { tableId: string }) {
  const runtime = useParkRuntime(),
    own = useSession((s) => s.sessionId),
    seated = useSession((s) => s.tableId)
  const table = useSession((s) => s.tableStates[tableId]),
    pending = useSession((s) => s.pending)
  const start = useGame((s) => s.start),
    recovery = useGame((s) => s.recovery)
  const [target, setTarget] = useState(2000)
  const [betInput, setBetInput] = useState('')
  useEffect(() => { setBetInput(table?.betAmountPerPlayer == null ? '' : String(table.betAmountPerPlayer)) }, [tableId, table?.betAmountPerPlayer])
  const {balance,refresh:refreshBalance} = useReadyBalance(seated === tableId && !!table && !tableBusy(),tableId,start?.revision)
  if (seated !== tableId || !table) return null
  const busy = tableBusy(),
    mine = table.seats.find((s) => s.userId === own)
  const lobby = lobbyStatus(table, own, busy)
  const bet = Number(betInput), validBet = betInput.trim() !== '' && Number.isSafeInteger(bet) && bet >= 0
  return (
    <div className="omok-lobby">
      <strong>
        게임 ·{' '}
        {TABLE_GAMES.find(g => g.code === table.gameCode)?.name ?? table.gameCode ?? '선택 전'}
      </strong>
      <p>{lobby.host ? '선택 담당자 · 게임과 참가비를 설정할 수 있어요.' : '선택 담당자가 게임과 참가비를 설정합니다.'}</p>
      <p>확정 참가비: {table.betAmountPerPlayer == null ? '미설정' : `${table.betAmountPerPlayer.toLocaleString()} 코인 / 1인`}</p>
      <label>1인 참가비 <input aria-label="1인 참가비" type="number" min="0" step="1" value={betInput}
        disabled={pending || busy || !lobby.host} onChange={event => setBetInput(event.target.value)} /></label>
      <button disabled={pending || busy || !lobby.host || !validBet || !isTableGamePlayable(table.gameCode) || bet === table.betAmountPerPlayer}
        onClick={() => void runtime.selectGame(table.gameCode as typeof TABLE_GAMES[number]['code'], bet,
          table.gameCode === 'DICE' ? table.targetScore ?? target : undefined)}>참가비 적용</button>
      <div className="table-game-options" role="group" aria-label="게임 선택">
        {TABLE_GAMES.map(game => <button key={game.code}
          disabled={!game.playable || pending || busy || !lobby.host || !validBet || table.gameCode === game.code}
          aria-label={`${game.name} 선택`}
          aria-pressed={table.gameCode === game.code}
          onClick={() => void runtime.selectGame(game.code, bet, game.code === 'DICE' ? target : undefined)}>
          {game.name} {game.playable ? '선택' : '· 공사 중'}
        </button>)}
      </div>
      {table.gameCode === 'DICE' && <label>주사위 목표 점수 <select aria-label="주사위 목표 점수" value={table.targetScore ?? target}
        disabled={!isTableGamePlayable('DICE') || pending || busy || !lobby.host}
        onChange={event => { const score = Number(event.target.value); setTarget(score); if (table.gameCode === 'DICE' && validBet) void runtime.selectGame('DICE', bet, score) }}>
        {TARGET_SCORES.map(score => <option key={score} value={score}>{score}점</option>)}
      </select></label>}
      {table.gameCode && !isTableGamePlayable(table.gameCode) && <p role="status">{GAME_CONSTRUCTION_NOTICE}</p>}
      <p>{lobby.count}/{table.capacity}명 · 최소 {table.minimumPlayers}명</p>
      <BetBalanceNotice balance={balance} bet={table.betAmountPerPlayer} retry={refreshBalance}/>
      <button
        disabled={pending || (mine?.ready ? busy : !lobby.canReady || !canAffordBet(balance,table.betAmountPerPlayer))}
        onClick={() => void runtime.setReady(!mine?.ready)}
      >
        {mine?.ready ? '준비 취소' : '준비'}
      </button>
      <p>
        {start?.simulation
          ? '서버 연동 시연 상태입니다. 실제 경기는 시작하지 않습니다.'
          : start?.phase === 'STARTING'
            ? '서버가 참가·시작을 확인하고 있습니다.'
            : start?.phase === 'SETTLING'
              ? '경기가 끝나 정산 확인을 기다리고 있습니다.'
              : table.allReady
                ? '전원 준비 완료 · 서버 시작 상태 대기'
                : lobby.message}
      </p>
      {start?.code && <p role="alert">{startFailureNotice(start) || start.code}</p>}
      {start?.phase === 'STARTING' && (
        <button disabled={pending} onClick={() => void runtime.checkStart()}>
          시작 상태 다시 확인
        </button>
      )}
      {['PENDING', 'EXPIRED', 'UNAVAILABLE'].includes(recovery) && (
        <button disabled={pending} onClick={() => void runtime.checkRecovery()}>
          경기 복구 다시 확인
        </button>
      )}
    </div>
  )
}

function OmokPingStatus() {
  const sending = useOmokEvents(s => s.pingSending)
  const notice = useOmokEvents(s => s.pingNotice), error = useOmokEvents(s => s.pingError)
  if (!sending && !notice && !error) return null
  return <p className="omok-ping-status" role="status" aria-label="위치 추천 전송 상태">
    {error || (sending ? '추천 위치 전송 중…' : notice)}
  </p>
}

/** HUD presentation never grants a seat or authority to place a stone. */
export function OmokPanel() {
  const runtime = useParkRuntime(),
    s = useGame(),
    own = useSession((s) => s.sessionId)
  const connected = useSession((s) => s.status === 'connected'),
    pending = useSession((s) => s.pending)
  const spectatorView = useTableLobby(s => s.spectatorView)
  const profiles = useSession(s => s.profiles)
  const connectionNotice = useSession(s => s.error || (['joining','reconnecting'].includes(s.status) ? s.status : ''))
  const header = useRef<HTMLElement>(null), toolbar = useRef<HTMLDivElement>(null)
  const spectatorGameId = s.game?.omok ? s.game.gameId : ''
  const spectator = s.game?.role === 'SPECTATOR'
  useLayoutEffect(() => {
    if (!spectatorGameId || !header.current || !toolbar.current) return
    const root = document.querySelector<HTMLElement>('.park-page')!
    const chat = document.querySelector<HTMLElement>('.omok-spectator-chat')
    const notice = document.querySelector<HTMLElement>('.park-runtime-status')
    const measure = () => {
      if (!header.current || !toolbar.current) return
      const noticeTop = header.current!.getBoundingClientRect().bottom + 10
      root.style.setProperty('--omok-notice-top', Math.ceil(noticeTop)+'px')
      root.style.setProperty('--omok-chat-top', Math.ceil(noticeTop + (notice ? notice.getBoundingClientRect().height+8 : 0))+'px')
      root.style.setProperty('--omok-spectator-toolbar-height', `${toolbar.current!.getBoundingClientRect().height}px`)
      root.style.setProperty('--omok-side-header-height', `${header.current!.getBoundingClientRect().bottom + (notice?.getBoundingClientRect().height ?? 0)}px`)
      const chatRect = chat?.getBoundingClientRect()
      if (innerWidth >= 1120) {
        omokSpectatorViewport.gameId = spectatorGameId
        omokSpectatorViewport.insets = {
          top:16,bottom:16,
          left:Math.ceil(Math.max(header.current!.getBoundingClientRect().right,chatRect?.right??0,notice?.getBoundingClientRect().right??0)+14),
          right:Math.ceil(innerWidth-toolbar.current!.getBoundingClientRect().left+14),
        }
        return
      }
      const chatAtTop = window.matchMedia(spectator ? '(max-width:1280px)' : '(max-width:1000px)').matches
      const sideTools = !spectator && !chatAtTop ? toolbar.current!.querySelector('.omok-play-tools')?.getBoundingClientRect() : null
      const notes = sideTools ? toolbar.current!.querySelector('.omok-play-notes')?.getBoundingClientRect() : null
      omokSpectatorViewport.gameId = spectatorGameId
      omokSpectatorViewport.insets = {
        top: Math.ceil(Math.max(header.current!.getBoundingClientRect().bottom, notice?.getBoundingClientRect().bottom ?? 0, chatAtTop ? chatRect?.bottom ?? 0 : 0) + 14),
        bottom: Math.ceil(innerHeight - Math.min(notes?.top ?? toolbar.current!.getBoundingClientRect().top,
          !chatAtTop ? chatRect?.top ?? innerHeight : innerHeight) + 14),
        left: sideTools && chatRect ? Math.ceil(chatRect.right + 14) : 20,
        right: sideTools ? Math.ceil(innerWidth - sideTools.left + 14) : 20,
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const node of [header.current, toolbar.current, chat, notice]) if (node) observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect(); window.removeEventListener('resize', measure)
      if (omokSpectatorViewport.gameId === spectatorGameId) {
        omokSpectatorViewport.gameId = ''; root.style.removeProperty('--omok-spectator-toolbar-height'); root.style.removeProperty('--omok-chat-top'); root.style.removeProperty('--omok-notice-top');root.style.removeProperty('--omok-side-header-height')
      }
    }
  }, [spectatorGameId, spectator, connectionNotice])
  const [now, setNow] = useState(estimatedServerTime)
  useEffect(() => {
    if (!s.game?.omok?.turnDeadline) return
    setNow(estimatedServerTime())
    const timer = setInterval(() => setNow(estimatedServerTime()), 250)
    return () => clearInterval(timer)
  }, [s.game?.omok?.turnDeadline])
  const g = s.game?.omok ? s.game : null
  if (!g && !recoveryBlocked() && (!s.error || !s.permittedGameId)) return null
  const deadline = g?.omok?.turnDeadline,
    remainingMs = deadline ? Date.parse(deadline)-now : null,
    remaining = deadline
      ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
      : null
  const o = g?.omok,
    myTurn = g?.role === 'PLAYER' && o?.turnUserId === own
  if (!g || !o) return <section className="park-runtime-panel omok-panel" aria-label="오목 경기"><p role="status">경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>{s.error && <p role="alert">{s.error}</p>}<button disabled={pending || !connected} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button></section>
  const player = g.role === 'PLAYER', ownBlack = own === o.blackUserId
  const opponent = ownBlack ? o.whiteUserId : o.blackUserId
  const alerts = (<div className="focus-error">
      {remaining === 0 && <p role="status">착수 시간이 끝났습니다. 서버의 종료 판정을 기다리고 있습니다.</p>}
      {s.uncertain && <p>착수 반영 여부를 확인해야 합니다. 같은 수를 자동 재전송하지 않습니다.</p>}
      {g.version < s.awaitingVersion && <p>착수 확인 수신 · 최신 판을 기다리고 있습니다.</p>}
      {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}{s.error && <p role="alert">{s.error}</p>}
    </div>
  )
  return <section className={`prototype-game gomoku-focus-hud omok-panel omok-rail-hud${player ? '' : ' omok-spectator-hud'}`} aria-label="오목 경기" data-spectator={!player} data-board-view={!player && spectatorView === 'board'}>
    <OmokCoinToss key={g.gameId} game={o} />
    {player ? <header ref={header} className="omok-match-header omok-player-header" aria-label="오목 경기 정보">
      <div className="omok-match-player omok-own-stone" aria-label="내 돌"><i className={`stone-chip ${ownBlack ? 'black' : 'white'}`} /><div>
        <small>내 돌 · {profiles[own]?.nickname ?? '나'}</small><b>{ownBlack ? '흑돌' : '백돌'}</b></div></div>
      <OmokTurnClock remainingMs={remainingMs} label={myTurn?'내 차례':'상대 차례'} myTurn={myTurn && o.status==='PLAYING'}
        hint={remaining===0?'종료 판정 대기':myTurn?'지금 착수하세요':'상대가 생각 중이에요'}/>
      <div className="omok-match-player"><div><b>{profiles[opponent]?.nickname ?? '상대'}</b>
        <small>상대 · {ownBlack ? '백돌' : '흑돌'}</small></div><i className={`stone-chip ${ownBlack ? 'white' : 'black'}`} /></div>
    </header> : <header ref={header} className="omok-match-header" aria-label="오목 관전 경기 정보">
      <div className="omok-match-player" data-turn={o.turnUserId === o.blackUserId}><i className="stone-chip black" /><div><b>{profiles[o.blackUserId]?.nickname ?? '흑 플레이어'}</b><small>흑돌</small></div></div>
      <OmokTurnClock remainingMs={remainingMs} label={o.status==='FINISHED'?omokOutcome(o,own,true):o.turnUserId===o.blackUserId?'흑 차례':'백 차례'} hint="오목 관전 중"/>
      <div className="omok-match-player" data-turn={o.turnUserId === o.whiteUserId}><div><b>{profiles[o.whiteUserId]?.nickname ?? '백 플레이어'}</b><small>백돌</small></div><i className="stone-chip white" /></div>
    </header>}
    {player ? <div ref={toolbar} className="omok-player-bottom">
      <div className="omok-play-notes"><div className="focus-record"><span>{o.moveCount}수</span><span className="omok-last-move-text">{lastMoveText(o.lastMove)}</span></div>
        <p className="focus-hint">{s.pending ? '요청 전송 중 · 서버 확인을 기다리고 있습니다.' : o.draw ? '무승부 응답 대기 중 · 착수 시계는 계속 흐릅니다.' : o.undo ? '무르기 응답 대기 중 · 착수 시계는 계속 흐릅니다.' : myTurn ? ownBlack ? '빈 교차점을 클릭하세요 · 빨간 33·44·6은 금수입니다' : '빈 교차점을 클릭해 돌을 놓으세요' : '상대의 착수를 기다리고 있어요'}</p>
      </div>
      <div className="omok-play-tools"><div className="omok-negotiations"><OmokUndoControls now={now}/><OmokDrawControls now={now}/></div>
        <div className="focus-actions"><GameSpectatorCount/>
          <button onClick={()=>openManual('gomoku')}>게임 설명 · F1</button>
          {(recoveryBlocked()||s.uncertain)&&<button disabled={pending||!connected} onClick={()=>void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
          <OmokSurrender key={own+':'+g.gameId} context={{userId:own,gameId:g.gameId,version:g.version}} disabled={pending||!connected||recoveryBlocked()||s.uncertain}/>
        </div>
      </div>{alerts}
    </div> : <div ref={toolbar} className="omok-spectator-toolbar">
      <div className="omok-spectator-actions"><GameSpectatorCount/><div className="omok-view-switch" role="group" aria-label="관전 시점">
        <button disabled={pending||!connected} aria-pressed={spectatorView==='table'} onClick={()=>useTableLobby.setState({spectatorView:'table'})}>주변 보기</button>
        <button disabled={pending||!connected} aria-pressed={spectatorView==='board'} onClick={()=>useTableLobby.setState({spectatorView:'board'})}>판 보기</button>
      </div><button onClick={()=>openManual('gomoku')}>게임 설명 · F1</button><button disabled={pending} onClick={()=>void runtime.unwatchGame()}>관전 종료</button></div>
      <OmokPingStatus/>{alerts}
    </div>}
  </section>
}
