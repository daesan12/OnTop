import { useRef, useState, type ReactNode } from 'react'
import { Board3D } from './Board3D'
import { StickResult } from './StickResult'
import { YutChatPanel } from './YutChatPanel'
import { YutThrow3D } from './YutThrow3D'
import { useThrowAnimation } from './useThrowAnimation'
import type { YutClient } from './client'
import { openingLabel, teamName, type YutMove, type YutRoll, type YutSnapshot } from './contracts'

function Caret() {
  return <svg className="yut-caret" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
}
export function YutMatchHeader({ state, status, seconds, manual, pending, activeExit, blocked, myTurn, onManual, onClose, onChat }: {
  state: YutSnapshot['publicState']; status: string; seconds: number; manual: boolean; pending: boolean; activeExit: boolean
  blocked: boolean; myTurn: boolean; onManual(): void; onClose(): void; onChat(): void
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  const choose = (action: () => void) => { if (menu.current) menu.current.open = false; action() }
  return <header className="yut-match-header" inert={blocked}>
    <section className="yut-clock" data-my-turn={myTurn} data-urgent={seconds <= 15 && state.phase === 'PLAYING'} aria-label="경기 시간과 현재 차례">
      <div className="yut-match-name"><h1 id="yut-title" tabIndex={-1}>윷놀이</h1><span title={state.roomName}>{state.roomName}</span></div>
      <div className="yut-match-status"><h2 aria-live="polite">{status}</h2>
        {state.phase === 'PLAYING' && <div className="yut-time"><strong role="timer" aria-live="off">{seconds}</strong><span>초</span></div>}
      </div>
      {state.phase === 'PLAYING' && <progress max={90} value={seconds} aria-label="남은 차례 시간" />}
    </section>
    <nav className="yut-game-menu" aria-label="게임 메뉴">
      <button className="yut-mobile-chat" onClick={onChat}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 3h14v10H9l-4 4v-4H3z" /></svg>채팅</button>
      <details ref={menu} onKeyDown={event => { if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); event.stopPropagation(); menu.current.open = false; menu.current.querySelector('summary')?.focus() } }}>
        <summary>게임 메뉴<Caret /></summary><div className="yut-menu-body">
          <button onClick={() => choose(onManual)} aria-expanded={manual}>설명서</button>
          <button onClick={() => choose(onClose)} disabled={pending}>{activeExit ? '기권·나가기' : '공원으로'}</button>
        </div>
      </details>
    </nav>
  </header>
}

