import { record } from '../../network/protocol'

/** 서버 계약: docs/whack-a-mole-api.md. 화면은 서버 출현표를 그리고 진행 중 점수만 계산한다. 최종 점수·지급은 서버 값이다. */
export const KEYS = ['Q', 'W', 'E', 'R', 'U', 'I', 'O', 'P'] as const
/** KeyboardEvent.code 기준. 한글 입력 상태에서도 물리 키 위치로 받는다. */
export const KEY_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyU', 'KeyI', 'KeyO', 'KeyP'] as const
export const DURATION_MS = 90_000
export const PHASE_MS = 30_000
export const POINTS_PER_COIN = 30

export type MoleKind = 'NORMAL' | 'GOLD' | 'RAPID' | 'DECOY'
export interface MoleRules {
  durationMs: number; phaseMs: number; keys: string[]; pointsPerCoin: number; normalPoints: number; goldPoints: number
  decoyPenalty: number; rapidPoints: number[]; comboSteps: number[]; comboTenths: number[]
}
export interface Mole { id: number; hole: number; kind: MoleKind; hits: number; appearAt: number; leaveAt: number }
export interface MoleRound { id: string; startedAt: string; rules: MoleRules; moles: Mole[] }
export interface MoleResult {
  id: string; score: number; maxCombo: number; caught: number; calculatedReward: number; reward: number; settledAt: string
}
export interface MoleState {
  serverNow: string; todayEarned: number; dailyCap: number; bestScore: number; rules: MoleRules; last: MoleResult | null
}
export interface MoleSettlement { result: MoleResult; todayEarned: number; dailyCap: number; bestScore: number }
export interface Hit { hole: number; at: number }

function invalid(): never { throw new Error('두더지 잡기 응답 형식을 확인할 수 없어요.') }
const int = (v: unknown, min = 0) => Number.isSafeInteger(v) && (v as number) >= min ? v as number : invalid()
const time = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : invalid()
const id = (v: unknown) => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) ? v : invalid()
const ints = (v: unknown, min = 0) => Array.isArray(v) && v.length > 0 ? v.map(item => int(item, min)) : invalid()

function rules(v: unknown): MoleRules {
  if (!record(v) || !Array.isArray(v.keys) || v.keys.length !== KEYS.length || v.keys.some((k, i) => k !== KEYS[i])) return invalid()
  return {
    durationMs: int(v.durationMs, 1), phaseMs: int(v.phaseMs, 1), keys: [...KEYS], pointsPerCoin: int(v.pointsPerCoin, 1),
    normalPoints: int(v.normalPoints), goldPoints: int(v.goldPoints), decoyPenalty: int(v.decoyPenalty),
    rapidPoints: ints(v.rapidPoints), comboSteps: ints(v.comboSteps, 1), comboTenths: ints(v.comboTenths, 1),
  }
}

function result(v: unknown): MoleResult {
  if (!record(v)) return invalid()
  return { id: id(v.id), score: int(v.score), maxCombo: int(v.maxCombo), caught: int(v.caught),
    calculatedReward: int(v.calculatedReward), reward: int(v.reward), settledAt: time(v.settledAt) }
}

function mole(v: unknown, durationMs: number): Mole {
  if (!record(v) || !['NORMAL', 'GOLD', 'RAPID', 'DECOY'].includes(String(v.kind))) return invalid()
  const hole = int(v.hole), appearAt = int(v.appearAt), leaveAt = int(v.leaveAt, appearAt + 1)
  if (hole >= KEYS.length || leaveAt > durationMs) return invalid()
  return { id: int(v.id), hole, kind: v.kind as MoleKind, hits: int(v.hits, 1), appearAt, leaveAt }
}

export function parseMoleState(value: unknown): MoleState {
  if (!record(value)) return invalid()
  return { serverNow: time(value.serverNow), todayEarned: int(value.todayEarned), dailyCap: int(value.dailyCap, 1),
    bestScore: int(value.bestScore), rules: rules(value.rules), last: value.last == null ? null : result(value.last) }
}

export function parseMoleRound(value: unknown): MoleRound {
  if (!record(value) || !Array.isArray(value.moles)) return invalid()
  const parsed = rules(value.rules)
  return { id: id(value.id), startedAt: time(value.startedAt), rules: parsed,
    moles: value.moles.map(item => mole(item, parsed.durationMs)) }
}

export function parseMoleSettlement(value: unknown): MoleSettlement {
  if (!record(value)) return invalid()
  return { result: result(value.result), todayEarned: int(value.todayEarned), dailyCap: int(value.dailyCap, 1),
    bestScore: int(value.bestScore) }
}
