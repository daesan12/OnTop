import { record, integer } from '../../network/protocol'
import { courseBlockIndex } from './course'

export const TIP_KEYS = ['START_SPOT', 'RUN_STARTED', 'FIRST_GATE', 'FIRST_FALL', 'FINAL_PAD'] as const
export type TipKey = typeof TIP_KEYS[number]
export type EndReason = 'FINISH' | 'FALL' | 'LAKE' | 'DISCONNECT' | 'TIMEOUT' | 'RESET' | 'LEFT'
export interface RunView { runId: string; elapsedMs: number; gatesPassed: number; finalReached: boolean; maxHeight: number; runCoins: number }
interface Scope { channelId: string; mapVersion: string }
interface Ordered extends Scope { revision: number }
interface Earnings { todayEarned: number; dailyCap: number; earningsDate: string }
/** 끊긴 동안 끝난 최근 판. 서버가 종료 후 잠시만 status에 싣는 선택 필드다. */
export interface LastRunView extends RunView { reason: EndReason; finishMs?: number | null; bestFinishMs?: number | null; newBest?: boolean | null }
export interface JumpStatus extends Ordered, Earnings {
  enabled: boolean; rulesVersion: string; courseVersion: string; isFirstRun: boolean; seenTips: TipKey[]
  activeRunId: string | null; activeRun?: RunView | null; bestFinishMs: number | null; lastRun?: LastRunView | null
}
export type JumpEvent =
  | (Ordered & Earnings & { type: 'JUMPMAP_STARTED'; runId: string; rulesVersion: string; courseVersion: string; serverTime: number })
  | (Ordered & Earnings & { type: 'JUMPMAP_GATE'; runId: string; gate: number; elapsedMs: number; coinsCalculated: number; coinsGranted: number | null; pending: boolean; runCoins: number })
  | (Ordered & Earnings & { type: 'JUMPMAP_GATE_SETTLED'; runId: string; gate: number; coinsGranted: number; runCoins: number })
  | (Ordered & { type: 'JUMPMAP_FINAL_PAD'; runId: string })
  | (Ordered & Earnings & { type: 'JUMPMAP_ENDED'; runId: string; reason: EndReason; gatesPassed: number; maxHeight: number; runCoins: number; elapsedMs: number; finishMs?: number; bestFinishMs?: number | null; newBest?: boolean })
  | (Scope & { type: 'JUMPMAP_STEP'; playerId: string; block: number })

const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const money = (v: unknown) => integer(v) && v <= 250
const earnings = (p: Record<string, unknown>) => integer(p.todayEarned) && p.todayEarned <= 500 && p.dailyCap === 500 && typeof p.earningsDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.earningsDate)
const scope = (p: Record<string, unknown>) => text(p.channelId) && typeof p.mapVersion === 'string' && /^[a-f0-9]{64}$/.test(p.mapVersion)
const gate = (g: unknown) => integer(g) && g >= 1 && g <= 7
const run = (r: unknown): r is RunView => record(r) && text(r.runId) && finite(r.elapsedMs) && integer(r.gatesPassed) && r.gatesPassed <= 7 && typeof r.finalReached === 'boolean' && finite(r.maxHeight) && money(r.runCoins)
const REASONS = ['FINISH', 'FALL', 'LAKE', 'DISCONNECT', 'TIMEOUT', 'RESET', 'LEFT']
const lastRun = (r: unknown): r is LastRunView => {
  if (!run(r)) return false
  const v = r as unknown as Record<string, unknown>
  return REASONS.includes(String(v.reason)) && (v.reason !== 'FINISH'
    || v.gatesPassed === 7 && integer(v.finishMs) && (v.bestFinishMs == null || integer(v.bestFinishMs)) && typeof v.newBest === 'boolean')
}
const TYPES = ['JUMPMAP_STARTED', 'JUMPMAP_GATE', 'JUMPMAP_GATE_SETTLED', 'JUMPMAP_FINAL_PAD', 'JUMPMAP_ENDED', 'JUMPMAP_STEP']
export function parseJumpStatus(value: unknown): JumpStatus {
  if (!record(value) || !scope(value) || !integer(value.revision) || !earnings(value) || typeof value.enabled !== 'boolean'
    || !text(value.rulesVersion) || !text(value.courseVersion) || typeof value.isFirstRun !== 'boolean' || !Array.isArray(value.seenTips)
    || !value.seenTips.every(t => TIP_KEYS.includes(t as TipKey)) || !(value.activeRunId === null || text(value.activeRunId))
    || !(value.bestFinishMs === null || integer(value.bestFinishMs)) || value.activeRun != null && (!run(value.activeRun) || value.activeRun.runId !== value.activeRunId)
    || value.lastRun != null && !lastRun(value.lastRun))
    throw new Error('점프맵 상태를 확인할 수 없어요.')
  return value as unknown as JumpStatus
}
export function parseJumpEvent(type: string, p: unknown): JumpEvent | null {
  if (!TYPES.includes(type)) return null
  if (!record(p) || !scope(p)) throw new Error('점프맵 이벤트를 확인할 수 없어요.')
  if (type === 'JUMPMAP_STEP') {
    const block = courseBlockIndex(p.block)
    if (!text(p.playerId) || block === null) throw new Error('점프맵 착지 이벤트를 확인할 수 없어요.')
    return { ...p, type, block } as JumpEvent
  }
  let valid = text(p.runId) && integer(p.revision)
  if (type !== 'JUMPMAP_FINAL_PAD') valid &&= earnings(p)
  if (type === 'JUMPMAP_STARTED') valid &&= text(p.courseVersion) && text(p.rulesVersion) && integer(p.serverTime)
  if (type === 'JUMPMAP_GATE') valid &&= gate(p.gate) && finite(p.elapsedMs) && money(p.coinsCalculated) && typeof p.pending === 'boolean'
    && (p.pending ? p.coinsGranted === null : money(p.coinsGranted) && Number(p.coinsGranted) <= Number(p.coinsCalculated)) && money(p.runCoins)
  if (type === 'JUMPMAP_GATE_SETTLED') valid &&= gate(p.gate) && money(p.coinsGranted) && money(p.runCoins)
  if (type === 'JUMPMAP_ENDED') {
    valid &&= REASONS.includes(String(p.reason))
      && integer(p.gatesPassed) && p.gatesPassed <= 7 && finite(p.maxHeight) && money(p.runCoins) && finite(p.elapsedMs)
    if (p.reason === 'FINISH') valid &&= p.gatesPassed === 7 && integer(p.finishMs) && (p.bestFinishMs === null || integer(p.bestFinishMs)) && typeof p.newBest === 'boolean'
  }
  if (!valid) throw new Error('점프맵 이벤트를 확인할 수 없어요.')
  return { ...p, type } as JumpEvent
}
