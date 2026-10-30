import type { Card, OneCard, Suit } from './protocol'
export { SUITS } from './protocol'
export const SUIT_GLYPH: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
export const SUIT_NAME: Record<Suit, string> = { hearts: '하트', diamonds: '다이아몬드', clubs: '클로버', spades: '스페이드' }
export const redCard = (c: Card) => c.suit === 'hearts' || c.suit === 'diamonds' || c.rank === 'joker-color'
export const cardLabel = (c: Card) => c.suit ? `${SUIT_NAME[c.suit]} ${c.rank}` : c.rank === 'joker-color' ? '컬러 조커' : '흑백 조커'
export function cardEffect(c: Card) {
  switch (c.rank) {
    case '2': return '+2 공격'
    case 'A': return c.suit === 'spades' ? '+5 공격' : '+3 공격'
    case 'joker-black': return '+5 · 무늬 선택'
    case 'joker-color': return '+7 · 무늬 선택'
    case '3': return '같은 무늬 2 방어'
    case '7': return '무늬 선택'
    case 'J': return '다음 차례 건너뛰기'
    case 'Q': return '방향 반전'
    case 'K': return '한 장 더 내기'
    default: return ''
  }
}
/** Describe the server's current stage; never infer card legality locally. */
export function oneCardGuidance(game: OneCard, ownId: string, turnName: string, playableCount: number, canDraw: boolean) {
  const mine = game.turnUserId === ownId
  if (game.stage === 'CHOOSE_SUIT') return {
    title: mine ? '무늬를 선택해주세요' : `${turnName} 무늬 선택 중`,
    hint: mine ? '아래 무늬 버튼을 눌러 차례를 마무리해주세요.' : '상대가 다음 무늬를 고르고 있어요.',
  }
  if (!mine) return { title: game.turnUserId ? `${turnName}의 차례` : '차례 확인 중', hint: '내 차례가 되면 카드를 낼 수 있어요.' }
  if (game.attackTotal > 0) return { title: `공격 +${game.attackTotal}장`, hint: '강조된 카드로 대응하거나 공격 받기를 눌러주세요.' }
  if (!playableCount) return { title: '내 차례', hint: canDraw ? '낼 수 있는 카드가 없어요. 한 장 뽑고 넘겨주세요.' : '서버의 다음 상태를 기다리고 있어요.' }
  return { title: '내 차례', hint: '같은 무늬 또는 숫자를 골라요' }
}
