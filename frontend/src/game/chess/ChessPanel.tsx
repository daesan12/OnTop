import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGame } from '../store'
import { useSession, estimatedServerTime } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { openManual } from '../../features/manual/manualState'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { useOmokEvents } from '../omok/spectatorEvents'
import { canUseChess } from './actions'
import { CHESS_END_REASON, type ChessMove } from './protocol'
import pieces from './assets/pieces.png'
import './chess.css'

const kinds = 'KQRBNP'
const labels: Record<string, string> = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트', P: '폰' }
const coord = (index: number) => `${'abcdefgh'[index % 8]}${1 + Math.floor(index / 8)}`
const clockLabel = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`

export function ChessPiece({ piece }: { piece: string }) {
  return <span className="chess-piece" aria-hidden="true" style={{ backgroundImage: `url(${pieces})`,
    backgroundPosition: `${kinds.indexOf(piece.toUpperCase()) * 20}% ${piece === piece.toUpperCase() ? 0 : 100}%` } as CSSProperties} />
}

export function ChessPanel() {
  const state = useGame(), runtime = useParkRuntime(), own = useSession(s => s.sessionId)
  const connected = useSession(s => s.status === 'connected'), profiles = useSession(s => s.profiles)
  const chats = useOmokEvents(s => s.chats), pings = useOmokEvents(s => s.pings)
  const [selected, setSelected] = useState(''), [promotion, setPromotion] = useState<ChessMove[]>([])
  const [flip, setFlip] = useState(false), [confirmForfeit, setConfirmForfeit] = useState(false)
  const [claimMode, setClaimMode] = useState(false), [text, setText] = useState('')
  const [now, setNow] = useState(estimatedServerTime)
  const panel = useRef<HTMLElement>(null)
  const game = state.game?.chess ? state.game : null
  useEffect(() => { const timer = setInterval(() => setNow(estimatedServerTime()), 200); return () => clearInterval(timer) }, [])
  useEffect(() => { setSelected(''); setPromotion([]); setClaimMode(false); setConfirmForfeit(false) }, [game?.gameId, game?.version])
  useEffect(() => { panel.current?.focus({ preventScroll: true }) }, [game?.gameId])
  if (!game) return <section className="chess-panel"><h2>체스</h2><p role="status">경기 상태를 확인하고 있습니다.</p>
    <button onClick={() => void runtime.checkRecovery()}>경기 복구 확인</button></section>
  const c = game.chess, player = game.role === 'PLAYER', playing = c.status === 'PLAYING'
  const blackView = (own === c.blackUserId) !== flip, canUse = connected && canUseChess(own)
  const myTurn = canUse && c.turnUserId === own
  const visible = Array.from({ length: 64 }, (_, i) => blackView ? (Math.floor(i / 8) * 8 + 7 - i % 8) : ((7 - Math.floor(i / 8)) * 8 + i % 8))
  const name = (id: string) => id === own ? '나' : profiles[id]?.nickname ?? '상대'
  const status = !playing ? c.winnerUserId ? `${name(c.winnerUserId)} 승리 · ${CHESS_END_REASON[c.endReason ?? '']}`
    : `무승부 · ${CHESS_END_REASON[c.endReason ?? '']}` : `${c.turnUserId === c.whiteUserId ? '백' : '흑'}의 차례${c.inCheck ? ' · 체크!' : ''}`
  const send = (move: ChessMove) => {
    const input = { kind: claimMode ? 'claimDraw' as const : 'move' as const, from: move.from, to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}) }
    setSelected(''); setPromotion([]); void runtime.actChess?.(input)
  }
  const clickSquare = (index: number) => {
    const square = coord(index)
    if (!player) { if (playing) void runtime.pingOmok(index % 8, Math.floor(index / 8)); return }
    if (!myTurn || promotion.length) return
    const matches = c.legalMoves.filter(m => m.from === selected && m.to === square)
    if (matches.length > 1) { setPromotion(matches); return }
    if (matches.length === 1) { send(matches[0]); return }
    setSelected(c.legalMoves.some(m => m.from === square) ? square : '')
  }
  const clocks = [c.whiteUserId, c.blackUserId].map((id, index) => ({ id, ms: playing && c.turnUserId === id
    ? Date.parse(c.turnDeadline!) - now : c.remainingMs[index] }))
  const destinations = c.legalMoves.filter(m => m.from === selected).map(m => m.to)
  const lastMove = c.moves.at(-1)
  return <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" className="chess-panel" aria-label="체스 경기" data-role={game.role} data-status={c.status}
    onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
      e.stopPropagation()
      if (e.key !== 'Tab') return
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')]
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }} onWheel={e => e.stopPropagation()}>
    <header className="chess-heading"><h2>체스</h2><p role="status" aria-live="polite">{status}</p></header>
    <div className="chess-layout">
      <div className="chess-board-wrap"><div className="chess-board" role="group" aria-label="체스판 8 곱하기 8">
        {visible.map((index, displayIndex) => {
          const square = coord(index), piece = c.board[index], target = destinations.includes(square)
          const ping = pings.some(p => p.gameId === game.gameId && p.x === index % 8 && p.y === Math.floor(index / 8))
          const recent = lastMove?.slice(0, 2) === square || lastMove?.slice(2, 4) === square
          return <button key={square} type="button" className={`chess-square ${(index % 8 + Math.floor(index / 8)) % 2 ? 'light' : 'dark'}${target ? ' legal' : ''}${selected === square ? ' selected' : ''}${recent ? ' recent' : ''}${ping ? ' ping' : ''}`}
            aria-label={`${square} ${piece === '.' ? '빈 칸' : `${piece === piece.toUpperCase() ? '백' : '흑'} ${labels[piece.toUpperCase()]}`}${target ? ' 이동 가능' : ''}`}
            aria-pressed={selected === square} aria-disabled={player ? !myTurn || promotion.length > 0 : !playing}
            onClick={() => clickSquare(index)}>
            {displayIndex % 8 === 0 && <small className="chess-rank">{square[1]}</small>}
            {displayIndex >= 56 && <small className="chess-file">{square[0]}</small>}
            {piece !== '.' && <ChessPiece piece={piece} />}{target && <span className="chess-destination" />}
          </button>
        })}
      </div></div>
      <aside className="chess-sidebar">
        <div className="chess-players">{[...clocks].reverse().map(({ id, ms }) => <div key={id} className={`chess-player ${c.turnUserId === id ? 'active' : ''}`}>
          <ChessPiece piece={id === c.whiteUserId ? 'P' : 'p'} /><span>{id === c.whiteUserId ? '백' : '흑'} · {name(id)}</span>
          <time aria-label={`${id === c.whiteUserId ? '백' : '흑'} 남은 시간`}>{clockLabel(ms)}</time>
        </div>)}</div>
        <section className="chess-history" aria-label="이동 기록"><h3>이동 기록</h3>
          {c.moves.length ? <ol>{Array.from({ length: Math.ceil(c.moves.length / 2) }, (_, i) => <li key={i}>
            <span>{c.moves[i * 2].replace(/^(.{2})(.{2})(.*)$/, '$1–$2$3')}</span><span>{c.moves[i * 2 + 1]?.replace(/^(.{2})(.{2})(.*)$/, '$1–$2$3')}</span>
          </li>)}</ol> : <p>백이 먼저 둡니다.</p>}</section>
        <div className="chess-tools">
          {player && playing && <>
            <button disabled={!canUse || !!c.drawOfferedBy || c.drawOffersUsed.includes(own)} onClick={() => void runtime.actChess?.({ kind: 'drawOffer' })}>무승부 제안</button>
            {c.drawOfferedBy && <p role="status">{name(c.drawOfferedBy)}의 무승부 제안</p>}
            {c.drawOfferedBy && c.drawOfferedBy !== own && <div className="chess-pair"><button disabled={!canUse} onClick={() => void runtime.actChess?.({ kind: 'drawRespond', accept: true })}>수락</button><button disabled={!canUse} onClick={() => void runtime.actChess?.({ kind: 'drawRespond', accept: false })}>거절</button></div>}
            {c.canClaimDraw && <button disabled={!myTurn} onClick={() => void runtime.actChess?.({ kind: 'claimDraw' })}>무승부 청구</button>}
            <button className="chess-secondary" disabled={!myTurn} aria-pressed={claimMode} onClick={() => { setClaimMode(!claimMode); setSelected('') }}>{claimMode ? '예정 수 청구 취소' : '예정 수로 무승부 청구'}</button>
            {claimMode && <p>반복 3회·50수를 채울 예정 수를 선택하세요.</p>}
            <button className="chess-secondary" disabled={!connected || state.pending || confirmForfeit} onClick={() => setConfirmForfeit(true)}>기권</button>
            {confirmForfeit && <div className="chess-confirm" role="group" aria-label="기권 확인"><p>기권하면 패배합니다. 기권할까요?</p><div className="chess-pair"><button autoFocus onClick={() => { setConfirmForfeit(false); void runtime.forfeitGame(game.gameId) }}>기권 확정</button><button onClick={() => setConfirmForfeit(false)}>취소</button></div></div>}
          </>}
          <button onClick={() => openManual('chess')}>도움말</button>
          <button className="chess-secondary" onClick={() => setFlip(!flip)}>화면 뒤집기</button>
          {!player && <button onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
          {!playing && player && <><p>{state.result ? resultSettlement(state.result) : '결과·정산 확인 중'}</p><button disabled={!connected || state.pending} onClick={() => void runtime.checkResult()}>정산 결과 확인</button><button disabled={!connected || state.pending} onClick={() => void runtime.leaveTable()}>공원으로 나가기</button></>}
        </div>
      </aside>
    </div>
    {promotion.length > 0 && <div className="chess-promotion" role="group" aria-label="승격 기물 선택"><p>승격할 기물을 고르세요</p><div>{promotion.map(move => <button key={move.promotion} onClick={() => send(move)}><ChessPiece piece={own === c.whiteUserId ? move.promotion!.toUpperCase() : move.promotion!} />{labels[move.promotion!.toUpperCase()]}</button>)}<button onClick={() => setPromotion([])}>취소</button></div></div>}
    <footer className="chess-notices">
      {!player && <p>관전 중 · 체스판을 누르면 해당 칸에 핑을 보냅니다.</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {(state.uncertain || !connected) && <p role="alert">연결·반영 상태를 확인해주세요. <button onClick={() => void runtime.checkRecovery()}>경기 복구 확인</button></p>}
      <div className="chess-chat" aria-label="경기 채팅">{chats.filter(m => m.gameId === game.gameId).slice(-2).map(m => <p key={m.eventId}>{name(m.senderUserId)}: {m.text}</p>)}
        {playing && <form onSubmit={e => { e.preventDefault(); if (text.trim()) void runtime.sendSpectatorChat(text).then(ok => { if (ok) setText('') }) }}><input aria-label="경기 채팅 입력" maxLength={200} value={text} onChange={e => setText(e.target.value)} placeholder="함께 이야기하기" /><button disabled={!connected || !text.trim()}>보내기</button></form>}
      </div>
    </footer>
  </section>
}
