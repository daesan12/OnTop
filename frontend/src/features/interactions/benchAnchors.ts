import { BENCHES, BENCH_YAWS, BENCH_PAVILIONS, PAVILION_BENCH_EXIT } from '../../config'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { renewalMap } from '../../park/renewalMap'
import { PARK_DATA } from '../../map/park'
import type { Pose } from '../../network/worldClient'
import { facilityInRange } from '../facilities/state'

export type BenchSeat = 0 | 1
/** Existing map IDs/units. An internal placement manifest, not server IDs or DTOs. */
const legacyBenchAnchors = BENCHES.map((position, index) => {
  const yaw = BENCH_YAWS[index] ?? 0
  const exitDistance = BENCH_PAVILIONS[index] ? PAVILION_BENCH_EXIT : 1.5
  return {
    id: `bench-${index}`, position, yaw, radius: 3, heightTolerance: 0.7,
    seats: ([0, 1] as const).map(seat => ({
      x: position[0] + Math.cos(yaw) * (seat === 0 ? -0.65 : 0.65) + Math.sin(yaw) * 0.07,
      y: position[1] + 0.8,
      z: position[2] - Math.sin(yaw) * (seat === 0 ? -0.65 : 0.65) + Math.cos(yaw) * 0.07,
      yaw,
    } satisfies Pose)),
    exit: { x: position[0] + Math.sin(yaw) * exitDistance, y: position[1] + 0.8,
      z: position[2] + Math.cos(yaw) * exitDistance, yaw } satisfies Pose,
  }
})
const sharedBenches = renewalMap?.data.interactions.benches ?? (GENERATED_PARK_ENABLED ? PARK_DATA.interactions.benches : null)
export const benchAnchors = sharedBenches?.map(b => ({ ...b, seats: b.seats.map(s => s.use), exit: b.seats[0]!.exit })) ?? legacyBenchAnchors
export const findBench = (id: string) => benchAnchors.find(bench => bench.id === id)
export function canReachBench(position: Pose, benchId: string) {
  const approved = facilityInRange(position, benchId)
  if (approved !== undefined) return approved
  const bench = findBench(benchId)
  return !!bench && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - bench.position[0], position.z - bench.position[2]) <= bench.radius
    && Math.abs(position.y - bench.position[1] - 0.8) <= bench.heightTolerance
}
