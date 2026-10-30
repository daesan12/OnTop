import { integer, record } from '../../network/protocol'

/** Server order: upper six first, then the six lower categories. Docs: docs/dice-ledger.md */
export const LEDGER_CATEGORIES = ['ONES', 'TWOS', 'THREES', 'FOURS', 'FIVES', 'SIXES',
  'CHOICE', 'FOUR_OF_A_KIND', 'FULL_HOUSE', 'SMALL_STRAIGHT', 'LARGE_STRAIGHT', 'FIVE_OF_A_KIND'] as const
export type LedgerCategory = typeof LEDGER_CATEGORIES[number]
export const UPPER_CATEGORIES = LEDGER_CATEGORIES.slice(0, 6)
export const LOWER_CATEGORIES = LEDGER_CATEGORIES.slice(6)
export const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  ONES: '1', TWOS: '2', THREES: '3', FOURS: '4', FIVES: '5', SIXES: '6',
  CHOICE: '자유', FOUR_OF_A_KIND: '포카드', FULL_HOUSE: '풀하우스',
  SMALL_STRAIGHT: '스몰 스트레이트', LARGE_STRAIGHT: '라지 스트레이트', FIVE_OF_A_KIND: '장원',
}
export const CATEGORY_HINT: Record<LedgerCategory, string> = {
  ONES: '1의 눈 합', TWOS: '2의 눈 합', THREES: '3의 눈 합', FOURS: '4의 눈 합', FIVES: '5의 눈 합', SIXES: '6의 눈 합',
  CHOICE: '다섯 개 합', FOUR_OF_A_KIND: '같은 눈 4개의 합', FULL_HOUSE: '3+2 또는 같은 눈 5개 · 다섯 개 합',
  SMALL_STRAIGHT: '연속 4개 · 15점', LARGE_STRAIGHT: '연속 5개 · 30점', FIVE_OF_A_KIND: '같은 눈 5개 · 50점',
}
export const LEDGER_END_REASON: Record<string, string> = {
  ALL_CATEGORIES_FILLED: '장부 완성', LAST_PLAYER_STANDING: '다른 참가자 모두 기권',
}
export interface LedgerDie { id: number; value: number; held: boolean }
export interface LedgerCard {
  userId: string; forfeited: boolean; scores: Record<LedgerCategory, number | null>
  upperSubtotal: number; upperBonus: number; total: number
}
export interface LedgerScored { userId: string; category: LedgerCategory; points: number; auto: boolean; turnId: number }
export interface DiceLedger {
  gameCode: 'DICE_LEDGER'; status: 'PLAYING' | 'FINISHED'
  turnTimeLimitMs: number; maxRolls: number; upperBonusThreshold: number; upperBonus: number
  turnUserId: string | null; turnId: number; round: number | null; rollCount: number; rollId: number
  lastEvent: 'START' | 'ROLL' | 'SCORE' | 'TURN_TIMEOUT' | 'PLAYER_LEFT'; turnDeadline: string | null
  players: LedgerCard[]; dice: LedgerDie[]; lastScored: LedgerScored | null
  winnerUserIds: string[]; endReason: string | null; endedAt: string | null
}
export type LedgerInput = { kind: 'roll'; keepIds: number[] } | { kind: 'score'; category: LedgerCategory }
export type LedgerPingTarget = { category: LedgerCategory; dieId?: never } | { dieId: number; category?: never }

const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
const number = (v: unknown, min: number, max: number): v is number => integer(v) && v >= min && v <= max
export const isCategory = (v: unknown): v is LedgerCategory => LEDGER_CATEGORIES.includes(v as LedgerCategory)
const invalid = (): never => { throw new Error('주사위 장부 공개 상태 형식을 확인해주세요.') }

