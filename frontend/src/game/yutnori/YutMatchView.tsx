import { useState, type ReactNode } from 'react'
import { Board3D } from './Board3D'
import { StickResult } from './StickResult'
import { YutChatPanel } from './YutChatPanel'
import { YutThrow3D } from './YutThrow3D'
import { useThrowAnimation } from './useThrowAnimation'
import type { YutClient } from './client'
import { openingLabel, teamName, type YutMove, type YutRoll, type YutSnapshot } from './contracts'

export function YutMatchHeader({ state, status, seconds, manual, pending, activeExit, onManual, onClose }: {
  state: YutSnapshot['publicState']; status: string; seconds: number; manual: boolean; pending: boolean; activeExit: boolean
  onManual(): void; onClose(): void
}) {
  return <header className="yut-match-header">
    <div className="yut-match-name"><h1 id="yut-title" tabIndex={-1}>윷놀이</h1><span title={state.roomName}>{state.roomName}</span></div>
    <div className="yut-match-status"><h2 aria-live="polite">{status}</h2>{state.phase === 'PLAYING' && <>
      <strong className="yut-match-clock" role="timer" aria-live="off" data-urgent={seconds <= 15}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong>
      <progress max={90} value={seconds} aria-label="남은 차례 시간" />
    </>}</div>
    <div className="yut-match-menu"><button className="yut-mobile-chat" onClick={() => { document.getElementById('yut-chat')?.scrollIntoView({ block: 'center' }); document.getElementById('yut-chat')?.focus() }}>채팅</button>
      <button onClick={onManual} aria-expanded={manual}>설명서</button><button onClick={onClose} disabled={pending}>{activeExit ? '기권·나가기' : '공원으로'}</button></div>
  </header>
}

