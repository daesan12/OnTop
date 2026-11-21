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
  const cardKinds = new URLSearchParams(location.search).get('cards') === 'all' ? CARD_KINDS : CARD_KINDS.filter(kind => ['BANG', 'MISSED', 'BEER', 'DUEL', 'JAIL', 'BARREL', 'VOLCANIC'].includes(kind))
  const cards: BangCard[] = cardKinds.map((kind, i) => ({ id: `b${i + 1}`, kind, suit: i % 2 ? 'HEARTS' : 'SPADES', rank: i % 13 + 2 }))
  const weapons = ['VOLCANIC', 'SCHOFIELD', 'REMINGTON', 'REV_CARABINE', 'WINCHESTER', 'VOLCANIC', 'SCHOFIELD'] as const
  const state: BangState = {
    gameCode: 'BANG', status: 'PLAYING', phase: 'PLAY', turnUserId: '1', actorUserId: '1',
    turnDeadline: new Date(now + 60000).toISOString(), turnNumber: 3, deckCount: 40,
    topDiscard: { id: 'b70', kind: 'MISSED', suit: 'CLUBS', rank: 11 }, store: [], lastJudgement: null,
    judgementReason: null, endReason: null, endedAt: null, winnerUserIds: [], history: ['3 · 사격', '4 · 술통 판정', '4 · 생명력 1 감소'],
    players: Array.from({ length: count }, (_, i) => ({ userId: String(i + 1), character: i === 0 ? 'SUZY_LAFAYETTE' : CHARACTERS[i]!, role: i === 2 ? 'SHERIFF' : null,
      hp: i === 2 ? 5 : 3, maxHp: i === 2 ? 5 : 4, active: true, forfeited: false,
      cardCount: i === 0 ? cards.length : i % 4 + 2, range: [1, 2, 3, 4, 5, 1, 2][i]!,
      equipment: [{ id: `b${70 + i}`, kind: weapons[i]!, suit: 'SPADES', rank: 10 }] })),
  }
  const hand: BangHand = { userId: '1', role: 'OUTLAW', hand: cards, choices: [],
    actions: [{ kind: 'end_turn' }, ...cards.filter(card => !['MISSED'].includes(card.kind)).map(card => card.kind === 'BANG' || card.kind === 'DUEL'
      ? { kind: 'play', cardId: card.id, targetUserId: '2' } : { kind: 'play', cardId: card.id })],
    distances: Object.fromEntries(state.players.map((p, i) => [p.userId, Math.min(i, count - i)])) }
  return <BangView state={state} hand={hand} ownId="1" scope="preview" now={now} names={Object.fromEntries(state.players.map((p, i) => [p.userId, i ? `총잡이 ${i + 1}` : '나']))}
    busy={false} connected error={notice} onAction={() => setNotice('선택 동작을 확인했어요. 이 화면은 서버에 행동을 보내지 않습니다.')}
    menu={<button onClick={() => location.assign('/topgol-park.html?account=101')}>실제 로컬 공원 검수</button>} />
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
