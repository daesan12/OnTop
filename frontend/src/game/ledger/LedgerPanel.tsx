import { GameSpectatorCount } from '../GameSpectatorCount'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { openManual } from '../../features/manual/manualState'
import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { OmokSurrender } from '../OmokSurrender'
import { DiceFace } from '../farkle/DiceFace'
import { setDiceSound, useDiceSound } from '../farkle/sound'
import { installLedgerControls, installLedgerPresentation, keptDice, ledgerAnimating, rollLedger, scoreLedger,
  toggleKeep, useLedgerUI } from './controls'
import { canActLedger } from './actions'
import { useLedgerPings } from './pings'
import { CATEGORY_LABEL, LEDGER_END_REASON, type LedgerCategory } from './protocol'
import { LedgerScoreboard } from './LedgerScoreboard'
import '../farkle/scorebook.css'
import './ledger.css'


/** One 2D ledger for players and spectators. Only the click meaning differs: record vs. hint. */
export function LedgerPanel() {
  const s = useGame(), runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({ sessionId: s.sessionId, profiles: s.profiles, status: s.status, pending: s.pending })))
  const pings = useLedgerPings(), sound = useDiceSound(s => s.enabled)
  useLedgerUI(s => s.keepIds); const until = useLedgerUI(s => s.animationUntil)
  const [now, setNow] = useState(Date.now)
  const role = s.game?.ledger ? s.game.role : null
  useEffect(installLedgerPresentation, [])
  useEffect(() => role === 'PLAYER' ? installLedgerControls() : undefined, [role])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer) }, [])
  const g = s.game?.ledger ? s.game : null
  if (!g) return recoveryBlocked() ? <section className="ledger-panel" aria-label="주사위 장부">
    <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>
    <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>
  </section> : null
  const l = g.ledger, own = session.sessionId, player = g.role === 'PLAYER', playing = l.status === 'PLAYING'
  const rolling = playing && performance.now() < until
  const names = Object.fromEntries(l.players.map((p, i) => [p.userId,
    p.userId === own ? '나' : session.profiles[p.userId]?.nickname ?? `참가자 ${i + 1}`]))
  const mine = l.turnUserId === own
  const remaining = l.turnDeadline ? Math.max(0, Math.ceil((Date.parse(l.turnDeadline) - now) / 1000)) : null
  const kept = keptDice()
  const canRoll = player && canActLedger(own, { kind: 'roll', keepIds: l.rollCount ? kept : [] }) && !ledgerAnimating()
  const mode = player ? mine && l.rollCount > 0 && !rolling ? 'score' : 'view' : pings.canSend && playing ? 'ping' : 'view'
  const pick = (category: LedgerCategory) => mode === 'score' ? scoreLedger(category)
    : mode === 'ping' ? void runtime.pingLedger({ category }) : undefined
  const pickDie = (id: number) => player ? toggleKeep(id) : pings.canSend && playing && void runtime.pingLedger({ dieId: id })
  const status = !playing ? `${l.winnerUserIds.map(id => names[id]).join(' · ')} ${l.winnerUserIds.length > 1 ? '공동 승리' : '승리'}`
    : remaining === 0 ? '시간 종료 · 서버가 자동 기록하는 중'
    : rolling ? '주사위를 굴리는 중'
    : `${mine ? '내 차례' : `${names[l.turnUserId!]} 차례`} · ${l.rollCount === 0 ? '굴려 주세요' : l.rollCount < l.maxRolls
      ? `${l.maxRolls - l.rollCount}번 더 굴릴 수 있어요` : '칸을 골라 기록하세요'}`
  const scored = l.lastScored
  return <><section className="ledger-panel" aria-label="주사위 장부" data-role={g.role}>
    <header className="ledger-head">
      <div><h2>주사위 장부</h2><small>{playing ? `${l.round} / 12 라운드` : LEDGER_END_REASON[l.endReason ?? ''] ?? l.endReason}</small></div>
      {remaining !== null && <span className="ledger-clock" data-urgent={remaining <= 5} aria-label={`남은 시간 ${remaining}초`}>{remaining}<small>초</small></span>}
    </header>
    <p className="ledger-status" role="status">{status}</p>
    {scored && playing && <p className="ledger-last" aria-live="polite">
      {names[scored.userId]} · {CATEGORY_LABEL[scored.category]} {scored.points}점{scored.auto ? ' (시간 초과 자동 기록)' : ''}</p>}
    <div className="ledger-dice" role="group" aria-label={player ? '주사위 보관 선택 (1~5)' : '현재 주사위'}>
      {l.dice.length === 0 ? <small>아직 굴리지 않았어요</small> : l.dice.map(die => {
        const hinted = pings.pings.some(p => p.dieId === die.id), keep = player ? kept.includes(die.id) : die.held
        return <button key={die.id} aria-pressed={keep} data-hinted={hinted || undefined}
          disabled={player ? !mine || l.rollCount >= l.maxRolls || rolling : !(pings.canSend && playing)}
          aria-label={`주사위 ${die.id + 1}: ${rolling && !die.held ? '굴리는 중' : die.value}${keep ? ' · 보관' : ''}${hinted ? ' · 훈수' : ''}`}
          onClick={() => pickDie(die.id)}>
          {rolling && !die.held ? <span className="ledger-rolling">·</span> : <DiceFace value={die.value} />}
          <small>{player ? `${die.id + 1}${keep ? ' 보관' : ''}` : keep ? '보관' : ''}</small>
        </button>
      })}
    </div>
    {player && playing && <div className="ledger-actions">
      <button className="ledger-roll" disabled={!canRoll} onClick={rollLedger} aria-keyshortcuts="R">
        <kbd>R</kbd> {l.rollCount === 0 ? '굴리기' : '다시 굴리기'} <small>{l.rollCount}/{l.maxRolls}</small></button>
      <small>{mine ? l.rollCount ? '숫자 키 1~5로 보관 · 장부 칸을 눌러 기록' : '30초 안에 굴리고 기록하세요' : '상대 차례에는 장부를 볼 수만 있어요'}</small>
    </div>}
    <LedgerScoreboard ledger={l} names={names} ownId={own} mode={mode} pings={pings.pings} onPick={pick} />
    {!player && playing && <p className="ledger-ping-help">
      {pings.canSend ? '장부 칸이나 주사위를 눌러 훈수할 수 있어요. 기록은 참가자만 합니다.' : '관전 중 · 훈수는 승인된 관전자만 보낼 수 있어요.'}</p>}
    {pings.pings.length > 0 && <ul className="ledger-pings" aria-label="관전자 훈수">{pings.pings.map(p => <li key={p.eventId}>
      {session.profiles[p.senderUserId]?.nickname ?? '관전자'} · {p.category ? `‘${CATEGORY_LABEL[p.category]}’ 칸 추천` : `${p.dieId! + 1}번 주사위 주목`}</li>)}</ul>}
    <div className="ledger-feedback">
      {pings.notice && <p role="status">{pings.notice}</p>}
      {pings.error && <p role="alert">{pings.error}</p>}
      {s.pending && <p>요청 중 · 서버의 처리 확인을 기다리고 있습니다.</p>}
      {player && g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 장부를 기다리고 있습니다.</p>}
      {s.uncertain && <p>반영 여부를 확인해야 합니다. 굴림·기록을 자동 재전송하지 않습니다.</p>}
      {s.error && <p role="alert">{s.error}</p>}
      {player && !playing && <p>{s.result ? s.result.settlementStatus === 'SETTLED' ? `정산 완료 · 내 엽전 증감 ${s.result.myCoinDelta}` : '정산 대기 중' : '결과·정산 확인 전입니다.'}</p>}
    </div>
  </section>
  {/* 장부가 스크롤 없이 한 화면에 들어오도록 게임 설정은 왼쪽 세로 메뉴로 분리한다. */}
  <nav className="ledger-menu" aria-label="게임 메뉴"><GameSpectatorCount />
    {player && <SeatedLookButton />}
    <button onClick={() => openManual('ledger')}>게임 설명</button>
    <button aria-pressed={sound} onClick={() => setDiceSound(!sound)}>소리 {sound ? '켜짐' : '꺼짐'}</button>
    <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 장부 확인</button>
    {player && recoveryBlocked() && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
    {player && !playing && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
    {player && <OmokSurrender key={`${own}:${g.gameId}`} context={{ userId: own, gameId: g.gameId, version: g.version }} disabled={session.pending} />}
    {!player && <button disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
  </nav></>
}
