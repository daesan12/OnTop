import { integer, record } from '../../network/protocol'

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
export type Suit = typeof SUITS[number]
export interface Card { id: string; suit: Suit | null; rank: string }
export interface OneCard {
  gameCode: 'ONE_CARD'; status: 'PLAYING' | 'FINISHED'
  players: { userId: string; cardCount: number; active: boolean; oneCardUntil: string | null; oneCardStatus: 'none' | 'pending' | 'declared' | 'caught' | 'expired' }[]
  turnUserId: string | null; turnDeadline: string | null; turnTimeLimitMs: 30000
  direction: 1 | -1; stage: 'PLAYING' | 'CHOOSE_SUIT' | 'FINISHED'; extraAction: boolean
  topCard: Card; activeSuit: Suit; drawCount: number; attackTotal: number; lastAttack: Card | null; turnCount: number
  winnerUserIds: string[]; endReason: string | null; endedAt: string | null
}
export interface Hand { userId: string; hand: Card[]; playableCardIds: string[]; canDraw: boolean }
export type OneCardInput = { kind: 'play'; cardId: string } | { kind: 'draw' | 'accept-attack' | 'declare-one' }
  | { kind: 'select-suit'; suit: Suit } | { kind: 'catch-one'; targetUserId: string }
const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
export const isSuit = (v: unknown): v is Suit => SUITS.some(s => s === v)
export function parseCard(v: unknown): Card {
  if (!record(v) || !id(v.id) || (v.suit === null
    ? !['joker-black', 'joker-color'].includes(String(v.rank)) || v.id !== v.rank
    : !isSuit(v.suit) || !['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].includes(String(v.rank)) || v.id !== `${v.suit}-${v.rank}`))
    throw new Error('원카드 카드 형식을 확인해주세요.')
  return { id: v.id, suit: v.suit as Suit | null, rank: String(v.rank) }
}
export function parseOneCard(v: unknown): OneCard {
  if (!record(v) || v.gameCode !== 'ONE_CARD' || !['PLAYING', 'FINISHED'].includes(String(v.status))
    || !Array.isArray(v.players) || v.players.length < 2 || v.players.length > 4
    || !v.players.every(p => record(p) && id(p.userId) && integer(p.cardCount) && p.cardCount <= 54 && typeof p.active === 'boolean'
      && ['none', 'pending', 'declared', 'caught', 'expired'].includes(String(p.oneCardStatus))
      && (p.oneCardUntil === null || date(p.oneCardUntil)) && (p.oneCardStatus !== 'pending' || date(p.oneCardUntil)))
    || new Set(v.players.map(p => p.userId)).size !== v.players.length
    || ![1, -1].includes(Number(v.direction)) || typeof v.direction !== 'number' || v.turnTimeLimitMs !== 30000
    || !['PLAYING', 'CHOOSE_SUIT', 'FINISHED'].includes(String(v.stage)) || typeof v.extraAction !== 'boolean'
    || !isSuit(v.activeSuit) || !integer(v.drawCount) || v.drawCount > 54 || !integer(v.attackTotal)
    || !integer(v.turnCount) || v.turnCount < 1 || !Array.isArray(v.winnerUserIds) || !v.winnerUserIds.every(id)
    || new Set(v.winnerUserIds).size !== v.winnerUserIds.length)
    throw new Error('원카드 공개 상태를 확인해주세요.')
  const players = v.players.map(p => ({ userId: String(p.userId), cardCount: Number(p.cardCount), active: Boolean(p.active),
    oneCardUntil: p.oneCardUntil as string | null, oneCardStatus: p.oneCardStatus as OneCard['players'][number]['oneCardStatus'] }))
  if (!v.winnerUserIds.every(w => players.some(p => p.userId === w))
    || (v.status === 'PLAYING' ? v.stage === 'FINISHED' || !players.some(p => p.userId === v.turnUserId && p.active)
      || !date(v.turnDeadline) || v.endedAt !== null || v.endReason !== null || v.winnerUserIds.length !== 0
      : v.stage !== 'FINISHED' || v.turnUserId !== null || v.turnDeadline !== null || !date(v.endedAt) || !id(v.endReason) || !v.winnerUserIds.length))
    throw new Error('원카드 차례·종료 상태를 확인해주세요.')
  return { gameCode: 'ONE_CARD', status: v.status as OneCard['status'], players, turnUserId: v.turnUserId as string | null,
    turnDeadline: v.turnDeadline as string | null, turnTimeLimitMs: 30000, direction: v.direction as 1 | -1,
    stage: v.stage as OneCard['stage'], extraAction: v.extraAction, topCard: parseCard(v.topCard), activeSuit: v.activeSuit,
    drawCount: v.drawCount, attackTotal: v.attackTotal, lastAttack: v.lastAttack === null ? null : parseCard(v.lastAttack), turnCount: v.turnCount,
    winnerUserIds: [...v.winnerUserIds], endReason: v.endReason as string | null, endedAt: v.endedAt as string | null }
}
/** Public and private fields arrive atomically in the same versioned GAME_STATE envelope. */
export function parseHand(v: unknown, ownId: string, publicState: OneCard): Hand {
  const own = publicState.players.find(p => p.userId === ownId)
  if (!own || !record(v) || v.userId !== ownId || !Array.isArray(v.hand) || v.hand.length !== own.cardCount
    || !Array.isArray(v.playableCardIds) || !v.playableCardIds.every(id) || typeof v.canDraw !== 'boolean')
    throw new Error('본인 손패와 공개 상태를 함께 확인해주세요.')
  const hand = v.hand.map(parseCard), playableCardIds = [...v.playableCardIds]
  if (new Set(hand.map(c => c.id)).size !== hand.length || new Set(playableCardIds).size !== playableCardIds.length
    || !playableCardIds.every(cardId => hand.some(c => c.id === cardId))
    || hand.some(c => c.id === publicState.topCard.id)) throw new Error('원카드 개인 손패를 확인해주세요.')
  return { userId: ownId, hand, playableCardIds, canDraw: v.canDraw }
}
