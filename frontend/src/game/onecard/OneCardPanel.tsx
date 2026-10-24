import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useTableLobby } from '../../features/tableLobby/state'
import { OmokSurrender } from '../OmokSurrender'
import { canActOneCard } from './actions'
import { cardEffect, cardLabel, redCard, SUITS, SUIT_GLYPH, SUIT_NAME } from './presentation'
import type { Card, OneCardInput } from './protocol'
import './onecard.css'

function CardFace({ card }: { card: Card }) {
  return <><span className="onecard-rank">{card.suit ? card.rank : 'JOKER'}</span><strong className="onecard-symbol">{card.suit ? SUIT_GLYPH[card.suit] : '✦'}</strong><small>{cardEffect(card)}</small></>
}
export function OneCardPanel() {
  const s = useGame(), session = useSession(useShallow(s => ({ sessionId: s.sessionId, roomId: s.roomId, profiles: s.profiles, status: s.status, pending: s.pending }))), runtime = useParkRuntime()
  const view = useTableLobby(s => s.spectatorView)
  const [now, setNow] = useState(Date.now), [selection, setSelection] = useState({ scope: '', id: '' }), [rules, setRules] = useState(false)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  const g = s.game?.onecard ? s.game : null
  if (!g) return <section className="park-runtime-panel onecard-panel" aria-label="원카드 경기"><strong>원카드</strong>
    <p role="status">공개 판과 본인 손패를 확인하고 있습니다.</p>{s.error && <p role="alert">{s.error}</p>}
    <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button></section>
  const o = g.onecard, spectator = g.role === 'SPECTATOR', ownId = session.sessionId
  const scope = `${ownId}/${session.roomId}/${g.gameId}/${g.version}`
  const fresh = !spectator && g.hand?.userId === ownId && session.status === 'connected' && !recoveryBlocked() && !s.uncertain && g.version >= s.awaitingVersion
  const hand = fresh ? g.hand : null, selected = selection.scope === scope ? hand?.hand.find(c => c.id === selection.id) : undefined
  const can = (input: OneCardInput) => session.status === 'connected' && !session.pending && canActOneCard(ownId, input, now)
  const send = (input: OneCardInput) => { if (can(input)) { setSelection({ scope: '', id: '' }); void runtime.actOneCard(input) } }
  const name = (id: string) => id === ownId ? '나' : session.profiles[id]?.nickname ?? `참가자 ${o.players.findIndex(p => p.userId === id) + 1}`
  const remaining = o.turnDeadline ? Math.max(0, Math.ceil((Date.parse(o.turnDeadline) - now) / 1000)) : null
  const windowLeft = (until: string | null) => until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)) : 0
  const own = o.players.find(p => p.userId === ownId), finished = o.status === 'FINISHED'
  return <section className="park-runtime-panel onecard-panel" aria-label="원카드 경기" data-stage={o.stage}>
    <strong>{spectator ? '원카드 관전' : '원카드'}</strong><small>2~4인 · 같은 무늬나 숫자 · 손패를 먼저 비우세요</small>
    <div className="onecard-players" aria-label="원카드 참가자">{o.players.map(p => <div key={p.userId} className={p.userId === o.turnUserId ? 'active' : ''}>
      <b>{name(p.userId)}{!p.active ? ' · 기권' : ''}</b><span>{p.cardCount}장</span>
      <small>{({ none: '남은 손패', pending: '원카드 선언 대기', declared: '원카드 선언!', caught: '미선언 벌칙', expired: '선언 시간 종료' })[p.oneCardStatus]}</small>
      {p.oneCardStatus === 'pending' && !finished && <small>반응 시간 약 {windowLeft(p.oneCardUntil)}초</small>}
      {!spectator && p.userId !== ownId && p.oneCardStatus === 'pending' && !finished && <button
        disabled={!can({ kind: 'catch-one', targetUserId: p.userId })} onClick={() => send({ kind: 'catch-one', targetUserId: p.userId })}>{name(p.userId)} 미선언 신고</button>}
    </div>)}</div>
    <p role="status">{finished ? `${o.winnerUserIds.map(name).join(' · ')} ${o.winnerUserIds.length > 1 ? '공동 승리' : '승리'}`
      : o.stage === 'CHOOSE_SUIT' ? `${name(o.turnUserId!)} · 다음 무늬를 선택하세요`
      : `${o.turnUserId === ownId && !spectator ? '내 차례' : name(o.turnUserId!) + ' 차례'}${o.extraAction ? ' · K 추가 행동' : ''}`}</p>
    <small>{o.direction === 1 ? '↻ 시계 방향' : '↺ 반시계 방향'} · 덱 {o.drawCount}장 · {o.turnCount}번째 차례</small>
    {remaining !== null && <small>이번 차례 남은 시간 약 {remaining}초 · K·무늬 선택으로 연장되지 않습니다.</small>}
    {remaining === 0 && <p>시간 만료 · 서버의 다음 상태를 기다리고 있습니다.</p>}
    <div className="onecard-public" aria-label="바닥 카드와 공격 정보">
      <div className={`onecard-card ${redCard(o.topCard) ? 'red' : ''}`} aria-label={`바닥 카드 ${cardLabel(o.topCard)}`}><CardFace card={o.topCard} /></div>
      <div><p>현재 무늬: {SUIT_GLYPH[o.activeSuit]} {SUIT_NAME[o.activeSuit]}</p>
        {o.attackTotal > 0 && <b>누적 공격 +{o.attackTotal}장</b>}{o.lastAttack && <small>마지막 공격: {cardLabel(o.lastAttack)}</small>}</div>
    </div>
    {!spectator && !finished && <>
      {o.stage === 'CHOOSE_SUIT' && o.turnUserId === ownId && <div className="onecard-actions" role="group" aria-label="무늬 선택">{SUITS.map(suit => <button key={suit}
        disabled={!can({ kind: 'select-suit', suit })} onClick={() => send({ kind: 'select-suit', suit })}>{SUIT_NAME[suit]} 선택 {SUIT_GLYPH[suit]}</button>)}</div>}
      <b>나의 손패 {hand?.hand.length ?? '—'}장</b>
      {!fresh && <p>최신 공개 판과 본인 손패를 함께 확인 중입니다. 이전 패로 행동할 수 없습니다.</p>}
      {own?.active === false && <p>기권 처리되어 이번 경기에서 더 이상 행동할 수 없습니다.</p>}
      <div className="onecard-hand" aria-label="나만 볼 수 있는 카드">{hand?.hand.map(card => <button key={card.id}
        className={`onecard-card ${redCard(card) ? 'red' : ''}`} aria-label={`${cardLabel(card)} · ${cardEffect(card)}`}
        aria-pressed={selected?.id === card.id} disabled={!can({ kind: 'play', cardId: card.id })}
        onClick={() => setSelection({ scope, id: selected?.id === card.id ? '' : card.id })}><CardFace card={card} /></button>)}</div>
      <div className="onecard-actions"><button disabled={!selected || !can({ kind: 'play', cardId: selected.id })}
        onClick={() => { if (selected) send({ kind: 'play', cardId: selected.id }) }}>{selected ? `${cardLabel(selected)} 내기` : '카드를 선택하세요'}</button>
        {o.attackTotal > 0 ? <button disabled={!can({ kind: 'accept-attack' })} onClick={() => send({ kind: 'accept-attack' })}>공격 받기 · +{o.attackTotal}장</button>
          : <button disabled={!can({ kind: 'draw' })} onClick={() => send({ kind: 'draw' })}>한 장 뽑고 넘기기</button>}
        {own?.oneCardStatus === 'pending' && <button disabled={!can({ kind: 'declare-one' })} onClick={() => send({ kind: 'declare-one' })}>원카드! · {windowLeft(own.oneCardUntil)}초</button>}</div>
      <small>낼 카드가 있어도 한 장을 뽑고 차례를 넘길 수 있어요. 뽑은 카드는 같은 차례에 낼 수 없습니다.</small>
    </>}
    {spectator && <p>관전자는 공개 카드와 장수만 볼 수 있습니다. 개인 손패·행동·개인 정산은 제공하지 않습니다.</p>}
    {s.pending && <p>요청 중 · 서버 판정 확인 중입니다.</p>}
    {g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 판과 손패를 기다리고 있습니다.</p>}
    {s.uncertain && <p>반영 여부를 확인해주세요. 카드를 자동으로 재전송하지 않습니다.</p>}
    {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}
    {s.error && <p role="alert">{s.error}</p>}
    {finished && <p>종료 사유: {({ EMPTY_HAND: '손패를 모두 비웠습니다.', STALEMATE: '카드 교착 · 최소 손패로 승자를 결정했습니다.', PLAYER_LEFT: '다른 참가자가 떠나 경기가 끝났습니다.' })[o.endReason!] ?? o.endReason}</p>}
    {!spectator && finished && <p>{s.result ? s.result.settlementStatus === 'SETTLED' ? `정산 완료 · 내 엽전 증감 ${s.result.myCoinDelta}` : '정산 대기 중' : '결과·정산 확인 전입니다.'}</p>}
    <div className="onecard-actions"><button onClick={() => setRules(!rules)} aria-expanded={rules}>원카드 규칙</button>
      <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 원카드 확인</button>
      {recoveryBlocked() && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
      {!spectator && finished && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
      {spectator && <button disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
    </div>
    {rules && <div className="onecard-rules"><p>2 +2 / A +3 / ♠A +5 / 흑백 조커 +5 / 컬러 조커 +7. 3은 마지막 2와 같은 무늬일 때 공격을 막습니다.</p>
      <p>7·조커 무늬 선택 / J 건너뛰기 / Q 역전(2인은 본인 새 차례) / K 추가 행동. 마지막 카드는 특수 효과 전에 즉시 승리합니다.</p>
      <p>차례 전체 30초, 한 장이 되면 선언·신고 3초. 먼저 승인된 반응만 유효하며 3초 만료만으로 벌칙을 받지 않습니다. 셔플·카드 효과·벌칙·승자는 서버가 결정합니다.</p></div>}
    {spectator && <div className="onecard-actions" role="group" aria-label="관전 시점"><button aria-pressed={view === 'board'} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>공개 판 보기</button>
      <button aria-pressed={view === 'table'} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>테이블 둘러보기</button></div>}
    {!spectator && !finished && <OmokSurrender key={`${ownId}:${g.gameId}`} context={{ userId: ownId, gameId: g.gameId, version: g.version }} disabled={session.pending || !fresh} />}
  </section>
}
