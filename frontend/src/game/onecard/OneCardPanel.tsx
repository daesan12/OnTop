import { GameHudClock, GameHudMenu } from '../GameHud'
import { openManual } from '../../features/manual/manualState'
import { useEffect, useRef, useState } from 'react'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { OneCardForfeitDialog } from './OneCardForfeitDialog'
import { canActOneCard } from './actions'
import { cardLabel, cardEffect, oneCardGuidance, redCard, SUIT_GLYPH, SUIT_NAME } from './presentation'
import type { OneCardInput } from './protocol'
import { CardFace } from './CardFace'
import { FanHand } from './FanHand'
import { useChatClearance } from './useChatClearance'
import { handScope, useOneCardUI } from './uiState'
import { useOneCardPranks } from './prankEvents'
import { useOneCardDefense } from './defenseEvents'
import { OneCardDefenseOverlay } from './OneCardDefense'
import { OneCardSpectatorHands } from './OneCardSpectatorHands'
import { useHammerShortcut } from './useHammerShortcut'
import { OneCardSuitChoice } from './OneCardSuitChoice'
import { dealtCount, openingActive, openingAge, SHUFFLE_MS } from './opening'
import { useReducedMotion } from './useReducedMotion'
import './onecard.css'
import './onecardChrome.css'
import './onecardChat.css'

function ActionIcon({ kind }: { kind: 'play' | 'draw' | 'restore' }) {
  return <svg className="onecard-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'play' ? <><rect x="5" y="6" width="14" height="16" rx="2" /><path d="M12 16V2m-4 4 4-4 4 4" /></>
      : kind === 'draw' ? <><rect x="7" y="7" width="13" height="15" rx="2" /><path d="M4 17V4a2 2 0 0 1 2-2h10M11 14h5m-2.5-2.5v5" /></>
        : <><path d="M20 9a8 8 0 0 0-14-3L3 9m0-6v6h6M4 15a8 8 0 0 0 14 3l3-3m0 6v-6h-6" /></>}
  </svg>
}

