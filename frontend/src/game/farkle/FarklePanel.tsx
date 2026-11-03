import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { openManual } from '../../features/manual/manualState'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { OmokSurrender } from '../OmokSurrender'
import { useDiceUI, selectedDice, toggleDie, canRollDice, diceCanAct, rollDice, bankDice, cancelCup,
  toggleScoreSheet, installDiceControls } from './controls'
import { eligibleDice, selectionScore } from './scoring'
import { FarkleSpectatorPanel } from './FarkleSpectatorPanel'
import { setDiceSound, useDiceSound } from './sound'
import { DiceFace } from './DiceFace'
import { FarkleScoreSheet } from './FarkleScoreSheet'
import { HudCorners, HudIcon, PlayerSeal } from './FarkleHudArt'
import './farkle.css'
import './farkleHud.css'

const events: Record<string, string> = { START: '주사위를 굴려주세요', ROLL: '득점 주사위를 고르세요', HOT_DICE: '싹쓸이! · 여섯 개를 다시 굴립니다',
  BANK: '점수를 챙겼습니다', BUST: '허탕! · 이번 턴 점수를 잃었습니다', TURN_TIMEOUT: '시간 종료 · 차례 변경' }
export function FarklePanel() {
  const spectator = useGame(s => !!s.game?.dice && s.game.role === 'SPECTATOR')
  return spectator ? <FarkleSpectatorPanel /> : <FarklePlayerPanel />
}
function FarklePlayerPanel() {
  const s = useGame(), session = useSession(useShallow(s => ({ sessionId: s.sessionId, profiles: s.profiles,
    status: s.status, pending: s.pending }))), runtime = useParkRuntime(), ui = useDiceUI()
  const sound = useDiceSound(s => s.enabled)
  const [now, setNow] = useState(Date.now)
  useEffect(installDiceControls, [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  const g = s.game?.dice ? s.game : null, d = g?.dice
  if (!g || !d) return recoveryBlocked() ? <section className="park-runtime-panel farkle-panel" aria-label="주사위 경기">
    <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p><button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>
  </section> : null
  const mine = d.turnUserId === session.sessionId
  const ids = selectedDice(), points = selectionScore(d.dice, ids), eligible = eligibleDice(d.dice)
  const ready = diceCanAct(), idle = ui.cup === 'idle', remaining = d.turnDeadline ? Math.max(0, Math.ceil((Date.parse(d.turnDeadline) - now) / 1000)) : null
  const name = (id: string) => id === session.sessionId ? '나' : session.profiles[id]?.nickname ?? `참가자 ${d.players.indexOf(id) + 1}`
  return <>
    <section className="prototype-game farkle-hud farkle-panel farkle-player-hud" aria-label="주사위 경기" data-stage={d.stage}>
      <div className="farkle-scoreboard" aria-label="주사위 점수판"><HudCorners />{d.players.map((id, i) => <div key={id} className={`farkle-player-score${d.turnUserId === id ? ' active' : ''}`}>
        <PlayerSeal active={d.turnUserId === id} />
        <span className="farkle-player-name">{d.turnUserId === id ? id === session.sessionId ? '내 차례' : `${name(id)} 차례` : name(id)}</span>
        <strong>{d.scores[i]!.toLocaleString()}<small>점</small></strong>
        <progress max={d.targetScore} value={d.scores[i]} aria-label={`${name(id)} 총점`} />
      </div>)}<span className="farkle-goal">목표 점수<strong>{d.targetScore.toLocaleString()}</strong></span></div>
      <div className="farkle-message" data-event={d.lastEvent}>
        <p role="status">{d.status === 'FINISHED' ? d.winnerUserId === session.sessionId ? '승리' : '패배'
          : `${mine ? '내 차례' : name(d.turnUserId!) + ' 차례'} · ${remaining === 0 ? '다음 차례를 기다리는 중' : events[d.lastEvent]}`}</p>
        {remaining !== null && <span className="farkle-clock" data-urgent={remaining <= 5} aria-label={`남은 시간 ${remaining}초`}>{remaining}<small>초</small></span>}
      </div>
      <section className="farkle-actions" aria-label="주사위 조작">
      <HudCorners />
      <div className="farkle-turn-points"><span>이번 턴<strong>{d.turnScore.toLocaleString()}<small>점</small></strong></span>
        <span>선택 점수<strong className="farkle-selection-points">{points === null ? '—' : `+${points.toLocaleString()}`}</strong></span>
        {d.status === 'PLAYING' && <p className="farkle-action-hint"><HudIcon kind="info" /><span>{ui.cup === 'ready' ? '컵을 놓으면 굴립니다.' : ui.cup === 'holding' ? '컵을 잡은 채 좌우로 흔들어주세요.'
          : ids.length && !points ? '득점 가능한 조합을 선택해주세요.' : d.stage === 'SELECTING' ? '점수를 선택한 후 원하는 행동을 선택하세요.' : '컵을 흔들거나 굴리기를 눌러 시작하세요.'}</span>
          {!idle && <button onClick={cancelCup}>Esc 취소</button>}</p>}
        <button className="farkle-rule-button" onClick={toggleScoreSheet} aria-keyshortcuts="T"><kbd>T</kbd> 점수표</button>
      </div>
      <div className="farkle-control-row">
      <div className="farkle-dice-list" role="group" aria-label="주사위 선택">{d.dice.map(die => <button key={die.id}
        aria-label={`주사위 ${die.id + 1}: ${die.value}${die.held ? ' 보관' : ''}`} aria-pressed={ids.includes(die.id)}
        title={`주사위 ${die.id + 1}${die.held ? ' · 보관됨' : ids.includes(die.id) ? ' · 선택 해제' : ' · 선택'}`}
        disabled={!ready || !idle || d.stage !== 'SELECTING' || die.held || !eligible.includes(die.id)} onClick={() => toggleDie(die.id)}>
        <DiceFace value={die.value} />
      </button>)}{d.dice.length === 0 && Array.from({ length: 6 }, (_, i) => <span key={i} className="farkle-empty-die" aria-hidden="true" />)}</div>
      {d.status === 'PLAYING' && <>
        <div className="button-row"><button className="farkle-roll-button" disabled={!idle || !canRollDice()} onClick={rollDice}
          aria-label={d.stage === 'SELECTING' ? 'R 한 번 더!' : 'R 굴리기'} aria-keyshortcuts="R"><HudIcon kind="dice" /><kbd>R</kbd>{d.stage === 'SELECTING' ? '한 번 더!' : '굴리기'}</button>
          <button className="farkle-bank-button" disabled={!ready || !idle || points === null || d.stage !== 'SELECTING'} onClick={bankDice}
            aria-label={`Q 점수 챙기기${points ? ` · ${(d.turnScore + points).toLocaleString()}점` : ''}`} aria-keyshortcuts="Q"><span><kbd>Q</kbd><HudIcon kind="bank" /> 점수 챙기기</span>
            <strong>{(d.turnScore + (points ?? 0)).toLocaleString()}<small>점 저장</small></strong></button></div>
      </>}
      </div>
      </section>
      <div className="mini-feedback farkle-feedback">{s.pending && <p>요청 중 · 서버의 처리 확인을 기다리고 있습니다.</p>}
      {g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 주사위 상태를 기다리고 있습니다.</p>}
      {s.uncertain && <p>반영 여부를 확인해야 합니다. 굴리기·점수 챙기기를 자동 재전송하지 않습니다.</p>}
      {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}
      {s.error && <p role="alert">{s.error}</p>}
      </div>
      {d.status === 'FINISHED' && <div className="farkle-result-note"><p>{s.result ? resultSettlement(s.result) : '결과 확인 중'}</p></div>}
      <details className="farkle-settings" onKeyDown={e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus() } }}>
      <summary aria-label="게임 설정">게임 설정 <span aria-hidden="true">···</span></summary>
      <div className="farkle-tools"><SeatedLookButton /><button onClick={() => openManual('farkle')}>게임 설명</button>
        <button aria-pressed={ui.boardView} title="상대 차례에도 주사위 판을 봅니다." onClick={() => { cancelCup(); useDiceUI.setState({ boardView: !ui.boardView }) }}>판 시점 고정</button>
        <button aria-pressed={sound} onClick={() => setDiceSound(!sound)}>소리 {sound ? '켜짐' : '꺼짐'}</button>
        <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 주사위 확인</button>
        {recoveryBlocked() && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
        {d.status === 'FINISHED' && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
      <OmokSurrender key={`${session.sessionId}:${g.gameId}`} context={{ userId: session.sessionId, gameId: g.gameId, version: g.version }} disabled={session.pending} />
      </div>
      </details>
    </section>
    <FarkleScoreSheet />
  </>
}
