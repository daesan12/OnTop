import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BangView } from './BangView'
import { CARD_KINDS, CHARACTERS, type BangCard, type BangState, type BangHand } from './protocol'
import '../../styles.css'

/** 개발 전용 화면 fixture. 게임 규칙·인증·정산 검증은 bang-park 진입점과 BE 테스트에서 수행한다. */
function Preview() {
  const count = Math.min(7, Math.max(4, Number(new URLSearchParams(location.search).get('count')) || 7))
  const [notice, setNotice] = useState('화면 프리뷰 · 서버 미연결 · 실제 경기와 정산은 진행하지 않습니다.')
  const now = Date.now()
  const cards: BangCard[] = CARD_KINDS.slice(0, 7).map((kind, i) => ({ id: `b${i + 1}`, kind, suit: i % 2 ? 'HEARTS' : 'SPADES', rank: i + 2 }))
  const state: BangState = {
    gameCode: 'BANG', status: 'PLAYING', phase: 'PLAY', turnUserId: '1', actorUserId: '1',
    turnDeadline: new Date(now + 60000).toISOString(), turnNumber: 3, deckCount: 40,
    topDiscard: { id: 'b70', kind: 'MISSED', suit: 'CLUBS', rank: 11 }, store: [], lastJudgement: null,
    judgementReason: null, endReason: null, endedAt: null, winnerUserIds: [], history: ['3 · 뱅!', '4 · 술통 판정', '4 · 생명력 1 감소'],
    players: Array.from({ length: count }, (_, i) => ({ userId: String(i + 1), character: CHARACTERS[i]!, role: i === 2 ? 'SHERIFF' : null,
      hp: i === 2 ? 5 : 3, maxHp: i === 2 ? 5 : 4, active: true, forfeited: false,
      cardCount: i === 0 ? cards.length : i % 4 + 2, range: 1, equipment: [] })),
  }
  const hand: BangHand = { userId: '1', role: 'OUTLAW', hand: cards, choices: [],
    actions: [{ kind: 'end_turn' }, ...cards.filter(card => !['MISSED'].includes(card.kind)).map(card => card.kind === 'BANG' || card.kind === 'DUEL'
      ? { kind: 'play', cardId: card.id, targetUserId: '2' } : { kind: 'play', cardId: card.id })],
    distances: Object.fromEntries(state.players.map((p, i) => [p.userId, Math.min(i, count - i)])) }
  return <BangView state={state} hand={hand} ownId="1" scope="preview" now={now} names={Object.fromEntries(state.players.map((p, i) => [p.userId, i ? `총잡이 ${i + 1}` : '나']))}
    busy={false} connected error={notice} onAction={() => setNotice('선택 동작을 확인했어요. 이 화면은 서버에 행동을 보내지 않습니다.')}
    menu={<button onClick={() => location.assign('/bang-park.html?account=101')}>실제 로컬 공원 검수</button>} />
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