export function YutMatchView({ client, snapshot, user, busy, pending, myTurn, selected, activeRoll, destinations, onPiece, onRoll, onLeave, rules, blocked = false, chatFocusRequest = 0 }: {
  client: YutClient; snapshot: YutSnapshot; user: string; busy: boolean; pending: boolean; myTurn: boolean
  selected: number; activeRoll?: YutRoll; destinations: YutMove[]; onPiece(piece: number): void; onRoll(id: number): void
  onLeave(): void; rules: ReactNode; blocked?: boolean; chatFocusRequest?: number
}) {
  const state = snapshot.publicState, finished = state.phase === 'FINISHED'
  const opening = !!state.openingTeams?.length
  const showOpening = !finished && (opening || state.lastThrow?.opening)
  const comparedTeams = opening ? state.openingTeams! : state.openingFinalists ?? []
  const [requestedFrom, setRequestedFrom] = useState<number | null>(null)
  const replaying = useThrowAnimation(snapshot.gameId, state.lastThrow)
  const waiting = requestedFrom !== null && requestedFrom === (state.lastThrow?.id ?? 0)
  const animating = !finished && !replaying.reducedMotion && (waiting || replaying.rolling)
  const expanded = !finished && !replaying.reducedMotion && (waiting || replaying.expanded)
  const actionBusy = busy || blocked || expanded
  const throwYut = async () => {
    setRequestedFrom(state.lastThrow?.id ?? 0)
    try { await client.act({ type: 'THROW' }) } finally { setRequestedFrom(null) }
  }
  const move = (destination: YutMove) => {
    if (!actionBusy && activeRoll) void client.act({ type: 'MOVE', piece: selected, rollId: activeRoll.id, shortcut: destination.shortcut })
  }
  const hint = finished ? state.reason === 'YUT_COMPLETED' ? '승리 팀의 말이 모두 완주했어요.' : '마지막 남은 팀이 승리했어요.'
    : opening ? '각 팀 대표가 차례대로 윷을 던져주세요.' : !myTurn ? '윷판의 칸을 눌러 위치 핑을 보낼 수 있어요.'
      : !activeRoll ? '윷을 던져 이동권을 얻으세요.' : selected < 0 ? '말을 고르고 도착 칸을 눌러주세요.'
        : state.pieces[state.team][selected] === 0 ? '새 말은 오른쪽 아래의 위쪽 첫 칸부터 세어요. 도착 칸을 눌러주세요.'
          : `${teamName(state.team)} ${selected + 1}번 말 · 도착 칸을 눌러주세요.`
  return <div className="yut-match-layout" data-teams={state.teamCount} data-opening={opening} data-comparing={showOpening} inert={blocked}>
    <section className="yut-board-region yut-match-board" aria-label="중앙 윷판">
      <div className="yut-board-stage"><Board3D state={state} focus selected={selected} destinations={expanded ? [] : destinations}
        onPiece={(team, piece) => { if (!opening && myTurn && !actionBusy && team === state.team) onPiece(piece) }} onMove={move}
        onPing={node => { if (!busy && !blocked) void client.feedback(`📍 윷판 ${node}번 칸`) }} /></div>
    </section>
    <aside className="yut-match-left" aria-label="팀 현황과 경기 채팅">
      <div className="yut-match-teams" tabIndex={0} aria-label="팀별 말 현황">{state.pieces.map((tokens, team) => <section key={team} className={`yut-team-box yut-team-${team}`}
        data-turn={team === state.team && !finished} data-eliminated={state.eliminatedTeams.includes(team)}>
        <h3><span className={`yut-team-dot yut-team-${team}`} />{teamName(team)}<small>{tokens.filter(node => node === 30).length}/{state.pieceCount}{state.eliminatedTeams.includes(team) ? ' 탈락' : ' 완주'}</small></h3>
        <p>{state.players.filter(player => player.team === team).map(player => player.nickname + (player.userId === user ? ' (나)' : '')).join(' · ')}</p>
        <div className="yut-piece-rack">{tokens.map((node, piece) => <button key={piece} className={`yut-token yut-team-${team}`} data-position={node}
          disabled={opening || !myTurn || team !== state.team || node === 30 || actionBusy} aria-pressed={selected === piece && state.team === team}
          aria-label={`${teamName(team)} ${piece + 1}번 말 선택`} onClick={() => onPiece(piece)}>
          {node === 30 ? '✓' : piece + 1}<small>{state.eliminatedTeams.includes(team) ? '탈락' : node === 0 ? '대기' : node === 30 ? '완주' : '판 위'}</small>
        </button>)}</div>
      </section>)}</div>
      <YutChatPanel client={client} snapshot={snapshot} busy={busy || blocked} focusRequest={chatFocusRequest} />
    </aside>
    <aside className="yut-play-panel" aria-label="윷놀이 조작과 진행 기록">
      <div className="yut-right-top" tabIndex={0}>
        {showOpening && <section className="yut-opening" aria-label="팀별 선공 결정 결과"><h3>{opening ? `선공 결정 · ${state.openingRound}차` : `${teamName(state.team)} 선공 확정`}</h3>
          <p>모 &gt; 윷 &gt; 걸 &gt; 개 &gt; 도 &gt; 빽도<br />최고 동률 팀만 재던져요. 낙은 최하위예요.</p>
          {state.pieces.map((_, team) => <div key={team} className="yut-opening-row" data-turn={team === state.team}>
            <strong><span className={`yut-team-dot yut-team-${team}`} />{teamName(team)}</strong>
            <span>{state.eliminatedTeams.includes(team) ? '탈락' : comparedTeams.includes(team) ? openingLabel(state.opening[team]) : '재던지기 제외'}</span>
          </div>)}</section>}
        <details className="yut-match-history"><summary>최근 진행<Caret /></summary><ol aria-live="polite">{state.log.slice(-4).map((line, i) => <li key={`${i}:${line}`}>{line}</li>)}</ol></details>
        {rules}
      </div>
      <section className="yut-controls">
        {(state.lastThrow || !finished) && <YutThrow3D result={state.lastThrow ?? null} animating={animating} expanded={expanded} waiting={waiting && animating} />}
        {finished ? <button className="yut-primary yut-throw" disabled={pending} onClick={onLeave}>공원으로 돌아가기</button>
          : <button className="yut-primary yut-throw" aria-label={opening ? '선공 결정 윷 던지기' : undefined} disabled={!myTurn || actionBusy || state.credits < 1 || state.rolls.length >= 32}
            onClick={() => void throwYut()}>{animating ? '굴러가는 중…' : expanded ? '결과 확인 중…' : pending ? '확인 중…' : opening ? '선공 윷 던지기' : '윷 던지기'} {state.credits > 0 && `(${state.credits})`}</button>}
      </section>
    </aside>
    <footer className="yut-move-dock" aria-label="이동권과 말 이동">
      {!showOpening && !finished && <div className="yut-roll-bank"><h3>이동권</h3><div className="yut-rolls" tabIndex={0} role="group" aria-label="모아 둔 이동권">
        {state.rolls.length ? state.rolls.map(roll => <button key={roll.id} disabled={!myTurn || actionBusy} aria-pressed={activeRoll?.id === roll.id} onClick={() => onRoll(roll.id)}>
          <StickResult mask={roll.mask} /><strong>{roll.name}</strong><small>{roll.steps === -1 ? '뒤로 1칸' : `${roll.steps}칸`}</small>
        </button>) : <p className="yut-help">윷을 던지면 이동권이 생겨요.</p>}
      </div></div>}
      <div className="yut-move-guidance"><p className="yut-selection" aria-live="polite">{hint}</p>
        {!!destinations.length && <div className="yut-actions">{destinations.filter((value, i, all) => all.findIndex(other => other.to === value.to) === i).map(destination =>
          <button key={String(destination.shortcut)} disabled={actionBusy} onClick={() => move(destination)}>{destination.to === 30 ? '완주하기' : `${destination.shortcut ? '지름길' : '기본 길'} · ${activeRoll!.steps === -1 ? '뒤로 1칸' : `${activeRoll!.steps}칸 이동`}`}</button>)}</div>}
      </div>
    </footer>
  </div>
}