export function OneCardPanel() {
  const reduced = useReducedMotion()
  const s = useGame(), session = useSession(useShallow(s => ({ sessionId: s.sessionId, roomId: s.roomId, profiles: s.profiles, status: s.status, pending: s.pending }))), runtime = useParkRuntime()
  const [now, setNow] = useState(Date.now)
  const guidanceRef = useRef<HTMLDivElement>(null)
  const [hammerHeld, setHammerHeld] = useState(false), defense = useOneCardDefense()
  const selection = useOneCardUI(), prank = useOneCardPranks()
  useEffect(() => () => { useOneCardUI.setState({ scope: '', selectedId: '' }) }, [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  const g = s.game?.onecard ? s.game : null
  useChatClearance(g?.gameId??'',g?.role==='PLAYER'&&g.onecard.status==='PLAYING')
  useEffect(() => setHammerHeld(false), [g?.gameId])
  const canUseHammer = !!g && g.role === 'PLAYER' && g.onecard.status === 'PLAYING'
    && g.hand?.userId === session.sessionId && session.status === 'connected' && !session.pending && !s.pending
    && !recoveryBlocked() && !s.uncertain && g.version >= s.awaitingVersion
    && !!g.onecard.players.find(player => player.userId === session.sessionId)?.active
  useHammerShortcut(canUseHammer, () => setHammerHeld(value => !value))
  if (!g) return <section className="park-runtime-panel onecard-panel" aria-label="원카드 경기"><strong>원카드</strong>
    <p role="status">공개 판과 본인 손패를 확인하고 있습니다.</p>{s.error && <p role="alert">{s.error}</p>}
    <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button></section>
  const o = g.onecard, spectator = g.role === 'SPECTATOR', ownId = session.sessionId
  const opening = !reduced && openingActive(o, g.version, now)
  const scope = handScope(ownId, session.roomId, g.gameId, g.version)
  const fresh = !spectator && g.hand?.userId === ownId && session.status === 'connected' && !recoveryBlocked() && !s.uncertain && g.version >= s.awaitingVersion
  const hand = fresh ? g.hand : null, selected = selection.scope === scope ? hand?.hand.find(c => c.id === selection.selectedId) : undefined
  const can = (input: OneCardInput) => session.status === 'connected' && !session.pending && canActOneCard(ownId, input)
  const send = (input: OneCardInput) => { if (can(input)) void runtime.actOneCard(input) }
  const restore = () => { void runtime.restoreOneCardHand?.() }
  const name = (id: string) => id === ownId ? '나' : session.profiles[id]?.nickname ?? `참가자 ${o.players.findIndex(p => p.userId === id) + 1}`
  const remaining = o.turnDeadline ? Math.min(o.turnTimeLimitMs / 1000, Math.max(0, Math.ceil((Date.parse(o.turnDeadline) - now) / 1000))) : null
  const windowLeft = (until: string | null) => until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)) : 0
  const own = o.players.find(p => p.userId === ownId), finished = o.status === 'FINISHED'
  const myTurn = o.turnUserId === ownId
  const ownTurn = !spectator && own?.active && myTurn && !finished
  const timeWarning = !!ownTurn && fresh && !opening && remaining !== null && remaining > 0 && remaining <= 5
  const guidance = oneCardGuidance(o, ownId, name(o.turnUserId ?? ''), hand?.playableCardIds.length ?? 0, hand?.canDraw ?? false)
  const selectedForPlay = myTurn && o.stage === 'PLAYING' ? selected : undefined
  const actionHint = !fresh ? '최신 판과 손패를 확인하고 있어요.' : s.pending ? '서버가 요청을 확인하고 있어요.'
    : remaining === 0 ? '시간이 끝났어요. 서버 판정을 기다려주세요.' : guidance.hint
  const feedback=<div className="mini-feedback">{s.pending && <p>요청 중 · 서버 판정 확인 중입니다.</p>}
    {g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 판과 손패를 기다리고 있습니다.</p>}
    {s.uncertain && <p>반영 여부를 확인해주세요. 카드를 자동으로 재전송하지 않습니다.</p>}
    {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}
    {s.error && <p role="alert">{s.error}</p>}
    {prank.error && <p role="alert">{prank.error}</p>}
    {defense.error && <p role="alert">{defense.error}</p>}
  </div>
  const recoveryControls=(spectator || finished || recoveryBlocked() || s.uncertain || !!s.error) && <div className="onecard-recovery-controls"><div className="onecard-actions">
    {(s.uncertain || !!s.error || recoveryBlocked()) && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 원카드 확인</button>}
    {recoveryBlocked() && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
    {!spectator && finished && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
  </div></div>
  return <section className="minigame-hud onecard-panel onecard-game-hud" aria-label="원카드 경기" data-stage={o.stage} data-role={g.role} data-own-turn={!!ownTurn}>
    {timeWarning && <div className="onecard-time-warning" aria-hidden="true" />}
    {opening && <div className="onecard-opening-status" role="status">{openingAge(o, g.version, now) < SHUFFLE_MS ? '카드를 섞고 있어요' : '카드를 나누고 있어요'}</div>}
    {finished ? <div className="mini-status"><p role="status">{o.winnerUserIds.map(name).join(' · ')} {o.winnerUserIds.length > 1 ? '공동 승리' : '승리'}</p></div>
      : <GameHudClock game="원카드" label={!spectator&&myTurn ? '내 차례' : `${name(o.turnUserId ?? '')}의 차례`}
          remainingMs={remaining === null ? null : Date.parse(o.turnDeadline!) - now} limitMs={o.turnTimeLimitMs} myTurn={!!ownTurn} hint={spectator?'관전 중 · 공개 정보':o.stage==='CHOOSE_SUIT'?'무늬를 선택하세요':'같은 무늬 또는 숫자를 골라요'}/>}
    {!spectator && !finished && !opening && <div key={`${o.turnUserId}/${o.turnCount}`} className="onecard-turn-cue" data-own={!!ownTurn} role="status" aria-label="현재 차례">
      <span aria-hidden="true">{ownTurn ? '◆' : '◷'}</span><strong>{ownTurn ? '내 차례' : `${name(o.turnUserId ?? '')}의 차례`}</strong>
      {ownTurn && o.stage === 'CHOOSE_SUIT' && <small>무늬를 선택하세요</small>}
    </div>}
    <div className="onecard-roster" aria-label="원카드 참가자">{o.players.map(p => <div key={p.userId} className={p.userId === o.turnUserId ? 'active' : ''}>
      <b>{name(p.userId)}{!p.active ? ' · 기권' : ''}</b><span>{p.cardCount}장</span>
      <small>{({ none: '남은 손패', pending: '원카드 선언 대기', declared: '원카드 선언!', caught: '미선언 벌칙', expired: '선언 시간 종료' })[p.oneCardStatus]}</small>
      {p.oneCardStatus === 'pending' && !finished && <small>반응 시간 약 {windowLeft(p.oneCardUntil)}초</small>}
    </div>)}</div>
    <div className="onecard-public" aria-label="바닥 카드와 공격 정보">
      <div className={`onecard-card ${redCard(o.topCard) ? 'red' : ''}`} aria-label={`바닥 카드 ${cardLabel(o.topCard)}`}><CardFace card={o.topCard} /></div>
      <div className="onecard-public-details"><span className="onecard-public-heading">현재 카드</span><p>현재 무늬: {SUIT_GLYPH[o.activeSuit]} {SUIT_NAME[o.activeSuit]}</p>
        {o.attackTotal > 0 && <b>누적 공격 +{o.attackTotal}장</b>}{o.lastAttack && <small>마지막 공격: {cardLabel(o.lastAttack)}</small>}</div>
    </div>
    {!spectator && !finished && <section className="mini-actions onecard-actions-panel">
      {!fresh && <p>최신 공개 판과 본인 손패를 함께 확인 중입니다. 이전 패로 행동할 수 없습니다.</p>}
      {own?.active === false && <p>기권 처리되어 이번 경기에서 더 이상 행동할 수 없습니다.</p>}
      <FanHand key={`${ownId}/${session.roomId}/${g.gameId}`} scope={scope} cards={reduced ? hand?.hand ?? [] : hand?.hand.slice(0, dealtCount(o, g.version, ownId, now)) ?? []} playableIds={hand?.playableCardIds ?? []} flippedIds={prank.flippedIds} selectedId={selected?.id}
        canPlay={id => can({ kind: 'play', cardId: id })} restore={restore}
        grab={id => useOneCardUI.setState({ scope, selectedId: id })} play={id => send({ kind: 'play', cardId: id })}
        select={id => useOneCardUI.setState({ scope, selectedId: selected?.id === id ? '' : id })} />
      <div className="onecard-command-tray">
      <div ref={guidanceRef} className="onecard-selection-info" role="status" aria-label="선택 카드 안내" tabIndex={-1}>
        <strong>{selectedForPlay ? cardLabel(selectedForPlay) : guidance.title}</strong>
        <span className="onecard-effect">{selectedForPlay && fresh && !s.pending && remaining !== 0 ? cardEffect(selectedForPlay) || '같은 무늬 또는 숫자로 이어갈 수 있어요' : actionHint}</span>
      </div>
      <div className="onecard-actions onecard-reaction-actions">
        {own?.oneCardStatus === 'pending' && <button disabled={!can({ kind: 'declare-one' })} onClick={() => send({ kind: 'declare-one' })}>원카드! · {windowLeft(own.oneCardUntil)}초</button>}
        {o.players.filter(p => p.userId !== ownId && p.oneCardStatus === 'pending').map(p => <button key={p.userId}
          disabled={!can({ kind: 'catch-one', targetUserId: p.userId })} onClick={() => send({ kind: 'catch-one', targetUserId: p.userId })}>{name(p.userId)} 미선언 신고</button>)}
      </div>
      {o.stage === 'CHOOSE_SUIT' && myTurn && <OneCardSuitChoice enabled={can({ kind: 'select-suit', suit: 'hearts' })}
        choose={suit => send({ kind: 'select-suit', suit })} guidance={guidanceRef} />}
      <div className="onecard-actions onecard-primary-actions" role="group" aria-label="원카드 행동">
        {o.stage === 'PLAYING' && <>
        <button className="onecard-submit" disabled={!selected || !can({ kind: 'play', cardId: selected.id })}
          onClick={() => { if (selected) send({ kind: 'play', cardId: selected.id }) }}><ActionIcon kind="play" /><span>{selected ? `${cardLabel(selected)} 내기` : '카드를 선택하세요'}</span></button>
        {o.attackTotal > 0 ? <button className="onecard-draw-action" disabled={!can({ kind: 'accept-attack' })} onClick={() => send({ kind: 'accept-attack' })}><ActionIcon kind="draw" /><span>공격 받기 · +{o.attackTotal}장</span></button>
          : <button className="onecard-draw-action" disabled={!can({ kind: 'draw' })} onClick={() => send({ kind: 'draw' })}><ActionIcon kind="draw" /><span>드로우</span></button>}</>}
        <button className="onecard-restore-action" disabled={!prank.flippedIds.length} onClick={restore}><ActionIcon kind="restore" /><span>손패 정리{prank.flippedIds.length ? ` · ${prank.flippedIds.length}장 복구` : ''}</span></button>
        <button className="onecard-hammer-action" title="우클릭으로도 뿅망치 꺼내기·내려놓기" disabled={!canUseHammer} aria-pressed={hammerHeld} onClick={() => setHammerHeld(value => !value)}><img src="/art/onecard/prank/hammer.webp" alt="" /><span>{hammerHeld ? '뿅망치 내려놓기' : '뿅망치 들기'}</span><small aria-hidden="true">우클릭</small></button>
      </div>
      </div>
      {recoveryControls}
      {feedback}
    </section>}
    {spectator && <OneCardSpectatorHands key={g.gameId} />}
    {(spectator || finished) && feedback}
    {!spectator && finished && <p>{s.result ? resultSettlement(s.result) : '결과 확인 중'}</p>}
    {(spectator || finished) && recoveryControls}
    <GameHudMenu><button onClick={()=>openManual('onecard')}>게임 설명</button>
      {!spectator && <OneCardForfeitDialog key={`${ownId}:${g.gameId}`} gameId={g.gameId} disabled={session.pending || !fresh} />}
      {spectator && <button disabled={session.pending} onClick={()=>void runtime.unwatchGame()}>관전 종료</button>}
    </GameHudMenu>
    {!spectator && !finished && <OneCardDefenseOverlay held={hammerHeld} active={fresh && !s.pending} ownId={ownId} />}
  </section>
}
