import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BangAction, BangCard as Card, BangHand, BangState } from './protocol'
import { BangScene } from './BangScene'
import { BangCard } from './BangCard'
import { PlayerInfo } from './PlayerInfo'
import { actionLabel, CARD_NAME, CARD_DESCRIPTION, CARD_RULE, END_REASON, GAME_NAME, PHASE_LABEL, ROLE_NAME, cardCategory } from './presentation'
import './bang.css'

export interface BangViewProps {
  state: BangState; hand: BangHand | null; ownId: string; scope: string; now: number; busy: boolean
  connected: boolean; error: string; names: Record<string, string>; onAction(action: BangAction): void
  menu?: ReactNode; settlement?: ReactNode; chat?: ReactNode; onPing?(userId: string): void; pingedUserIds?: string[]
}

export function BangView({ state, hand, ownId, scope, now, busy, connected, error, names, onAction, menu, settlement, chat, onPing, pingedUserIds = [] }: BangViewProps) {
  const [selection, setSelection] = useState<string[]>([]), [target, setTarget] = useState(''), [actionIndex, setActionIndex] = useState(0)
  const [showLog, setShowLog] = useState(false)
  const [inspected, setInspected] = useState<Card | null>(null)
  const handSection = useRef<HTMLElement>(null)
  useEffect(() => { setSelection([]); setTarget(''); setActionIndex(0); setInspected(null) }, [scope])
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
  const detail = inspected ?? shown.find(card => selection.includes(card.id))
  return <section className="bang-panel" aria-label={`${GAME_NAME} 게임`} data-status={state.status} data-phase={state.phase}
    onKeyDown={event => { if (event.key === 'Escape' && showLog) setShowLog(false) }}>
    <BangScene state={state} ownId={ownId} />
    <header className="bang-header"><h1>{GAME_NAME}</h1><div><strong>{playing ? `${activeName}의 ${state.phase === 'RESPONSE' || state.phase === 'RESCUE' ? '응답' : '차례'}` : '경기 결과'}</strong>
      <span>{playing ? `${remaining}초` : END_REASON[state.endReason ?? '']}</span><small>{state.turnNumber}번째 턴 · 생존 {state.players.filter(player => player.active).length}명</small></div>
      <nav aria-label="게임 메뉴">{menu}<button className="bang-hand-jump" onClick={() => handSection.current?.scrollIntoView({ block: 'start' })}>내 손패</button><button onClick={() => setShowLog(value => !value)} aria-expanded={showLog}>기록·채팅</button></nav></header>
    <div className="bang-workspace">
      <aside className="bang-sidebar">
        {me && hand ? <PlayerInfo player={me} name="나" own ownRole={hand.role} turn={state.actorUserId === ownId} pinged={pingedUserIds.includes(ownId)} />
          : <section className="bang-spectator-info"><h2>관전 중</h2><p>참가자의 생명력·능력·무기를 확인할 수 있어요. 비공개 역할과 손패는 표시하지 않아요.</p></section>}
        <aside className="bang-log" data-open={showLog}><div className="bang-log-heading"><h2>기록 · 채팅</h2><button onClick={() => setShowLog(false)}>닫기</button></div>
          <ol>{state.history.map((line, index) => <li key={`${index}/${line}`}>{line.replace(/\b\d+\b/, id => names[id] ?? id).replace(/\b[A-Z][A-Z_]+\b/g, word => CARD_NAME[word as keyof typeof CARD_NAME] ?? ROLE_NAME[word as keyof typeof ROLE_NAME] ?? '게임 진행')}</li>)}</ol>{chat}</aside>
      </aside>
      <div className="bang-table-region"><div className="bang-roster-heading"><h2>참가자 정보</h2><span>상대 역할은 보안관과 탈락자만 공개돼요</span></div>
        <div className="bang-opponents" data-count={sortedOthers.length}>
          {sortedOthers.map(player => <PlayerInfo key={player.userId} player={player} name={name(player.userId)}
            distance={hand?.distances[player.userId]} turn={state.actorUserId === player.userId} pinged={pingedUserIds.includes(player.userId)}
            onPing={onPing ? () => onPing(player.userId) : undefined} />)}
        </div>
        <div className="bang-table-center"><div className="bang-deck-labels"><span>뽑는 더미 <b>{state.deckCount}장</b></span><span>버리는 더미 <b>{state.topDiscard ? CARD_NAME[state.topDiscard.kind] : '없음'}</b></span></div>
          {state.lastJudgement && <aside className="bang-judgement"><span>{state.judgementReason === 'DYNAMITE' ? '다이너마이트' : state.judgementReason === 'JAIL' ? '감옥' : state.judgementReason === 'BLACK_JACK' ? '블랙 잭' : '술통'} 판정</span><BangCard card={state.lastJudgement} compact onInspect={setInspected} /></aside>}
        </div>
      </div>
    </div>
    <footer className="bang-bottom">
      <p className="bang-notice" role="status">{!connected ? '연결이 끊겼어요. 경기 복구를 확인해주세요.' : busy ? '서버에서 행동을 확인하고 있어요.' : !hand ? `관전 중 · ${text}` : !me?.active && playing ? '탈락했어요. 팀의 승리는 경기 종료까지 결정되지 않아요.' : text}</p>
      {error && <p className="bang-error" role="alert">{error}</p>}
      <div className="bang-hand-actions"><section ref={handSection} className="bang-hand-section"><h2>{choiceCards.length ? PHASE_LABEL[state.phase] : `내 손패 · ${hand?.hand.length ?? 0}장`}<small>마우스를 올리거나 카드를 눌러 설명을 확인하세요</small></h2>
        <div className="bang-hand" role="group" aria-label={choiceCards.length ? '공개 또는 개인 선택 카드' : '내 손패'}>
          {shown.map(card => <BangCard key={card.id} card={card} selected={selection.includes(card.id)} disabled={!!lock} onSelect={hand ? () => choose(card.id) : undefined} onInspect={setInspected} />)}
          {!shown.length && <p>{hand ? '손패가 없어요.' : '상대 역할과 손패는 볼 수 없어요.'}</p>}
        </div></section>
        <section className="bang-action-panel"><div className="bang-card-inspector" aria-label="카드 설명">
          {detail ? <><h2>{CARD_NAME[detail.kind]} <small>{cardCategory(detail.kind)} 카드</small></h2><p>{CARD_DESCRIPTION[detail.kind]}</p><details><summary>자세한 사용 규칙</summary><p>{CARD_RULE[detail.kind]}</p></details></>
            : <><h2>카드 설명</h2><p>카드에 마우스를 올리거나 선택하면 효과와 사용 규칙을 확인할 수 있어요.</p></>}
        </div><div className="bang-actions" aria-label="게임 행동">
          {targets.length > 0 && <label><span>대상</span><select value={target || targets[0]} disabled={!!lock} onChange={event => { setTarget(event.target.value); setActionIndex(0) }}>{targets.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>}
          {compatible.length > 1 && <label>행동<select value={Math.min(actionIndex, compatible.length - 1)} disabled={!!lock} onChange={event => setActionIndex(Number(event.target.value))}>{compatible.map((action, i) => <option key={i} value={i}>{actionLabel(action, name)}{action.targetCardId ? ` · ${CARD_NAME[state.players.flatMap(player => player.equipment).find(card => card.id === action.targetCardId)!.kind]}` : ''}</option>)}</select></label>}
          <button className="bang-primary" disabled={!!lock || !chosen} onClick={() => chosen && onAction(chosen)}>{chosen ? actionLabel(chosen, name) : choiceCards.length ? '카드 선택' : '카드 사용'}</button>
          {global.map((action, i) => <button key={i} data-danger={action.kind === 'take_hit' || action.kind === 'give_up'} disabled={!!lock} onClick={() => onAction(action)}>{actionLabel(action, name)}</button>)}
        </div></section>
      </div>
      {settlement && <div className="bang-settlement">{settlement}</div>}
    </footer>
  </section>
}
