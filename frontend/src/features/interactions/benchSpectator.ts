import { create } from 'zustand'
import { BENCH_PAVILIONS, TABLES, CHARACTER, PAVILION_LANTERN, PARK_PAVILIONS } from '../../config'
import type { Pose, Session } from '../../network/worldClient'
import { useBenchState } from './benchState'
import { lookScale } from '../../world/lookSensitivity'

export function benchTable(benchId: string) {
  if (!/^bench-\d+$/.test(benchId)) return undefined
  const pavilionId = BENCH_PAVILIONS[Number(benchId.slice(6))]
  return pavilionId ? TABLES.find(table => table.pavilionId === pavilionId) : undefined
}
export const benchViewScope = (s: Pick<Session, 'status' | 'sessionId' | 'roomId' | 'benchId'>,
  seat = useBenchState.getState().placements[s.sessionId]?.benchId === s.benchId ? useBenchState.getState().placements[s.sessionId]!.seat : -1) =>
  s.status === 'connected' && s.sessionId && s.roomId && s.benchId && seat >= 0 ? JSON.stringify([s.sessionId, s.roomId, s.benchId, seat]) : ''
export const useBenchSpectator = create(() => ({ scope: '', view: 'seated' as 'seated' | 'participants' | 'board' }))
export const benchLook = { yaw: Math.PI / 4 }
export function resetBenchSpectator() { benchLook.yaw = Math.PI / 4; useBenchSpectator.setState({ scope: '', view: 'seated' }) }
export function turnBenchLook(movementX: number) {
  if (!Number.isFinite(movementX)) return
  const yaw = benchLook.yaw - movementX * .004 * lookScale()
  benchLook.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw))
}
/** Camera alone faces the board. Never rotate the replicated avatar or change its lease. */
export function benchBoardLook(pose: Pose, target: readonly number[]) {
  const eyeY = pose.y - .8 + CHARACTER.height - .2 + CHARACTER.seatedHipHeight - CHARACTER.hipHeight
  return { yaw: Math.atan2(pose.x - target[0]!, pose.z - target[2]!),
    pitch: Math.atan2(eyeY - target[1]!, Math.hypot(pose.x - target[0]!, pose.z - target[2]!)) }
}
export function spectatorClearHeight(pavilionId?: string) {
  const pavilion = PARK_PAVILIONS.find(p => p.id === pavilionId)
  return pavilion ? pavilion.floor + PAVILION_LANTERN.heightFactor * pavilion.scale
    - PAVILION_LANTERN.bottomOffset - PAVILION_LANTERN.spectatorClearance : Infinity
}
