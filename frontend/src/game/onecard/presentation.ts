import type { Card, Suit } from './protocol'
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
