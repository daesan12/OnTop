import { record } from '../../network/protocol'
import { HANDS, type Hand } from './ledHands'

/** 서버 계약: docs/rps-roulette-api.md. 화면은 이 값을 연출만 하고 결과를 계산하지 않는다. */
export const ROULETTE = [10, 1, 2, 1, 3, 1, 2, 1, 5, 1, 1, 2, 1, 4, 1, 7, 1, 2, 1, 3, 1, 2, 1, 4, 1, 3, 1, 2, 1, 2] as const
export const FEES = [10, 20, 30] as const
export const MULTIPLIERS = [1, 2, 4] as const
export const DAILY_PLAYS = 0 // 0 means unlimited.

export type Phase = 'DUEL' | 'DECIDE' | 'SETTLED'
export interface LastDuel { duelNo: number; playerHand: Hand; machineHand: Hand; salt: string; result: 'WIN' | 'DRAW' | 'LOSE'; auto: boolean }
export interface RpsRound {
  id: string; fee: number; phase: Phase; seq: number; stakeLevel: number; multiplier: number; challenging: boolean
  duelNo: number; commitment: string | null; inputEndsAt: string | null; deadlineAt: string | null
  lastDuel: LastDuel | null; outcome: 'LOST' | 'PAID' | null; rouletteCell: number | null; rouletteValue: number | null
  payout: number; startedAt: string; settledAt: string | null
}
export interface RpsRules { fees: number[]; dailyPlays: number; multipliers: number[]; roulette: number[]; duelLimitMs: number; decideLimitMs: number; graceMs: number }
export interface RpsState { serverNow: string; availableBalance: number; playedToday: number; rules: RpsRules; round: RpsRound | null }

function invalid(): never { throw new Error('가위바위보 룰렛 응답 형식을 확인할 수 없어요.') }
const int = (v: unknown, min = 0) => Number.isSafeInteger(v) && (v as number) >= min ? v as number : invalid()
const time = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : invalid()
const optionalTime = (v: unknown) => v === null || v === undefined ? null : time(v)
const hand = (v: unknown) => HANDS.includes(v as Hand) ? v as Hand : invalid()
const ints = (v: unknown) => Array.isArray(v) ? v.map(item => int(item)) : invalid()

function lastDuel(v: unknown): LastDuel | null {
  if (v === null || v === undefined) return null
  if (!record(v) || !['WIN', 'DRAW', 'LOSE'].includes(String(v.result)) || typeof v.salt !== 'string') return invalid()
  return { duelNo: int(v.duelNo, 1), playerHand: hand(v.playerHand), machineHand: hand(v.machineHand), salt: v.salt,
    result: v.result as LastDuel['result'], auto: v.auto === true }
}

function round(v: unknown): RpsRound | null {
  if (v === null || v === undefined) return null
  if (!record(v) || typeof v.id !== 'string' || !/^[1-9]\d{0,18}$/.test(v.id)
    || !['DUEL', 'DECIDE', 'SETTLED'].includes(String(v.phase)) || typeof v.multiplier !== 'number') return invalid()
  const phase = v.phase as Phase
  const outcome = v.outcome === null || v.outcome === undefined ? null
    : v.outcome === 'LOST' || v.outcome === 'PAID' ? v.outcome : invalid()
  const cell = v.rouletteCell === null || v.rouletteCell === undefined ? null : int(v.rouletteCell)
  if (phase === 'SETTLED' ? outcome === null : outcome !== null || v.inputEndsAt == null) return invalid()
  if (cell !== null && cell >= ROULETTE.length) return invalid()
  return {
    id: v.id, fee: int(v.fee, 10), phase, seq: int(v.seq, 1), stakeLevel: int(v.stakeLevel), multiplier: v.multiplier,
    challenging: v.challenging === true, duelNo: int(v.duelNo, 1),
    commitment: typeof v.commitment === 'string' ? v.commitment : null,
    inputEndsAt: optionalTime(v.inputEndsAt), deadlineAt: optionalTime(v.deadlineAt), lastDuel: lastDuel(v.lastDuel),
    outcome, rouletteCell: cell, rouletteValue: cell === null ? null : int(v.rouletteValue, 1), payout: int(v.payout),
    startedAt: time(v.startedAt), settledAt: optionalTime(v.settledAt),
  }
}

export function parseRpsState(value: unknown): RpsState {
  if (!record(value) || !record(value.rules)) return invalid()
  const r = value.rules
  return {
    serverNow: time(value.serverNow), availableBalance: int(value.availableBalance), playedToday: int(value.playedToday),
    rules: { fees: ints(r.fees), dailyPlays: int(r.dailyPlays),
      multipliers: Array.isArray(r.multipliers) && r.multipliers.every(m => typeof m === 'number') ? r.multipliers : invalid(),
      roulette: ints(r.roulette), duelLimitMs: int(r.duelLimitMs), decideLimitMs: int(r.decideLimitMs), graceMs: int(r.graceMs) },
    round: round(value.round),
  }
}

/** 화면에 보여줄 받을 수 있는 금액 범위(최소 1칸 ~ 최대 10칸). */
export function payoutRange(fee: number, multiplier: number) {
  return [Math.round(fee * multiplier), Math.round(fee * multiplier * 10)] as const
}
