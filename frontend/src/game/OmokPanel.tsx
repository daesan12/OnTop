import { SeatedLookButton } from '../features/tableLobby/SeatedLookButton'
import { openManual } from '../features/manual/manualState'
import { useEffect, useState } from 'react'
import { useGame, canPlace, tableBusy, recoveryBlocked } from './store'
import { useSession } from '../network/worldClient'
import { useParkRuntime } from '../park/runtime/ParkRuntime'
import { TABLE_GAMES, TARGET_SCORES, lobbyStatus } from '../features/tableLobby/model'
import { useTableLobby } from '../features/tableLobby/state'
import { lastMoveText, omokOutcome } from './omokPresentation'
import { OmokSurrender } from './OmokSurrender'
import './game.css'

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
  if (seated !== tableId || !table) return null
  const busy = tableBusy(),
    mine = table.seats.find((s) => s.userId === own)
  const lobby = lobbyStatus(table, own, busy)
  const bet = Number(betInput), validBet = Number.isSafeInteger(bet) && bet > 0
  return (
    <div className="omok-lobby">
      <strong>
        게임 ·{' '}
        {TABLE_GAMES.find(g => g.code === table.gameCode)?.name ?? table.gameCode ?? '선택 전'}
      </strong>
      <p>{lobby.host ? '선택 담당자 · 게임과 참가비를 설정할 수 있어요.' : '선택 담당자가 게임과 참가비를 설정합니다.'}</p>
      <p>확정 참가비: {table.betAmountPerPlayer == null ? '미설정' : `${table.betAmountPerPlayer.toLocaleString()} 코인 / 1인`}</p>
      <label>1인 참가비 <input aria-label="1인 참가비" type="number" min="1" step="1" value={betInput}
        disabled={pending || busy || !lobby.host} onChange={event => setBetInput(event.target.value)} /></label>
      <button disabled={pending || busy || !lobby.host || !validBet || !table.gameCode || bet === table.betAmountPerPlayer}
        onClick={() => void runtime.selectGame(table.gameCode as typeof TABLE_GAMES[number]['code'], bet,
          table.gameCode === 'DICE' ? table.targetScore ?? target : undefined)}>참가비 적용</button>
      <div className="table-game-options" role="group" aria-label="게임 선택">
        {TABLE_GAMES.map(game => <button key={game.code}
          disabled={pending || busy || !lobby.host || !validBet || table.gameCode === game.code}
          aria-pressed={table.gameCode === game.code}
          onClick={() => void runtime.selectGame(game.code, bet, game.code === 'DICE' ? target : undefined)}>
          {game.name} 선택
        </button>)}
      </div>
      <label>주사위 목표 점수 <select aria-label="주사위 목표 점수" value={table.gameCode === 'DICE' ? table.targetScore ?? target : target}
        disabled={pending || busy || !lobby.host}
        onChange={event => { const score = Number(event.target.value); setTarget(score); if (table.gameCode === 'DICE' && validBet) void runtime.selectGame('DICE', bet, score) }}>
        {TARGET_SCORES.map(score => <option key={score} value={score}>{score}점</option>)}
      </select></label>
      {table.gameCode && !TABLE_GAMES.some(g => g.code === table.gameCode && g.playable) && <p>이 게임의 플레이 화면은 준비 중입니다. 현재는 대기실 설정만 변경할 수 있습니다.</p>}
      <p>{lobby.count}/{table.capacity}명 · 최소 {table.minimumPlayers}명</p>
      <button
        disabled={pending || !lobby.canReady}
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
      {start?.code && <p>{start.code}</p>}
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

/** Accessible controls share the same command path as the 3D board; never a local game engine. */
export function OmokPanel() {
  const runtime = useParkRuntime(),
    s = useGame(),
    own = useSession((s) => s.sessionId)
  const connected = useSession((s) => s.status === 'connected'),
    pending = useSession((s) => s.pending)
  const spectatorView = useTableLobby(s => s.spectatorView)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!s.game?.omok?.turnDeadline) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [s.game?.omok?.turnDeadline])
  const g = s.game?.omok ? s.game : null
  if (!g && !recoveryBlocked() && (!s.error || !s.permittedGameId)) return null
  const deadline = g?.omok?.turnDeadline,
    remaining = deadline
      ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
      : null
  const o = g?.omok,
    myTurn = g?.role === 'PLAYER' && o?.turnUserId === own
  if (!g || !o) return <section className="park-runtime-panel omok-panel" aria-label="오목 경기"><p role="status">경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>{s.error && <p role="alert">{s.error}</p>}<button disabled={pending || !connected} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button></section>
  return <section className="prototype-game gomoku-focus-hud omok-panel" aria-label="오목 경기">
    <header className="focus-table-label">{g.role === 'SPECTATOR' ? '오목 관전' : '오목 한 판'}<span>15×15 렌주 · 한 수 30초</span></header>
    <div className="focus-turn" role="status"><i className={`stone-chip ${own === o.blackUserId ? 'black' : 'white'}`} /><div>
      <small>{g.role === 'SPECTATOR' ? '관전 중' : own === o.blackUserId ? '내 돌: 흑' : '내 돌: 백'}</small>
      <b>{o.status === 'FINISHED' ? omokOutcome(o, own, g.role === 'SPECTATOR') : myTurn ? '내 차례' : g.role === 'SPECTATOR' ? o.turnUserId === o.blackUserId ? '흑 차례' : '백 차례' : '상대 차례'}</b>
      {remaining !== null && <small>남은 시간 약 {remaining}초</small>}</div></div>
    <div className="focus-record"><span>{o.moveCount}수</span><span className="omok-last-move-text">{lastMoveText(o.lastMove)}</span></div>
    <p className="focus-hint">{s.pending ? '착수 요청 중 · 서버 확인을 기다리고 있습니다.' : myTurn ? '빈 교차점을 클릭해 돌을 놓으세요' : '상대의 착수를 기다리고 있어요'}<small>Enter · 채팅</small></p>
    <details className="omok-keyboard"><summary>키보드로 오목판 조작</summary><div
            role="group"
            aria-label="오목판"
            className="omok-accessible-board"
          >
            {o.board.flatMap((row, y) =>
              row.map((stone, x) => (
                <button
                  key={y * 15 + x}
                  className={(stone === 1 ? 'black' : stone === 2 ? 'white' : '') +
                    (o.lastMove?.x === x && o.lastMove.y === y ? ' last-move' : '')}
                  aria-current={o.lastMove?.x === x && o.lastMove.y === y ? true : undefined}
                  aria-label={`${y + 1}행 ${x + 1}열 ${stone === 1 ? '흑돌' : stone === 2 ? '백돌' : '빈칸'}`}
                  disabled={!connected || pending || !canPlace(own, x, y, now)}
                  onClick={() => void runtime.placeOmok(x, y)}
                >
                  {stone ? '●' : '·'}
                </button>
              )),
            )}
          </div></details>
    <div className="focus-actions"><SeatedLookButton />
      <button onClick={() => openManual('gomoku')}>게임 설명</button>
      <button disabled={pending || !connected} onClick={() => void runtime.checkGame()}>최신 판 확인</button>
      {recoveryBlocked() && <button disabled={pending || !connected} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
      {g.role === 'SPECTATOR' ? <><div role="group" aria-label="관전 시점"><button aria-pressed={spectatorView === 'board'} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>공개 판 보기</button><button aria-pressed={spectatorView === 'table'} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>테이블 둘러보기</button></div><button disabled={pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button><small>관전자는 돌을 놓을 수 없습니다.</small></>
        : <OmokSurrender key={`${own}:${g.gameId}`} context={{ userId: own, gameId: g.gameId, version: g.version }} disabled={pending || !connected || recoveryBlocked() || s.uncertain} />}
    </div>
    <div className="focus-error">
      {remaining === 0 && <p role="status">착수 시간이 끝났습니다. 서버의 종료 판정을 기다리고 있습니다.</p>}
      {s.uncertain && <p>착수 반영 여부를 확인해야 합니다. 같은 수를 자동 재전송하지 않습니다.</p>}
      {g.version < s.awaitingVersion && <p>착수 확인 수신 · 최신 판을 기다리고 있습니다.</p>}
      {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}{s.error && <p role="alert">{s.error}</p>}
    </div>
  </section>
}
