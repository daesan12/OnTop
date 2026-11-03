import { integer, record } from '../../network/protocol'

/** Server publicState of HALLI_GALLI (HalliGalliEngine.publicState). Draw pile order and contents are never sent. */
export const FRUITS = ['STRAWBERRY', 'BANANA', 'LIME', 'PLUM'] as const
export type Fruit = typeof FRUITS[number]
export const FRUIT_LABEL: Record<Fruit, string> = { STRAWBERRY: '딸기', BANANA: '바나나', LIME: '라임', PLUM: '자두' }
export const HALLI_END_REASON: Record<string, string> = {
  CARD_COUNT: '카드 수로 승부', LAST_PLAYER_STANDING: '마지막까지 남은 참가자', NO_CARDS_TO_FLIP: '공개할 카드 없음',
}
export const HALLI_EVENTS = ['FLIP', 'AUTO_FLIP', 'RING_SUCCESS', 'RING_PENALTY', 'FINAL_PENALTY'] as const
export interface FruitCard { fruit: Fruit; count: number }
export interface HalliPlayer {
  userId: string; seat: number; drawCount: number; faceUpCount: number; cardCount: number
  active: boolean; eliminated: boolean; forfeited: boolean; topCard: FruitCard | null
}
export interface HalliEvent { type: typeof HALLI_EVENTS[number]; userId: string; at: string; cardCount: number; issuedCards: number }
export interface HalliGalli {
  gameCode: 'HALLI_GALLI'; status: 'PLAYING' | 'FINISHED'; version: number
  flipTimeLimitMs: number; resultPauseMs: number
  /** null while nobody can flip: only the last bell chance is left until flipDeadline. */
  turnUserId: string | null; flipDeadline: string | null; resultUntil: string | null
  flipSeq: number; bellWindowId: number | null; issuedPenaltyCards: number; lastEvent: HalliEvent | null
  players: HalliPlayer[]; winnerUserIds: string[]; endReason: string | null; endedAt: string | null
}
export type HalliInput = { kind: 'flip' } | { kind: 'ring'; bellWindowId: number }

const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
const number = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => integer(v) && v >= min && v <= max
const invalid = (): never => { throw new Error('과일 땡 공개 상태 형식을 확인해주세요.') }

function parseCard(v: unknown): FruitCard {
  if (!record(v) || !FRUITS.includes(v.fruit as Fruit) || !number(v.count, 1, 5)) return invalid()
  return { fruit: v.fruit as Fruit, count: v.count }
}

function parsePlayer(v: unknown, seat: number): HalliPlayer {
  if (!record(v) || !id(v.userId) || v.seat !== seat || !number(v.drawCount, 0) || !number(v.faceUpCount, 0)
    || v.cardCount !== Number(v.drawCount) + Number(v.faceUpCount) || typeof v.active !== 'boolean'
    || typeof v.eliminated !== 'boolean' || typeof v.forfeited !== 'boolean' || v.active === v.eliminated
    || (v.forfeited && !v.eliminated) || (v.topCard === null) !== (v.faceUpCount === 0)) return invalid()
  return { userId: v.userId, seat, drawCount: v.drawCount, faceUpCount: v.faceUpCount, cardCount: v.cardCount as number,
    active: v.active, eliminated: v.eliminated, forfeited: v.forfeited, topCard: v.topCard === null ? null : parseCard(v.topCard) }
}

export function parseHalliGalli(p: unknown): HalliGalli {
  if (!record(p) || p.gameCode !== 'HALLI_GALLI' || !['PLAYING', 'FINISHED'].includes(String(p.status))
    || !number(p.version, 0) || !number(p.flipTimeLimitMs, 1000, 60_000) || !number(p.resultPauseMs, 0, 60_000)
    || !number(p.flipSeq, 0) || !number(p.issuedPenaltyCards, 0)
    || !(p.bellWindowId === null || number(p.bellWindowId, 1, Number(p.flipSeq)))
    || !Array.isArray(p.players) || p.players.length < 2 || p.players.length > 4
    || !Array.isArray(p.winnerUserIds) || !p.winnerUserIds.every(id)
    || !(p.resultUntil === null || date(p.resultUntil))
    || !(p.endReason === null || id(p.endReason)) || !(p.endedAt === null || date(p.endedAt))) return invalid()
  const players = p.players.map(parsePlayer)
  const userIds = players.map(player => player.userId)
  if (new Set(userIds).size !== userIds.length || !p.winnerUserIds.every(u => userIds.includes(u as string))
    || !(p.turnUserId === null || id(p.turnUserId) && userIds.includes(p.turnUserId))) return invalid()
  if (p.status === 'PLAYING' ? !date(p.flipDeadline) || p.endedAt !== null || p.endReason !== null || p.winnerUserIds.length !== 0
    : p.turnUserId !== null || p.flipDeadline !== null || p.resultUntil !== null || p.bellWindowId !== null
      || !date(p.endedAt) || !id(p.endReason) || p.winnerUserIds.length === 0) return invalid()
  let lastEvent: HalliEvent | null = null
  if (p.lastEvent !== null) {
    const e = p.lastEvent
    if (!record(e) || !HALLI_EVENTS.includes(e.type as HalliEvent['type']) || !id(e.userId) || !userIds.includes(e.userId)
      || !date(e.at) || !number(e.cardCount, 0) || !number(e.issuedCards, 0)) return invalid()
    lastEvent = { type: e.type as HalliEvent['type'], userId: e.userId, at: e.at, cardCount: e.cardCount, issuedCards: e.issuedCards }
  }
  return {
    gameCode: 'HALLI_GALLI', status: p.status as HalliGalli['status'], version: p.version,
    flipTimeLimitMs: p.flipTimeLimitMs, resultPauseMs: p.resultPauseMs,
    turnUserId: p.turnUserId as string | null, flipDeadline: p.flipDeadline as string | null, resultUntil: p.resultUntil as string | null,
    flipSeq: p.flipSeq, bellWindowId: p.bellWindowId as number | null, issuedPenaltyCards: p.issuedPenaltyCards, lastEvent,
    players, winnerUserIds: [...p.winnerUserIds] as string[], endReason: p.endReason as string | null, endedAt: p.endedAt as string | null,
  }
}
