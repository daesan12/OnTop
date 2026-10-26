import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { openManual } from '../../features/manual/manualState'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useTableLobby } from '../../features/tableLobby/state'
import { OmokSurrender } from '../OmokSurrender'
import { useDiceUI, selectedDice, toggleDie, canRollDice, diceCanAct, rollDice, bankDice, cancelCup,
  toggleScoreSheet, installDiceControls } from './controls'
import { eligibleDice, selectionScore } from './scoring'
import './farkle.css'

const events: Record<string, string> = { START: '굴림 대기', ROLL: '득점 주사위를 고르세요', HOT_DICE: 'HOT DICE · 이번 턴 점수를 유지하고 여섯 개를 다시 굴렸어요',
  BANK: 'BANK · 이전 차례 점수 저장', BUST: 'BUST · 이전 차례의 이번 턴 점수 소멸', TURN_TIMEOUT: '30초 만료 · 다음 차례로 넘어갔어요' }
export function FarklePanel() {
  const s = useGame(), session = useSession(useShallow(s => ({ sessionId: s.sessionId, profiles: s.profiles,
    status: s.status, pending: s.pending }))), runtime = useParkRuntime(), ui = useDiceUI()
  const spectatorView = useTableLobby(s => s.spectatorView)
  const [now, setNow] = useState(Date.now)
  useEffect(installDiceControls, [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  const g = s.game?.dice ? s.game : null, d = g?.dice
  if (!g || !d) return recoveryBlocked() ? <section className="park-runtime-panel farkle-panel" aria-label="주사위 경기">
    <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p><button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>
  </section> : null
  const spectator = g.role === 'SPECTATOR', mine = d.turnUserId === session.sessionId
  const ids = selectedDice(), points = selectionScore(d.dice, ids), eligible = eligibleDice(d.dice)
  const ready = diceCanAct(), idle = ui.cup === 'idle', remaining = d.turnDeadline ? Math.max(0, Math.ceil((Date.parse(d.turnDeadline) - now) / 1000)) : null
  const name = (id: string) => id === session.sessionId ? '나' : session.profiles[id]?.nickname ?? `참가자 ${d.players.indexOf(id) + 1}`
  return <>
    <section className="prototype-game farkle-hud farkle-panel" aria-label="주사위 경기" data-stage={d.stage}>
      <header className="farkle-title"><span>온탑 · 한 번 더, 아니면 여기까지?</span><h2>{spectator ? '주사위 한 판 관전' : '주사위 한 판'}</h2><small>FARKLE · 목표 {d.targetScore.toLocaleString()}점 · {d.round}번째 차례</small></header>
      <div className="farkle-scoreboard" aria-label="주사위 점수판">{d.players.map((id, i) => <div key={id} className={d.turnUserId === id ? 'active' : ''}>
        <span>{name(id)}</span><strong>{d.scores[i]!.toLocaleString()}점</strong>
        <progress max={d.targetScore} value={d.scores[i]} aria-label={`${name(id)} 총점`} />
      </div>)}</div>
      <div className="farkle-message"><p role="status">{d.status === 'FINISHED' ? spectator ? `${name(d.winnerUserId!)} 승리 · 경기 종료` : d.winnerUserId === session.sessionId ? '승리' : '패배'
        : `${mine && !spectator ? '내 차례' : name(d.turnUserId!) + ' 차례'} · ${events[d.lastEvent]}`}</p>
      {remaining !== null && <small>이번 차례 남은 시간 약 {remaining}초 · 재굴림으로 연장되지 않습니다.</small>}
      {remaining === 0 && <p>시간 만료 · 서버의 다음 차례를 기다리고 있습니다.</p>}
      </div>
      <section className="farkle-actions"><p>이번 턴 누적: {d.turnScore.toLocaleString()}점 · 선택 예상: {points?.toLocaleString() ?? '—'}점</p>
      <div className="farkle-dice-list" role="group" aria-label="주사위 선택">{d.dice.map(die => <button key={die.id}
        aria-label={`주사위 ${die.id + 1}: ${die.value}${die.held ? ' 보관' : ''}`} aria-pressed={ids.includes(die.id)}
        disabled={!ready || !idle || d.stage !== 'SELECTING' || die.held || !eligible.includes(die.id)} onClick={() => toggleDie(die.id)}>
        <span>{'⚀⚁⚂⚃⚄⚅'[die.value - 1]}</span><small>{die.held ? '보관' : ids.includes(die.id) ? '선택' : `${die.id + 1}번`}</small>
      </button>)}</div>
      {!spectator && d.status === 'PLAYING' && <>
        <p>{ui.cup === 'ready' ? '놓으면 굴리기 · Esc 취소' : ui.cup === 'holding' ? '컵을 잡은 채 방향을 바꾸며 흔들어 주세요 · Esc 취소'
          : ids.length && !points ? '선택한 주사위 전체가 득점 조합이어야 합니다.' : '컵을 흔들거나 R 굴리기 · Q Bank · T 점수표'}</p>
        <div className="button-row"><button disabled={!idle || !canRollDice()} onClick={rollDice}>{d.stage === 'SELECTING' ? 'R 선택 보관 후 재굴림' : 'R 굴리기'}</button>
          <button disabled={!ready || !idle || points === null || d.stage !== 'SELECTING'} onClick={bankDice}>Q Bank{points ? ` · ${(d.turnScore + points).toLocaleString()}점` : ''}</button>
          {!idle && <button onClick={cancelCup}>컵 조작 취소</button>}</div>
      </>}
      {spectator && <p>관전자는 주사위를 선택하거나 굴릴 수 없습니다.</p>}
      </section>
      <div className="mini-feedback farkle-feedback">{s.pending && <p>요청 중 · 서버의 처리 확인을 기다리고 있습니다.</p>}
      {g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 주사위 상태를 기다리고 있습니다.</p>}
      {s.uncertain && <p>반영 여부를 확인해야 합니다. 굴림·Bank를 자동 재전송하지 않습니다.</p>}
      {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}
      {s.error && <p role="alert">{s.error}</p>}
      </div>
      {d.status === 'FINISHED' && <p>종료 사유: {d.endReason === 'TARGET_REACHED' ? '목표 점수 도달' : d.endReason === 'RECONNECT_EXPIRED' ? '재접속 유예 만료' : d.endReason === 'EXPLICIT_LEAVE' ? '수동 기권' : d.endReason}</p>}
      {!spectator && d.status === 'FINISHED' && <p>{s.result ? s.result.settlementStatus === 'SETTLED' ? `정산 완료 · 내 엽전 증감 ${s.result.myCoinDelta}` : '정산 대기 중' : '결과·정산 확인 전입니다.'}</p>}
      <div className="farkle-tools"><SeatedLookButton /><button onClick={() => openManual('farkle')}>게임 설명</button><button onClick={toggleScoreSheet}>T 점수표</button>
        {!spectator && <button aria-pressed={ui.boardView} onClick={() => { cancelCup(); useDiceUI.setState({ boardView: !ui.boardView }) }}>{ui.boardView ? '착석 시점' : '주사위 판 보기'}</button>}
        <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 주사위 확인</button>
        {recoveryBlocked() && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
        {!spectator && d.status === 'FINISHED' && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
        {spectator && <button disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
      {spectator && <div className="farkle-actions" role="group" aria-label="관전 시점">
        <button aria-pressed={spectatorView === 'board'} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>공개 판 보기</button>
        <button aria-pressed={spectatorView === 'table'} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>테이블 둘러보기</button>
      </div>}
      {!spectator && <OmokSurrender key={`${session.sessionId}:${g.gameId}`} context={{ userId: session.sessionId, gameId: g.gameId, version: g.version }}
        disabled={session.pending} />}
      </div>
    </section>
    {ui.scoreOpen && <section className="park-runtime-panel farkle-rules" role="dialog" aria-label="주사위 점수표" aria-modal="true"
      onKeyDown={e => { if (e.code === 'Tab') { e.preventDefault(); e.currentTarget.querySelector('button')?.focus() } }}>
      <strong>주사위 점수표</strong><button autoFocus onClick={toggleScoreSheet}>점수표 닫기</button>
      <table><thead><tr><th>조합</th><th>점수</th></tr></thead><tbody>
        <tr><td>1 / 5 한 개</td><td>100 / 50</td></tr><tr><td>같은 눈 3개</td><td>1은 1000, 나머지는 눈 × 100</td></tr>
        <tr><td>같은 눈 4 / 5 / 6개</td><td>3개 점수 × 2 / 4 / 8</td></tr>
        <tr><td>12345 / 23456 / 123456</td><td>500 / 750 / 1500</td></tr>
      </tbody></table><p>선택한 모든 주사위가 득점 조합이어야 합니다. 이전에 보관한 주사위와 새 조합을 만들 수 없습니다.</p>
      <p>6개를 모두 사용하면 HOT DICE. BUST는 이번 턴 점수만 잃으며 Bank로 목표에 도달하면 즉시 승리합니다.</p>
      <p>이번 차례 전체 30초 · 최종 점수·주사위 눈·차례는 서버가 확정합니다.</p>
    </section>}
  </>
}