function parseCard(v: unknown): LedgerCard {
  if (!record(v) || !id(v.userId) || typeof v.forfeited !== 'boolean' || !record(v.scores)
    || Object.keys(v.scores).length !== LEDGER_CATEGORIES.length
    || !number(v.upperSubtotal, 0, 105) || ![0, 35].includes(Number(v.upperBonus)) || !number(v.total, 0, 400)) return invalid()
  const source = v.scores
  const scores = Object.fromEntries(LEDGER_CATEGORIES.map(category => {
    const value = source[category]
    if (value !== null && !number(value, 0, 50)) invalid()
    return [category, value as number | null]
  })) as LedgerCard['scores']
  return { userId: v.userId, forfeited: v.forfeited, scores, upperSubtotal: v.upperSubtotal,
    upperBonus: v.upperBonus as number, total: v.total }
}

export function parseLedger(p: unknown): DiceLedger {
  if (!record(p) || p.gameCode !== 'DICE_LEDGER' || !['PLAYING', 'FINISHED'].includes(String(p.status))
    || !number(p.turnTimeLimitMs, 1000, 120_000) || !number(p.maxRolls, 1, 5)
    || !integer(p.upperBonusThreshold) || !integer(p.upperBonus)
    || !integer(p.turnId) || !integer(p.rollId) || !number(p.rollCount, 0, Number(p.maxRolls))
    || !['START', 'ROLL', 'SCORE', 'TURN_TIMEOUT', 'PLAYER_LEFT'].includes(String(p.lastEvent))
    || !Array.isArray(p.categories) || p.categories.join() !== LEDGER_CATEGORIES.join()
    || !Array.isArray(p.players) || p.players.length < 2 || p.players.length > 4
    || !Array.isArray(p.dice) || ![0, 5].includes(p.dice.length)
    || !p.dice.every((d, i) => record(d) && d.id === i && number(d.value, 1, 6) && typeof d.held === 'boolean')
    || !Array.isArray(p.winnerUserIds) || !p.winnerUserIds.every(id)
    || !(p.endReason === null || id(p.endReason)) || !(p.endedAt === null || date(p.endedAt))) return invalid()
  const players = p.players.map(parseCard)
  const userIds = players.map(card => card.userId)
  if (new Set(userIds).size !== userIds.length || !p.winnerUserIds.every(u => userIds.includes(u as string))) return invalid()
  if (p.status === 'PLAYING' ? !id(p.turnUserId) || !userIds.includes(p.turnUserId) || !date(p.turnDeadline)
      || !number(p.round, 1, 12) || p.endedAt !== null || p.endReason !== null || p.winnerUserIds.length !== 0
      || (p.rollCount === 0) !== (p.dice.length === 0)
    : p.turnUserId !== null || p.turnDeadline !== null || p.round !== null || !date(p.endedAt) || !id(p.endReason)
      || p.winnerUserIds.length === 0) return invalid()
  let lastScored: LedgerScored | null = null
  if (p.lastScored !== null) {
    const s = p.lastScored
    if (!record(s) || !id(s.userId) || !userIds.includes(s.userId) || !isCategory(s.category) || !number(s.points, 0, 50)
      || typeof s.auto !== 'boolean' || !integer(s.turnId)) return invalid()
    lastScored = { userId: s.userId, category: s.category, points: s.points, auto: s.auto, turnId: s.turnId }
  }
  return {
    gameCode: 'DICE_LEDGER', status: p.status as DiceLedger['status'], turnTimeLimitMs: p.turnTimeLimitMs,
    maxRolls: p.maxRolls, upperBonusThreshold: p.upperBonusThreshold, upperBonus: p.upperBonus,
    turnUserId: p.turnUserId as string | null, turnId: p.turnId, round: p.round as number | null,
    rollCount: p.rollCount, rollId: p.rollId, lastEvent: p.lastEvent as DiceLedger['lastEvent'],
    turnDeadline: p.turnDeadline as string | null, players,
    dice: p.dice.map(d => ({ id: Number(d.id), value: Number(d.value), held: Boolean(d.held) })), lastScored,
    winnerUserIds: [...p.winnerUserIds] as string[], endReason: p.endReason as string | null, endedAt: p.endedAt as string | null,
  }
}