export function YutMatchView({ client, snapshot, user, busy, pending, myTurn, selected, activeRoll, destinations, onPiece, onRoll, onLeave, rules }: {
  client: YutClient; snapshot: YutSnapshot; user: string; busy: boolean; pending: boolean; myTurn: boolean
  selected: number; activeRoll?: YutRoll; destinations: YutMove[]; onPiece(piece: number): void; onRoll(id: number): void
  onLeave(): void; rules: ReactNode
}) {
  const state = snapshot.publicState
  const finished = state.phase === 'FINISHED'
  const opening = !!state.openingTeams?.length
  const showOpening = !finished && (opening || state.lastThrow?.opening)
  const comparedTeams = opening ? state.openingTeams! : state.openingFinalists ?? []
  const [requestedFrom, setRequestedFrom] = useState<number | null>(null)
  const replaying = useThrowAnimation(snapshot.gameId, state.lastThrow)
  const waiting = requestedFrom !== null && requestedFrom === (state.lastThrow?.id ?? 0)
  const animating = !finished && !replaying.reducedMotion && (waiting || replaying.rolling)
  const expanded = !finished && !replaying.reducedMotion && (waiting || replaying.expanded)
  const actionBusy = busy || expanded
  const throwYut = async () => {
    setRequestedFrom(state.lastThrow?.id ?? 0)
    try { await client.act({ type: 'THROW' }) } finally { setRequestedFrom(null) }
  }
  const move = (destination: YutMove) => {
    if (!actionBusy && activeRoll) void client.act({ type: 'MOVE', piece: selected, rollId: activeRoll.id, shortcut: destination.shortcut })
  }
  return <div className="yut-match-layout">
    <aside tabIndex={0} className="yut-match-left" aria-label="팀 현황과 경기 채팅">
      <div className="yut-match-teams">{state.pieces.map((tokens, team) => <section key={team} className={`yut-team-box yut-team-${team}`}
        data-turn={team === state.team && !finished} data-eliminated={state.eliminatedTeams.includes(team)}>
        <h3><span className={`yut-team-dot yut-team-${team}`} />{teamName(team)}<small>{tokens.filter(node => node === 30).length}/{state.pieceCount}{state.eliminatedTeams.includes(team) ? ' 탈락' : ' 완주'}</small></h3>
        <p>{state.players.filter(player => player.team === team).map(player => player.nickname + (player.userId === user ? ' (나)' : '')).join(' · ')}</p>
        <div className="yut-piece-rack">{tokens.map((node, piece) => <button key={piece} className={`yut-token yut-team-${team}`}
          disabled={opening || !myTurn || team !== state.team || node === 30 || actionBusy} aria-pressed={selected === piece && state.team === team}
          aria-label={`${teamName(team)} ${piece + 1}번 말 선택`} onClick={() => onPiece(piece)}>
          {node === 30 ? '✓' : piece + 1}<small>{state.eliminatedTeams.includes(team) ? '탈락' : node === 0 ? '대기' : node === 30 ? '완주' : '판 위'}</small>
        </button>)}</div>
      </section>)}</div>
      <YutChatPanel client={client} snapshot={snapshot} busy={busy} />
    </aside>
    <section className="yut-board-region yut-match-board" aria-label="중앙 윷판">
      <div className="yut-board-stage"><Board3D state={state} selected={selected} destinations={expanded ? [] : destinations}
        onPiece={(team, piece) => { if (!opening && myTurn && !actionBusy && team === state.team) onPiece(piece) }} onMove={move}
        onPing={node => { if (!busy) void client.feedback(`📍 윷판 ${node}번 칸`) }} /></div>
      <p className="yut-board-caption">{opening ? '선공 결정 · 각 팀 대표가 윷을 던져요 · 최고 결과 동률이면 해당 팀만 재던지기' : '이동권 → 말 → 도착 칸 · 참먹이에서 한 칸 더 가면 완주'}</p>
    </section>
    <aside tabIndex={0} className="yut-play-panel" aria-label="윷놀이 조작과 진행 기록">
      <section className="yut-controls">
        {finished ? <><button className="yut-primary yut-throw" disabled={pending} onClick={onLeave}>공원으로 돌아가기</button><p className="yut-help">{state.reason === 'YUT_COMPLETED' ? '승리 팀의 말이 모두 완주했어요.' : '마지막 남은 팀이 승리했어요.'}</p></>
          : <button className="yut-primary yut-throw" aria-label={opening ? '선공 결정 윷 던지기' : undefined} disabled={!myTurn || actionBusy || state.credits < 1 || state.rolls.length >= 32}
            onClick={() => void throwYut()}>{animating ? '굴러가는 중…' : expanded ? '결과 확인 중…' : pending ? '확인 중…' : opening ? '선공 윷 던지기' : '윷 던지기'} {state.credits > 0 && `(${state.credits})`}</button>}
        <YutThrow3D result={state.lastThrow ?? null} animating={animating} expanded={expanded} waiting={waiting && animating} />
        {showOpening ? <section className="yut-opening" aria-label="팀별 선공 결정 결과"><h3>{opening ? `선공 결정 · ${state.openingRound}차` : `${teamName(state.team)} 선공 확정`}</h3>
          <p>모 &gt; 윷 &gt; 걸 &gt; 개 &gt; 도 &gt; 빽도<br />낙은 가장 낮아요. 최고 동률 팀만 재던져요.</p>
          {state.pieces.map((_, team) => <div key={team} className="yut-opening-row" data-turn={team === state.team}>
            <strong><span className={`yut-team-dot yut-team-${team}`} />{teamName(team)}</strong>
            <span>{state.eliminatedTeams.includes(team) ? '탈락' : comparedTeams.includes(team) ? openingLabel(state.opening[team]) : '재던지기 제외'}</span>
            {comparedTeams.includes(team) && state.opening[team] >= 0 && <StickResult mask={state.opening[team]} />}
          </div>)}</section> : <><h3>이동권</h3>
        <div className="yut-rolls" aria-label="모아 둔 이동권">{state.rolls.length ? state.rolls.map(roll => <button key={roll.id} disabled={!myTurn || actionBusy}
          aria-pressed={activeRoll?.id === roll.id} onClick={() => onRoll(roll.id)}>
          <StickResult mask={roll.mask} /><strong>{roll.name}</strong><small>{roll.steps === -1 ? '뒤로 1칸' : `앞으로 ${roll.steps}칸`}</small>
        </button>) : <p className="yut-help">{finished ? '경기가 끝났어요.' : '윷을 던지면 이동권이 생겨요.'}</p>}</div></>}
        <p className="yut-selection" aria-live="polite">{!myTurn ? '윷판의 칸을 눌러 위치 핑을 보낼 수 있어요.' : selected < 0 ? '이동할 우리 말을 골라주세요.' : `${teamName(state.team)} ${selected + 1}번 말 선택`}</p>
        {!!destinations.length && <div className="yut-actions">{destinations.filter((value, i, all) => all.findIndex(other => other.to === value.to) === i).map(destination =>
          <button key={String(destination.shortcut)} disabled={actionBusy} onClick={() => move(destination)}>{destination.to === 30 ? '완주하기' : `${destination.shortcut ? '지름길' : '기본 길'} · ${activeRoll!.steps === -1 ? '뒤로 1칸' : `${activeRoll!.steps}칸 이동`}`}</button>)}</div>}
        <p className="yut-backdo-key"><span aria-hidden="true">−</span> 표시 윷만 평평한 면 위면<br /><strong>빽도 · 뒤로 1칸</strong></p>
      </section>
      <section className="yut-match-history"><h3>최근 진행</h3><ol aria-live="polite">{state.log.slice(-4).map((line, i) => <li key={`${i}:${line}`}>{line}</li>)}</ol></section>
      {rules}
    </aside>
  </div>
}
