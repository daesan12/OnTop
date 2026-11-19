import { integer, record } from '../../network/protocol'

/**
 * 공개 추첨 행사 상태 계약(S3 연결용 초안).
 * - REST 현재 상태 조회는 candidates를 포함하고, WS 상태 방송은 candidates를 생략한다.
 * - 당첨자는 이미 발표된 슬롯(revealed)에만 들어 있다. 아직 발표하지 않은 결과를 담는 필드는 없다.
 * - slots 배열 순서가 발표 순서다. FE는 이 순서와 공개된 결과를 연출만 한다.
 */
export const LIVE_PHASES = ['READY', 'SPINNING', 'PAUSED', 'REVEALING', 'COMPLETED'] as const
export type LivePhase = typeof LIVE_PHASES[number]
export type LivePlace = 1 | 2 | 3
/** 등수별 최대 슬롯 수. 1등 1, 2등 2, 3등 5로 최대 8칸이다. */
export const PLACE_CAPACITY: Readonly<Record<LivePlace, number>> = { 1: 1, 2: 2, 3: 5 }
export const MAX_SLOTS = 8
const MAX_NICKNAME = 40
const MAX_PRIZE_NAME = 60

export interface LiveCandidate { nickname: string; tickets: number }
export interface LiveSlot { slotIndex: number; place: LivePlace; prizeName: string }
/** nickname이 null이면 당첨자가 없는 빈 슬롯이다. */
export interface LiveReveal { slotIndex: number; nickname: string | null }

/** 화면이 보관하는 진행 상태. 후보 목록은 별도로 보관한다. */
export interface LiveStatus {
  liveEventId: number
  version: number
  phase: LivePhase
  serverTime: string
  phaseStartedAt: string
  slots: LiveSlot[]
  /** 지금 추첨하거나 발표 중인 슬롯. READY·COMPLETED에서는 null이다. */
  currentSlotIndex: number | null
  /**
   * 현재 슬롯이 phaseStartedAt 이전까지 실제로 회전한 누적 시간(ms). 일시정지 시간은 빠진다.
   * SPINNING: 이번 회전 전 누적분(처음 시작이면 0), PAUSED: 멈춘 시점까지, REVEALING: 공개 직전까지.
   * 이 값으로 모든 화면이 같은 롤러 위치를 계산하므로 재개·새로고침 후에도 처음부터 다시 돌지 않는다.
   */
  spinElapsedMs: number
  revealed: LiveReveal[]
}

/** 전송 형식. WS 방송은 candidates를 생략한다. */
export interface LiveSnapshot extends LiveStatus { candidates?: LiveCandidate[] }

const positive = (v: unknown): v is number => integer(v) && v > 0
const index = (v: unknown): v is number => integer(v) && v >= 0
const time = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const invalid = (): never => { throw new Error('공개 추첨 상태를 확인하지 못했어요.') }

function slot(v: unknown, at: number): LiveSlot {
  if (!record(v) || v.slotIndex !== at || ![1, 2, 3].includes(v.place as number)
    || typeof v.prizeName !== 'string' || v.prizeName.length > MAX_PRIZE_NAME) return invalid()
  return { slotIndex: at, place: v.place as LivePlace, prizeName: v.prizeName }
}

function reveal(v: unknown, at: number): LiveReveal {
  if (!record(v) || v.slotIndex !== at || !(v.nickname === null || text(v.nickname, MAX_NICKNAME))) return invalid()
  return { slotIndex: at, nickname: v.nickname }
}

function candidate(v: unknown): LiveCandidate {
  if (!record(v) || !text(v.nickname, MAX_NICKNAME) || !positive(v.tickets)) return invalid()
  return { nickname: v.nickname, tickets: v.tickets }
}

/**
 * 서버 상태를 검증하고 알려진 필드만 복사한다.
 * 진행 단계와 공개 슬롯 수가 맞지 않으면(예: 회전 중인데 다음 슬롯 결과가 이미 들어 있음) 거절한다.
 */
export function parseSnapshot(v: unknown): { status: LiveStatus; candidates?: LiveCandidate[] } {
  if (!record(v) || !positive(v.liveEventId) || !positive(v.version) || !LIVE_PHASES.includes(v.phase as LivePhase)
    || !time(v.serverTime) || !time(v.phaseStartedAt) || !Array.isArray(v.slots) || v.slots.length > MAX_SLOTS
    || !Array.isArray(v.revealed) || !(v.currentSlotIndex === null || index(v.currentSlotIndex)) || !index(v.spinElapsedMs)
    || !(v.candidates === undefined || Array.isArray(v.candidates))) return invalid()
  const slots = v.slots.map(slot)
  for (const place of [1, 2, 3] as const)
    if (slots.filter(s => s.place === place).length > PLACE_CAPACITY[place]) return invalid()
  const revealed = (v.revealed as unknown[]).map(reveal)
  const phase = v.phase as LivePhase
  const current = v.currentSlotIndex as number | null
  if (revealed.length > slots.length || current !== null && current >= slots.length) return invalid()
  const consistent = phase === 'READY' ? revealed.length === 0 && current === null
    : phase === 'SPINNING' || phase === 'PAUSED' ? current === revealed.length
      : phase === 'REVEALING' ? revealed.length > 0 && current === revealed.length - 1
        : revealed.length === slots.length && current === null
  if (!consistent) return invalid()
  const status: LiveStatus = { liveEventId: v.liveEventId, version: v.version, phase, serverTime: v.serverTime,
    phaseStartedAt: v.phaseStartedAt, slots, currentSlotIndex: current,
    spinElapsedMs: phase === 'READY' || phase === 'COMPLETED' ? 0 : v.spinElapsedMs as number, revealed }
  return v.candidates === undefined ? { status } : { status, candidates: (v.candidates as unknown[]).map(candidate) }
}
