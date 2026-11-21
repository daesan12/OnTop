import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { BangAction, BangHand, BangState } from './protocol'
import { BangScene } from './BangScene'
import { BangCard, artStyle } from './BangCard'
import { actionLabel, CARD_NAME, CHARACTER, END_REASON, PHASE_LABEL, ROLE_GOAL, ROLE_NAME } from './presentation'
import './bang.css'

export interface BangViewProps {
  state: BangState; hand: BangHand | null; ownId: string; scope: string; now: number; busy: boolean
  connected: boolean; error: string; names: Record<string, string>; onAction(action: BangAction): void
  menu?: ReactNode; settlement?: ReactNode; chat?: ReactNode; onPing?(userId: string): void; pingedUserIds?: string[]
}

export function BangView({ state, hand, ownId, scope, now, busy, connected, error, names, onAction, menu, settlement, chat, onPing, pingedUserIds = [] }: BangViewProps) {
  const [selection, setSelection] = useState<string[]>([]), [target, setTarget] = useState(''), [actionIndex, setActionIndex] = useState(0)
  const [showLog, setShowLog] = useState(false)
  useEffect(() => { setSelection([]); setTarget(''); setActionIndex(0) }, [scope])
  const name = (id: string) => names[id] ?? '참가자'
  const me = state.players.find(player => player.userId === ownId)
  const playing = state.status === 'PLAYING'
  const actions = hand?.actions ?? []
  const lock = busy || !connected || !playing || !hand || !me?.active
  const choiceCards = state.phase === 'STORE' ? state.store : hand?.choices ?? []
  const shown = choiceCards.length ? choiceCards : hand?.hand ?? []
  const selectable = actions.filter(action => action.cardId && selection.includes(action.cardId)
    && (!action.secondCardId || selection.includes(action.secondCardId)))
  if (selection.length === 2 && actions.some(action => action.kind === 'sid_heal'))
    selectable.push({ kind: 'sid_heal', cardId: selection[0], secondCardId: selection[1] })
  const targets = [...new Set(selectable.map(action => action.targetUserId).filter((id): id is string => !!id))]
  const compatible = selectable.filter(action => !action.targetUserId || action.targetUserId === (target || targets[0]))
  const chosen = compatible[Math.min(actionIndex, Math.max(0, compatible.length - 1))]
  const global = actions.filter(action => !action.cardId && action.kind !== 'sid_heal')
  const ownIndex = Math.max(0, state.players.findIndex(player => player.userId === ownId))
  const others = state.players.filter(player => player.userId !== ownId)
  const sortedOthers = [...others].sort((a, b) => (state.players.indexOf(a) - ownIndex + state.players.length) % state.players.length
    - (state.players.indexOf(b) - ownIndex + state.players.length) % state.players.length)
  const remaining = state.turnDeadline ? Math.max(0, Math.ceil((Date.parse(state.turnDeadline) - now) / 1000)) : 0
  const activeName = state.actorUserId ? name(state.actorUserId) : ''
  const text = playing ? state.actorUserId === ownId ? `내 차례 · ${PHASE_LABEL[state.phase]}`
    : `${activeName} · ${PHASE_LABEL[state.phase]}` : END_REASON[state.endReason ?? ''] ?? '경기 종료'
  const choose = (id: string) => {
    setSelection(previous => {
      if (previous.includes(id)) return previous.filter(card => card !== id)
      return me?.character === 'SID_KETCHUM' && !choiceCards.length ? [...previous.slice(-1), id] : [id]
    })
    setTarget(''); setActionIndex(0)
  }
  return <section className="bang-panel" aria-label="뱅! 게임" data-status={state.status} data-phase={state.phase}>
    <BangScene state={state} ownId={ownId} />
    <header className="bang-header"><h1>뱅!</h1><div><strong>{playing ? `${activeName}의 ${state.phase === 'RESPONSE' || state.phase === 'RESCUE' ? '응답' : '차례'}` : '경기 결과'}</strong>
      <span>{playing ? `남은 시간 ${remaining}초` : END_REASON[state.endReason ?? '']}</span></div><nav aria-label="뱅 게임 메뉴">{menu}<button onClick={() => setShowLog(value => !value)} aria-expanded={showLog}>기록·채팅</button></nav></header>
    <div className="bang-opponents" data-count={sortedOthers.length}>
      {sortedOthers.map((player, index) => <article key={player.userId} className="bang-opponent" data-active={player.active} data-turn={state.actorUserId === player.userId}
        data-ping={pingedUserIds.includes(player.userId)} style={{ '--seat': index } as CSSProperties}>
        <div className="bang-person"><span className="bang-role-seal" style={artStyle(player.role === 'SHERIFF' ? 22 : 23)} aria-hidden="true" />
          <div><strong title={name(player.userId)}>{name(player.userId)}</strong><span>{player.role ? ROLE_NAME[player.role] : '정체 비공개'}{!player.active && ' · 탈락'}</span></div>
          {onPing && <button className="bang-ping-button" onClick={() => onPing(player.userId)} aria-label={`${name(player.userId)} 위치 표시`}>◎</button>}</div>
        <p className="bang-life" aria-label={`생명력 ${player.hp} / ${player.maxHp}`}><span aria-hidden="true">{Array.from({ length: player.maxHp }, (_, i) => <i key={i} data-empty={i >= player.hp} />)}</span><b>{Math.max(0, player.hp)}/{player.maxHp}</b><small>손패 {player.cardCount}장</small></p>
        <p className="bang-character" title={CHARACTER[player.character][1]}>{CHARACTER[player.character][0]} · 사거리 {player.range}{hand && player.active ? ` · 거리 ${hand.distances[player.userId]}` : ''}</p>
        <div className="bang-equipment">{player.equipment.map(card => <span key={card.id} title={CARD_NAME[card.kind]}>{CARD_NAME[card.kind]}</span>)}</div>
      </article>)}
    </div>
    <aside className="bang-log" data-open={showLog}><h2>행동 기록</h2><ol>{state.history.map((line, index) => <li key={`${index}/${line}`}>{line.replace(/\b\d+\b/, id => names[id] ?? id).replace(/\b[A-Z][A-Z_]+\b/g, word => CARD_NAME[word as keyof typeof CARD_NAME] ?? ROLE_NAME[word as keyof typeof ROLE_NAME] ?? word)}</li>)}</ol>{chat}</aside>
    <div className="bang-deck-labels"><span>뽑는 더미 ({state.deckCount}장)</span><span>버리는 더미{state.topDiscard ? ` · ${CARD_NAME[state.topDiscard.kind]}` : ''}</span></div>
    {state.lastJudgement && <aside className="bang-judgement"><span>{state.judgementReason === 'DYNAMITE' ? '다이너마이트' : state.judgementReason === 'JAIL' ? '감옥' : state.judgementReason === 'BLACK_JACK' ? '블랙 잭' : '술통'} 판정</span><BangCard card={state.lastJudgement} compact /></aside>}
    <footer className="bang-bottom">
      <p className="bang-notice" role="status">{!connected ? '연결이 끊겼어요. 경기 복구를 확인해주세요.' : busy ? '서버에서 행동을 확인하고 있어요.' : !hand ? `관전 중 · ${text}` : !me?.active && playing ? '탈락했어요. 팀의 승리는 경기 종료까지 결정되지 않아요.' : text}</p>
      {error && <p className="bang-error" role="alert">{error}</p>}
      <div className="bang-hand-actions">
        <div className="bang-hand" role="group" aria-label={choiceCards.length ? '공개 또는 개인 선택 카드' : '내 손패'}>
          {shown.map(card => <BangCard key={card.id} card={card} selected={selection.includes(card.id)} disabled={!!lock} onSelect={hand ? () => choose(card.id) : undefined} />)}
          {!shown.length && <p>{hand ? '손패가 없어요.' : '상대 역할과 손패는 볼 수 없어요.'}</p>}
        </div>
        <div className="bang-actions" aria-label="뱅 게임 행동">
          {targets.length > 0 && <label>대상<select value={target || targets[0]} disabled={!!lock} onChange={event => { setTarget(event.target.value); setActionIndex(0) }}>{targets.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>}
          {compatible.length > 1 && <label>행동<select value={Math.min(actionIndex, compatible.length - 1)} disabled={!!lock} onChange={event => setActionIndex(Number(event.target.value))}>{compatible.map((action, i) => <option key={i} value={i}>{actionLabel(action, name)}{action.targetCardId ? ` · ${CARD_NAME[state.players.flatMap(player => player.equipment).find(card => card.id === action.targetCardId)!.kind]}` : ''}</option>)}</select></label>}
          <button className="bang-primary" disabled={!!lock || !chosen} onClick={() => chosen && onAction(chosen)}>{chosen ? actionLabel(chosen, name) : choiceCards.length ? '카드 선택' : '카드 사용'}</button>
          {global.map((action, i) => <button key={i} data-danger={action.kind === 'take_hit' || action.kind === 'give_up'} disabled={!!lock} onClick={() => onAction(action)}>{actionLabel(action, name)}</button>)}
        </div>
      </div>
      <div className="bang-own" data-ping={pingedUserIds.includes(ownId)}><strong>{hand ? `나 · ${ROLE_NAME[hand.role]}` : '관전 중'}</strong>{me && <span>생명력 {Math.max(0, me.hp)}/{me.maxHp} · {CHARACTER[me.character][0]} · 사거리 {me.range}</span>}
        {pingedUserIds.includes(ownId) && <span role="status">관전자가 나를 가리켰어요</span>}
        <small>{hand ? ROLE_GOAL[hand.role] : '공개 정보만 표시합니다.'}</small>{me && <small>{CHARACTER[me.character][1]}</small>}{settlement}</div>
    </footer>
  </section>
}
