import { useEffect, useState, type ReactNode } from 'react'
import type { BangAction, BangCard as Card, BangHand, BangState } from './protocol'
import { BangScene } from './BangScene'
import { BangCard } from './BangCard'
import { PlayerInfo } from './PlayerInfo'
import { PlayerSummary } from './PlayerSummary'
import { InfoDialog } from './InfoDialog'
import { actionLabel, CARD_NAME, CARD_DESCRIPTION, CARD_RULE, END_REASON, GAME_NAME, PHASE_LABEL, ROLE_NAME, cardCategory } from './presentation'
import './bang.css'

export interface BangViewProps {
  state: BangState; hand: BangHand | null; ownId: string; scope: string; now: number; busy: boolean
  connected: boolean; error: string; names: Record<string, string>; onAction(action: BangAction): void
  menu?: ReactNode; settlement?: ReactNode; chat?: ReactNode; onPing?(userId: string): void; pingedUserIds?: string[]
}
type Overlay = { kind: 'player'; id: string } | { kind: 'card'; card: Card } | { kind: 'log' }

export function BangView({ state, hand, ownId, scope, now, busy, connected, error, names, onAction, menu, settlement, chat, onPing, pingedUserIds = [] }: BangViewProps) {
  const [selection, setSelection] = useState<string[]>([]), [target, setTarget] = useState(''), [actionIndex, setActionIndex] = useState(0)
  const [globalIndex, setGlobalIndex] = useState(0), [overlay, setOverlay] = useState<Overlay | null>(null)
  useEffect(() => { setSelection([]); setTarget(''); setActionIndex(0); setGlobalIndex(0); setOverlay(previous => previous?.kind === 'card' ? null : previous) }, [scope])
  const name = (id: string) => names[id] ?? '참가자'
  const me = state.players.find(player => player.userId === ownId)
  const playing = state.status === 'PLAYING'
  const actions = hand?.actions ?? []
  const lock = busy || !connected || !playing || !hand || !me?.active
  const choiceCards = state.phase === 'STORE' ? state.store : hand?.choices ?? []
  const shown = choiceCards.length ? choiceCards : hand?.hand ?? []
  const selectable = actions.filter(action => action.cardId && selection.includes(action.cardId)
    && (!action.secondCardId || selection.includes(action.secondCardId)) && (selection.length < 2 || !!action.secondCardId))
  if (selection.length === 2 && actions.some(action => action.kind === 'sid_heal'))
    selectable.push({ kind: 'sid_heal', cardId: selection[0], secondCardId: selection[1] })
  const targets = [...new Set(selectable.map(action => action.targetUserId).filter((id): id is string => !!id))]
  const compatible = selectable.filter(action => !action.targetUserId || action.targetUserId === (target || targets[0]))
  const chosen = compatible[Math.min(actionIndex, Math.max(0, compatible.length - 1))]
  const global = actions.filter(action => !action.cardId && action.kind !== 'sid_heal')
  const selectedGlobal = global[Math.min(globalIndex, Math.max(0, global.length - 1))]
  const ownIndex = Math.max(0, state.players.findIndex(player => player.userId === ownId))
  const others = state.players.filter(player => player.userId !== ownId)
  const sortedOthers = [...others].sort((a, b) => (state.players.indexOf(a) - ownIndex + state.players.length) % state.players.length
    - (state.players.indexOf(b) - ownIndex + state.players.length) % state.players.length)
  const remaining = state.turnDeadline ? Math.max(0, Math.ceil((Date.parse(state.turnDeadline) - now) / 1000)) : 0
  const activeName = state.actorUserId ? name(state.actorUserId) : ''
  const text = playing ? state.actorUserId === ownId ? PHASE_LABEL[state.phase]
    : `${activeName}의 ${state.phase === 'RESPONSE' || state.phase === 'RESCUE' ? '응답' : '차례'}를 기다리고 있어요.` : END_REASON[state.endReason ?? ''] ?? '경기 종료'
  const choose = (id: string) => {
    setSelection(previous => {
      if (previous.includes(id)) return previous.filter(card => card !== id)
      return me?.character === 'SID_KETCHUM' && !choiceCards.length ? [...previous.slice(-1), id] : [id]
    })
    setTarget(''); setActionIndex(0)
  }
  const detail = shown.find(card => selection.includes(card.id))
  const inspectedPlayer = overlay?.kind === 'player' ? state.players.find(player => player.userId === overlay.id) : null
  const notice = !connected ? '연결이 끊겼어요. 경기 복구를 확인해주세요.' : busy ? '서버에서 행동을 확인하고 있어요.'
    : !hand ? `관전 중 · ${text}` : !me?.active && playing ? '탈락했어요. 팀의 승리는 경기 종료까지 결정되지 않아요.'
      : targets.length ? '대상을 선택하고 카드를 사용하세요.' : state.phase === 'RESPONSE' && state.actorUserId === ownId && state.response
        ? `${name(state.response.sourceUserId)}의 ${CARD_NAME[state.response.kind]} · ${PHASE_LABEL.RESPONSE}${state.response.remaining > 1 ? ` (${state.response.remaining}회 필요)` : ''}` : text
  return <section className="bang-panel" aria-label={`${GAME_NAME} 게임`} data-status={state.status} data-phase={state.phase}>
    <BangScene state={state} ownId={ownId} />
    <header className="bang-header"><h1>{GAME_NAME}</h1><div><strong>{playing ? `${activeName}의 ${state.phase === 'RESPONSE' || state.phase === 'RESCUE' ? '응답' : '차례'}` : '경기 결과'}</strong>
      <span>{playing ? `${remaining}초` : END_REASON[state.endReason ?? '']}</span><small>{state.turnNumber}번째 턴 · 생존 {state.players.filter(player => player.active).length}명</small></div>
      <nav aria-label="게임 메뉴">{menu}<button onClick={() => setOverlay({ kind: 'log' })} aria-haspopup="dialog">기록·채팅</button></nav></header>
    <div className="bang-opponents" data-count={sortedOthers.length} role="group" aria-label="참가자 요약 · 누르면 상세 정보">
      {sortedOthers.map(player => <PlayerSummary key={player.userId} player={player} name={name(player.userId)}
        distance={hand?.distances[player.userId]} turn={state.actorUserId === player.userId} pinged={pingedUserIds.includes(player.userId)}
        targetable={!lock && targets.includes(player.userId)} targeted={(target || targets[0]) === player.userId && targets.includes(player.userId)}
        onTarget={() => { setTarget(player.userId); setActionIndex(0) }} onDetails={() => setOverlay({ kind: 'player', id: player.userId })} />)}
    </div>
    <div className="bang-table-center"><div className="bang-deck-labels"><span>뽑는 더미 <b>{state.deckCount}장</b></span><span>버리는 더미 <b>{state.topDiscard ? CARD_NAME[state.topDiscard.kind] : '없음'}</b></span></div>
      {state.lastJudgement && <aside className="bang-judgement"><span>{state.judgementReason === 'DYNAMITE' ? '다이너마이트' : state.judgementReason === 'JAIL' ? '감옥' : state.judgementReason === 'BLACK_JACK' ? '블랙 잭' : '술통'} 판정</span><BangCard card={state.lastJudgement} compact /></aside>}
    </div>
    <footer className="bang-bottom">
      {me && hand && <PlayerSummary player={me} name="나" own ownRole={hand.role} turn={state.actorUserId === ownId}
        pinged={pingedUserIds.includes(ownId)} onDetails={() => setOverlay({ kind: 'player', id: ownId })} />}
      {error && <p className="bang-error" role="alert">{error}</p>}
      {hand ? <div className="bang-hand-controls">
        <div className="bang-hand-heading"><h2>{choiceCards.length ? '카드 선택' : `내 손패 · ${hand.hand.length}장`}</h2><p className="bang-notice" role="status">{notice}</p></div>
        <div className="bang-hand" role="group" aria-label={choiceCards.length ? '공개 또는 개인 선택 카드' : '내 손패'}>
          {shown.map(card => <BangCard key={card.id} card={card} selected={selection.includes(card.id)} disabled={!!lock}
            onSelect={() => choose(card.id)} />)}
          {!shown.length && <p>손패가 없어요.</p>}
        </div>
        <section className="bang-actions" aria-label="게임 행동">
          {detail && <div className="bang-selected-card"><div><strong>{selection.length > 1 ? `${selection.length}장 선택` : CARD_NAME[detail.kind]}</strong><button onClick={() => setOverlay({ kind: 'card', card: detail })} aria-haspopup="dialog">설명</button></div>
            <p>{selection.length > 1 ? '선택한 카드로 할 수 있는 행동을 확인하세요.' : CARD_DESCRIPTION[detail.kind]}</p></div>}
          {targets.length > 0 && <label>대상<select value={target || targets[0]} disabled={!!lock} onChange={event => { setTarget(event.target.value); setActionIndex(0) }}>{targets.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>}
          {compatible.length > 1 && <label>행동<select value={Math.min(actionIndex, compatible.length - 1)} disabled={!!lock} onChange={event => setActionIndex(Number(event.target.value))}>{compatible.map((action, i) => <option key={i} value={i}>{actionLabel(action, name)}{action.targetCardId ? ` · ${CARD_NAME[state.players.flatMap(player => player.equipment).find(card => card.id === action.targetCardId)!.kind]}` : ''}</option>)}</select></label>}
          {(detail || !global.length) && <button className="bang-primary" disabled={!!lock || !chosen} onClick={() => chosen && onAction(chosen)}>{chosen ? actionLabel(chosen, name) : detail ? '지금은 사용할 수 없어요' : !playing ? '경기가 끝났어요' : !me?.active ? '탈락 후 관전 중' : !actions.length ? '상대 차례입니다' : '카드를 선택하세요'}</button>}
          {global.length > 2 ? <><label>뽑을 곳<select value={Math.min(globalIndex, global.length - 1)} disabled={!!lock} onChange={event => setGlobalIndex(Number(event.target.value))}>{global.map((action, i) => <option key={i} value={i}>{actionLabel(action, name)}</option>)}</select></label>
            <button className={chosen ? '' : 'bang-primary'} disabled={!!lock} onClick={() => selectedGlobal && onAction(selectedGlobal)}>선택한 곳에서 뽑기</button></>
            : global.map((action, i) => <button key={i} className={!chosen && i === 0 ? 'bang-primary' : undefined} data-danger={action.kind === 'take_hit' || action.kind === 'give_up'} disabled={!!lock} onClick={() => onAction(action)}>{actionLabel(action, name)}</button>)}
        </section>
      </div> : <p className="bang-spectator-notice" role="status">{notice}</p>}
      {settlement && <div className="bang-settlement">{settlement}</div>}
    </footer>
    {overlay && <InfoDialog title={overlay.kind === 'log' ? '기록 · 채팅' : overlay.kind === 'card' ? CARD_NAME[overlay.card.kind] : overlay.id === ownId ? '내 역할·능력' : `${name(overlay.id)} 상세 정보`} onClose={() => setOverlay(null)}>
      {overlay.kind === 'log' ? <div className="bang-log"><ol>{state.history.map((line, index) => <li key={`${index}/${line}`}>{line.replace(/\b\d+\b/, id => names[id] ?? id).replace(/\b[A-Z][A-Z_]+\b/g, word => CARD_NAME[word as keyof typeof CARD_NAME] ?? ROLE_NAME[word as keyof typeof ROLE_NAME] ?? '게임 진행')}</li>)}</ol>{chat}</div>
        : overlay.kind === 'card' ? <div className="bang-card-description"><BangCard card={overlay.card} compact /><p>{cardCategory(overlay.card.kind)} 카드 · {CARD_DESCRIPTION[overlay.card.kind]}</p><h3>사용 규칙</h3><p>{CARD_RULE[overlay.card.kind]}</p></div>
          : inspectedPlayer && <PlayerInfo player={inspectedPlayer} name={inspectedPlayer.userId === ownId ? '나' : name(inspectedPlayer.userId)}
            own={inspectedPlayer.userId === ownId && !!hand} ownRole={hand?.role} distance={inspectedPlayer.userId === ownId ? undefined : hand?.distances[inspectedPlayer.userId]}
            turn={state.actorUserId === inspectedPlayer.userId} pinged={pingedUserIds.includes(inspectedPlayer.userId)}
            onPing={onPing ? () => onPing(inspectedPlayer.userId) : undefined} />}
    </InfoDialog>}
  </section>
}
