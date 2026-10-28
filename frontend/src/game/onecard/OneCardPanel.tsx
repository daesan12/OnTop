import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useTableLobby } from '../../features/tableLobby/state'
import { OneCardForfeitDialog } from './OneCardForfeitDialog'
import { canActOneCard } from './actions'
import { cardLabel, redCard, SUITS, SUIT_GLYPH, SUIT_NAME } from './presentation'
import type { OneCardInput } from './protocol'
import { CardFace } from './CardFace'
import { FanHand } from './FanHand'
import { handScope, useOneCardUI } from './uiState'
import { useOneCardPranks } from './prankEvents'
import './onecard.css'

export function OneCardPanel() {
  const s = useGame(), session = useSession(useShallow(s => ({ sessionId: s.sessionId, roomId: s.roomId, profiles: s.profiles, status: s.status, pending: s.pending }))), runtime = useParkRuntime()
  const view = useTableLobby(s => s.spectatorView)
  const [now, setNow] = useState(Date.now)
  const selection = useOneCardUI(), prank = useOneCardPranks()
  useEffect(() => () => { useOneCardUI.setState({ scope: '', selectedId: '' }) }, [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  const g = s.game?.onecard ? s.game : null
  if (!g) return <section className="park-runtime-panel onecard-panel" aria-label="원카드 경기"><strong>원카드</strong>
    <p role="status">공개 판과 본인 손패를 확인하고 있습니다.</p>{s.error && <p role="alert">{s.error}</p>}
    <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button></section>
  const o = g.onecard, spectator = g.role === 'SPECTATOR', ownId = session.sessionId
  const scope = handScope(ownId, session.roomId, g.gameId, g.version)
  const fresh = !spectator && g.hand?.userId === ownId && session.status === 'connected' && !recoveryBlocked() && !s.uncertain && g.version >= s.awaitingVersion
  const hand = fresh ? g.hand : null, selected = selection.scope === scope ? hand?.hand.find(c => c.id === selection.selectedId) : undefined
  const can = (input: OneCardInput) => session.status === 'connected' && !session.pending && canActOneCard(ownId, input, now)
  const send = (input: OneCardInput) => { if (can(input)) void runtime.actOneCard(input) }
  const restore = () => { void runtime.restoreOneCardHand?.() }
  const name = (id: string) => id === ownId ? '나' : session.profiles[id]?.nickname ?? `참가자 ${o.players.findIndex(p => p.userId === id) + 1}`
  const remaining = o.turnDeadline ? Math.max(0, Math.ceil((Date.parse(o.turnDeadline) - now) / 1000)) : null
  const windowLeft = (until: string | null) => until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)) : 0
  const own = o.players.find(p => p.userId === ownId), finished = o.status === 'FINISHED'
  return <section className="minigame-hud onecard-panel onecard-game-hud" aria-label="원카드 경기" data-stage={o.stage} data-role={g.role}>
    {finished ? <div className="mini-status"><p role="status">{o.winnerUserIds.map(name).join(' · ')} {o.winnerUserIds.length > 1 ? '공동 승리' : '승리'}</p></div>
      : remaining !== null && <div className="onecard-turn-timer" role="timer" aria-label="차례 남은 시간" data-urgent={remaining <= 5}>
        <span>남은 시간</span><strong>{remaining}<small>초</small></strong>
      </div>}
    <div className="onecard-roster" aria-label="원카드 참가자">{o.players.map(p => <div key={p.userId} className={p.userId === o.turnUserId ? 'active' : ''}>
      <b>{name(p.userId)}{!p.active ? ' · 기권' : ''}</b><span>{p.cardCount}장</span>
      <small>{({ none: '남은 손패', pending: '원카드 선언 대기', declared: '원카드 선언!', caught: '미선언 벌칙', expired: '선언 시간 종료' })[p.oneCardStatus]}</small>
      {p.oneCardStatus === 'pending' && !finished && <small>반응 시간 약 {windowLeft(p.oneCardUntil)}초</small>}
    </div>)}</div>
    <div className="onecard-public" aria-label="바닥 카드와 공격 정보">
      <div className={`onecard-card ${redCard(o.topCard) ? 'red' : ''}`} aria-label={`바닥 카드 ${cardLabel(o.topCard)}`}><CardFace card={o.topCard} /></div>
      <div><p>현재 무늬: {SUIT_GLYPH[o.activeSuit]} {SUIT_NAME[o.activeSuit]}</p>
        {o.attackTotal > 0 && <b>누적 공격 +{o.attackTotal}장</b>}{o.lastAttack && <small>마지막 공격: {cardLabel(o.lastAttack)}</small>}</div>
    </div>
    {!spectator && !finished && <section className="mini-actions onecard-actions-panel">
      {o.stage === 'CHOOSE_SUIT' && o.turnUserId === ownId && <div className="onecard-actions" role="group" aria-label="무늬 선택">{SUITS.map(suit => <button key={suit}
        disabled={!can({ kind: 'select-suit', suit })} onClick={() => send({ kind: 'select-suit', suit })}>{SUIT_NAME[suit]} 선택 {SUIT_GLYPH[suit]}</button>)}</div>}
      {!fresh && <p>최신 공개 판과 본인 손패를 함께 확인 중입니다. 이전 패로 행동할 수 없습니다.</p>}
      {own?.active === false && <p>기권 처리되어 이번 경기에서 더 이상 행동할 수 없습니다.</p>}
      <FanHand cards={hand?.hand ?? []} playableIds={hand?.playableCardIds ?? []} flippedIds={prank.flippedIds} selectedId={selected?.id}
        canPlay={id => can({ kind: 'play', cardId: id })} restore={restore}
        select={id => useOneCardUI.setState({ scope, selectedId: selected?.id === id ? '' : id })} />
      <div className="onecard-actions onecard-primary-actions"><button className="onecard-submit" disabled={!selected || !can({ kind: 'play', cardId: selected.id })}
        onClick={() => { if (selected) send({ kind: 'play', cardId: selected.id }) }}>{selected ? `${cardLabel(selected)} 내기` : '카드를 선택하세요'}</button>
        {o.attackTotal > 0 ? <button disabled={!can({ kind: 'accept-attack' })} onClick={() => send({ kind: 'accept-attack' })}>공격 받기 · +{o.attackTotal}장</button>
          : <button disabled={!can({ kind: 'draw' })} onClick={() => send({ kind: 'draw' })}>한 장 뽑고 넘기기</button>}
        <button disabled={!prank.flippedIds.length} onClick={restore}>손패 정리{prank.flippedIds.length ? ` · ${prank.flippedIds.length}장 복구` : ''}</button>
        {own?.oneCardStatus === 'pending' && <button disabled={!can({ kind: 'declare-one' })} onClick={() => send({ kind: 'declare-one' })}>원카드! · {windowLeft(own.oneCardUntil)}초</button>}
        {o.players.filter(p => p.userId !== ownId && p.oneCardStatus === 'pending').map(p => <button key={p.userId}
          disabled={!can({ kind: 'catch-one', targetUserId: p.userId })} onClick={() => send({ kind: 'catch-one', targetUserId: p.userId })}>{name(p.userId)} 미선언 신고</button>)}
      </div>
    </section>}
    {spectator && <section className="mini-actions onecard-spectator"><h3>관전 중</h3><p>관전자는 공개 카드와 장수만 볼 수 있습니다.</p>
      {prank.enabled ? <><button disabled={prank.pending || !o.turnUserId || !!prank.effect
        || prank.usedTurn === `${o.turnUserId}/${o.turnCount}` || (prank.immune[o.turnUserId ?? ''] ?? 0) > performance.now() || o.stage !== 'PLAYING'}
        onClick={() => { if (o.turnUserId) void runtime.flipOneCardHand?.(o.turnUserId) }}>{name(o.turnUserId!)} 손패 뒤집기</button>
        <p className="onecard-prank-status" role="status">{prank.pending ? '장난 요청을 확인하고 있어요'
          : prank.effect ? `${name(prank.effect.targetUserId)}의 카드 ${prank.effect.count}장이 뒤집혔어요`
          : prank.usedTurn === `${o.turnUserId}/${o.turnCount}` ? '복구 완료 · 이번 차례의 장난은 사용했어요'
          : '현재 차례의 플레이어에게 장난을 걸 수 있어요'}</p>
        <small>최대 2장 · 대상의 한 차례에 한 번 · 선택·제출 카드는 보호됩니다.</small></>
        : <small>손패 뒤집기는 서버 연동 후 사용할 수 있습니다.</small>}
    </section>}
    <div className="mini-feedback">{s.pending && <p>요청 중 · 서버 판정 확인 중입니다.</p>}
    {g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 판과 손패를 기다리고 있습니다.</p>}
    {s.uncertain && <p>반영 여부를 확인해주세요. 카드를 자동으로 재전송하지 않습니다.</p>}
    {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}
    {s.error && <p role="alert">{s.error}</p>}
    {prank.error && <p role="alert">{prank.error}</p>}
    </div>
    {finished && <p>종료 사유: {({ EMPTY_HAND: '손패를 모두 비웠습니다.', STALEMATE: '카드 교착 · 최소 손패로 승자를 결정했습니다.', PLAYER_LEFT: '다른 참가자가 떠나 경기가 끝났습니다.' })[o.endReason!] ?? o.endReason}</p>}
    {!spectator && finished && <p>{s.result ? s.result.settlementStatus === 'SETTLED' ? `정산 완료 · 내 엽전 증감 ${s.result.myCoinDelta}` : '정산 대기 중' : '결과·정산 확인 전입니다.'}</p>}
    {(spectator || finished || recoveryBlocked() || s.uncertain || !!s.error) && <div className="onecard-recovery-controls">{spectator && <SeatedLookButton />}<div className="onecard-actions">
      {(s.uncertain || !!s.error || recoveryBlocked()) && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 원카드 확인</button>}
      {recoveryBlocked() && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
      {!spectator && finished && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
      {spectator && <button disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
    </div>
    {spectator && <div className="onecard-actions" role="group" aria-label="관전 시점"><button aria-pressed={view === 'board'} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>공개 판 보기</button>
      <button aria-pressed={view === 'table'} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>테이블 둘러보기</button></div>}
    </div>}
    {!spectator && <OneCardForfeitDialog key={`${ownId}:${g.gameId}`} gameId={g.gameId} disabled={session.pending || !fresh} />}
  </section>
}
