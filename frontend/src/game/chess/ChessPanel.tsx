import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { estimatedServerTime } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { openManual } from '../../features/manual/manualState'
import { PaperPopup } from '../../features/tableLobby/PaperPopup'
import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { useTableLobby } from '../../features/tableLobby/state'
import { clearRoamingInput } from '../../world/inputOwnership'
import { GameHudMenu } from '../GameHud'
import { OmokSurrender, type ForfeitConfirmationControls } from '../OmokSurrender'
import { CHESS_END_REASON } from './protocol'
import { ChessKeyboardBoard } from './ChessBoard3D'
import { useChessControls, useChessUI } from './parkControls'
import pieces from './assets/pieces.png'
import './chess.css'

const kinds = 'KQRBNP'
const labels: Record<string, string> = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트', P: '폰' }
const clockLabel = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`
function ChessClock({ ms, deadline, label }: { ms: number; deadline: string | null; label: string }) {
  const [now, setNow] = useState(estimatedServerTime)
  useEffect(() => { const timer = setInterval(() => setNow(estimatedServerTime()), 200); return () => clearInterval(timer) }, [])
  return <time aria-label={label}>{clockLabel(deadline ? Date.parse(deadline) - now : ms)}</time>
}
export function ChessPiece({ piece }: { piece: string }) {
  return <span className="chess-piece" aria-hidden="true" style={{ backgroundImage: `url(${pieces})`,
    backgroundPosition: `${kinds.indexOf(piece.toUpperCase()) * 20}% ${piece === piece.toUpperCase() ? 0 : 100}%` } as CSSProperties} />
}
function ChessForfeitDialog({ disabled, onConfirm, onCancel }: ForfeitConfirmationControls) {
  const keepPlaying = useRef<HTMLButtonElement>(null)
  useEffect(clearRoamingInput, [])
  return <PaperPopup title="체스" label="체스 기권 확인" onClose={onCancel} closeLabel="기권 취소" className="chess-dialog" initialFocusRef={keepPlaying}>
    <h2>이번 판을 기권할까요?</h2><p>기권하면 이번 판은 패배로 끝납니다.<br />확인하는 동안에도 시간은 흘러요.</p>
    <div className="chess-pair"><button ref={keepPlaying} className="paper-primary" onClick={onCancel}>계속 플레이</button><button disabled={disabled} onClick={onConfirm}>기권 확정</button></div>
  </PaperPopup>
}

/** The common park canvas owns the board; this component only places compact HUD controls. */
export function ChessPanel() {
  const { state, session, game, c, ui, player, looking, connected, canUse, myTurn, disabled, choose, send } = useChessControls()
  const runtime = useParkRuntime()
  if (!game || !c) return null
  const own = session.sessionId, playing = c.status === 'PLAYING'
  const name = (id: string) => id === own ? '나' : session.profiles[id]?.nickname ?? '상대'
  const status = !playing ? c.winnerUserId ? `${name(c.winnerUserId)} 승리 · ${CHESS_END_REASON[c.endReason ?? '']}`
    : `무승부 · ${CHESS_END_REASON[c.endReason ?? '']}` : `${c.turnUserId === c.whiteUserId ? '백' : '흑'}의 차례${c.inCheck ? ' · 체크!' : ''}`
  const blackView = (own === c.blackUserId) !== ui.flip
  const boardProps = { board: c.board, blackView, selected: ui.selected, destinations: c.legalMoves.filter(m => m.from === ui.selected).map(m => m.to),
    pings: [], disabled, onSquare: (index: number) => choose(index, true) }
  return <section className="chess-hud" aria-label="체스 경기" data-role={game.role} data-status={c.status}>
    <header className="chess-match-header">
      <div className="chess-title"><h2>체스</h2><span role="status" aria-live="polite">{status}</span></div>
      {[c.whiteUserId, c.blackUserId].map((id, index) => <div key={id} className="chess-player" data-turn={c.turnUserId === id}>
        <ChessPiece piece={index === 0 ? 'P' : 'p'} /><div><b>{index === 0 ? '백' : '흑'} · {name(id)}</b><small>{id === own ? '내 기물' : player ? '상대 기물' : '참가자'}</small></div>
        <ChessClock ms={c.remainingMs[index]} deadline={playing && c.turnUserId === id ? c.turnDeadline : null} label={`${index === 0 ? '백' : '흑'} 남은 시간`} />
      </div>)}
    </header>
    <div className="chess-menu-slot"><GameHudMenu embedded>
      <button onClick={() => openManual('chess')}>게임 설명</button>
      {player ? <SeatedLookButton /> : <div className="chess-pair"><button onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>체스판 보기</button><button onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>참가자 보기</button></div>}
      <div className="chess-view-tools" aria-label="체스판 시점">
        <button aria-label="시점 왼쪽으로 회전" onClick={() => useChessUI.setState({ angle: ui.angle - Math.PI / 12 })}>↶</button>
        <button aria-pressed={ui.overhead} onClick={() => useChessUI.setState({ overhead: !ui.overhead })}>{ui.overhead ? '입체 시점' : '위에서 보기'}</button>
        <button aria-label="시점 오른쪽으로 회전" onClick={() => useChessUI.setState({ angle: ui.angle + Math.PI / 12 })}>↷</button>
      </div>
      <button onClick={() => useChessUI.setState({ flip: !ui.flip })}>화면 뒤집기</button>
      <button onClick={() => useChessUI.setState({ angle: 0, overhead: false, flip: false })}>기본 시점</button>
      <button disabled={looking} onClick={() => useChessUI.setState({ keyboardOpen: true })}>키보드로 칸 선택</button>
      <details className="chess-history"><summary>이동 기록 · {c.moves.length}수</summary>{c.moves.length ? <ol>{Array.from({ length: Math.ceil(c.moves.length / 2) }, (_, i) => <li key={i}>
        <span>{c.moves[i * 2].replace(/^(.{2})(.{2})(.*)$/, '$1–$2$3')}</span><span>{c.moves[i * 2 + 1]?.replace(/^(.{2})(.{2})(.*)$/, '$1–$2$3')}</span>
      </li>)}</ol> : <p>백이 먼저 둡니다.</p>}</details>
      {player && playing && <>
        <button disabled={!canUse || !!c.drawOfferedBy || c.drawOffersUsed.includes(own)} onClick={() => void runtime.actChess?.({ kind: 'drawOffer' })}>무승부 제안</button>
        {c.canClaimDraw && <button disabled={!myTurn} onClick={() => void runtime.actChess?.({ kind: 'claimDraw' })}>무승부 청구</button>}
        <button disabled={!myTurn} aria-pressed={ui.claimMode} onClick={() => useChessUI.setState({ claimMode: !ui.claimMode, selected: '' })}>{ui.claimMode ? '예정 수 청구 취소' : '예정 수로 무승부 청구'}</button>
        <OmokSurrender key={game.gameId} context={{ userId: own, gameId: game.gameId, version: game.version }} disabled={!connected || !!state.pending}
          renderConfirmation={controls => <ChessForfeitDialog {...controls} />} />
      </>}
      {!player && <button onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
      {(state.uncertain || !connected) && <button onClick={() => void runtime.checkRecovery()}>경기 복구 확인</button>}
      {!playing && player && <button onClick={() => void runtime.leaveTable()}>공원으로 나가기</button>}
    </GameHudMenu></div>
    <footer className="chess-bottom"><p>{looking ? '주변 둘러보는 중 · 메뉴에서 판으로 돌아갈 수 있어요.' : ui.claimMode ? '반복 3회·50수를 채울 예정 수를 선택하세요.' : player ? '기물과 이동할 칸을 차례로 누르세요.' : '관전 중 · 체스판을 누르면 핑을 보냅니다.'}</p>
      {state.error && <p role="alert">{state.error}</p>}{(state.uncertain || !connected) && <p role="alert">연결·반영 상태를 확인해주세요.</p>}
    </footer>
    {c.drawOfferedBy && <aside className="chess-request" role="status"><p>{name(c.drawOfferedBy)}의 무승부 제안</p>{player && c.drawOfferedBy !== own && <div className="chess-pair"><button disabled={!canUse} onClick={() => void runtime.actChess?.({ kind: 'drawRespond', accept: true })}>수락</button><button disabled={!canUse} onClick={() => void runtime.actChess?.({ kind: 'drawRespond', accept: false })}>거절</button></div>}</aside>}
    {ui.promotion.length > 0 && <PaperPopup title="체스" label="승격 기물 선택" className="chess-dialog" closeLabel="승격 선택 취소" onClose={() => useChessUI.setState({ promotion: [] })}>
      <h2>승격할 기물을 고르세요</h2><div className="chess-promotion">{ui.promotion.map(move => <button key={move.promotion} onClick={() => send(move)}><ChessPiece piece={own === c.whiteUserId ? move.promotion!.toUpperCase() : move.promotion!} />{labels[move.promotion!.toUpperCase()]}</button>)}</div>
    </PaperPopup>}
    {ui.keyboardOpen && <PaperPopup title="체스" label="키보드로 체스 칸 선택" className="chess-dialog chess-keyboard-dialog" closeLabel="칸 선택 닫기" onClose={() => useChessUI.setState({ keyboardOpen: false })}>
      <h2>키보드로 칸 선택</h2><p>Tab으로 이동하고 Enter로 기물·목적지를 고르세요.</p><ChessKeyboardBoard {...boardProps} />
    </PaperPopup>}
  </section>
}
