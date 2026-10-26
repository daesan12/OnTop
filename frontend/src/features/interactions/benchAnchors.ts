import { BENCH_DEFINITIONS } from '../../park/mapConfig'
import type { Pose } from '../../network/worldClient'
import { facilityInRange } from '../facilities/state'

export type BenchSeat = 0 | 1
/** Existing map IDs/units. An internal placement manifest, not server IDs or DTOs. */
export const benchAnchors=BENCH_DEFINITIONS.map(b=>({...b,seats:b.seats.map(s=>s.use),exit:b.seats[0]!.exit}))
export const findBench = (id: string) => benchAnchors.find(bench => bench.id === id)
export function canReachBench(position: Pose, benchId: string) {
  const approved = facilityInRange(position, benchId)
  if (approved !== undefined) return approved
  const bench = findBench(benchId)
  return !!bench && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - bench.position[0], position.z - bench.position[2]) <= bench.radius
    && Math.abs(position.y - bench.position[1] - 0.8) <= bench.heightTolerance
}
