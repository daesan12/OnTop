import { record } from '../../network/protocol'

/** 서버 계약: docs/plus-minus-api.md. 화면은 서버가 정한 칸을 연출만 하고 결과를 계산하지 않는다. */
export const JACKPOT = -1
export const FIRST_REEL = [7, 0, 3, 1, 5, 2, 0, 4, 1, 2, 8, 0, 3, 1, 6, 2] as const
export const OPERATOR_REEL = ['+', '-', '+', '-', '+', '-', '+', '-'] as const
export const SECOND_REEL = [JACKPOT, 1, 4, 0, 2, 9, 1, 3, 2, 6, 0, 1, 5, 2, 8, 3] as const
export const FEE = 30
export const DAILY_PLAYS = 0 // 0 means unlimited.

export type Operator = '+' | '-'
export type Outcome = 'LOST' | 'PAID' | 'JACKPOT'
export interface PlusMinusRound {
  id: string; firstCell: number; operatorCell: number; secondCell: number
  first: number; operator: Operator; second: number; result: number | null; outcome: Outcome; payout: number; playedAt: string
}
export interface PlusMinusRules {
  fee: number; dailyPlays: number; firstReel: number[]; operatorReel: Operator[]; secondReel: number[]
  pointPayout: number; jackpotFirst: number; jackpotPayout: number
}
export interface PlusMinusState { serverNow: string; availableBalance: number; playedToday: number; rules: PlusMinusRules; round: PlusMinusRound | null }

function invalid(): never { throw new Error('더하기 빼기 아케이드 응답 형식을 확인할 수 없어요.') }
const int = (v: unknown, min = 0) => Number.isSafeInteger(v) && (v as number) >= min ? v as number : invalid()
const time = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : invalid()
const operator = (v: unknown) => v === '+' || v === '-' ? v : invalid()
const reel = (v: unknown, min: number) => Array.isArray(v) && v.length > 0 ? v.map(item => int(item, min)) : invalid()

function round(v: unknown, rules: PlusMinusRules): PlusMinusRound | null {
  if (v === null || v === undefined) return null
  if (!record(v) || typeof v.id !== 'string' || !/^[1-9]\d{0,18}$/.test(v.id)
    || !['LOST', 'PAID', 'JACKPOT'].includes(String(v.outcome))) return invalid()
  const firstCell = int(v.firstCell), operatorCell = int(v.operatorCell), secondCell = int(v.secondCell)
  if (firstCell >= rules.firstReel.length || operatorCell >= rules.operatorReel.length || secondCell >= rules.secondReel.length)
    return invalid()
  const result = v.result === null || v.result === undefined ? null
    : Number.isSafeInteger(v.result) ? v.result as number : invalid()
  return {
    id: v.id, firstCell, operatorCell, secondCell, first: int(v.first), operator: operator(v.operator),
    second: int(v.second, JACKPOT), result, outcome: v.outcome as Outcome, payout: int(v.payout), playedAt: time(v.playedAt),
  }
}

export function parsePlusMinusState(value: unknown): PlusMinusState {
  if (!record(value) || !record(value.rules)) return invalid()
  const r = value.rules
  const rules: PlusMinusRules = {
    fee: int(r.fee, 1), dailyPlays: int(r.dailyPlays), firstReel: reel(r.firstReel, 0),
    operatorReel: Array.isArray(r.operatorReel) && r.operatorReel.length > 0 ? r.operatorReel.map(operator) : invalid(),
    secondReel: reel(r.secondReel, JACKPOT), pointPayout: int(r.pointPayout, 1), jackpotFirst: int(r.jackpotFirst),
    jackpotPayout: int(r.jackpotPayout, 1),
  }
  return {
    serverNow: time(value.serverNow), availableBalance: int(value.availableBalance), playedToday: int(value.playedToday),
    rules, round: round(value.round, rules),
  }
}

export const reelLabel = (value: number) => value === JACKPOT ? 'JACKPOT' : String(value)
export const operatorLabel = (value: Operator) => value === '+' ? '+' : '−'
