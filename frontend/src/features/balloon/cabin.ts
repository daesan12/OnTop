import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import type { Input, Point } from './flight'

export const CABIN_DECK_RISE = .48
export const CABIN_FLOOR_HEIGHT = .425 + CABIN_DECK_RISE
export const CABIN_SEAT_HEIGHT = .34
export const CABIN_STANDING_EYE_OFFSET = 1.45
export const CABIN_WALK_RADIUS = 1.38
export const CABIN_BENCH_INNER = 1.1
export const CABIN_BENCH_OUTER = 1.56
export const CABIN_BENCH_SLOPE = Math.tan(Math.PI / 8)
const BENCH_SEAT_RADIUS = 1.29
const BENCH_CLEARANCE = .14
const SIT_REACH = .76

// These coordinates are in the unscaled model's basket plane.
function benchAt(side: number, radius: number) {
  const yaw = side * Math.PI / 4
  return { x: -Math.sin(yaw) * radius || 0, z: -Math.cos(yaw) * radius, yaw }
}

// The east and west sides (2 and 6) are open.
export const CABIN_BENCH_RUNS = [[-1, 0, 1], [3, 4, 5]] as const
const BENCH_CENTER = (CABIN_BENCH_INNER + CABIN_BENCH_OUTER) / 2
export const cabinBenches = CABIN_BENCH_RUNS.flat().map(side => benchAt(side, BENCH_CENTER))

// Direction (0) and altitude (2) keep their existing seat IDs.
export const cabinSeats = [
  benchAt(0, BENCH_SEAT_RADIUS),
  benchAt(1, BENCH_SEAT_RADIUS),
  benchAt(4, BENCH_SEAT_RADIUS),
  benchAt(-3, BENCH_SEAT_RADIUS),
] as const

export type CabinPose = { x: number; z: number; yaw: number; seatIndex: number; moving: boolean }
export type BalloonRiderPose = Point & Pick<CabinPose, 'yaw' | 'seatIndex' | 'moving'>

export const idleCabin: CabinPose = { x: 0, z: 0, yaw: Math.PI, seatIndex: -1, moving: false }

export function walkCabin(pose: CabinPose, input: Input, elapsed: number): CabinPose {
  if (pose.seatIndex >= 0) return pose
  const distance = Math.min(.1, Math.max(0, elapsed)) * 1.7 / BALLOON_SCALE
  const length = Math.max(1, Math.hypot(input.x, input.z))
  const dx = input.x / length * distance
  const dz = input.z / length * distance
  let { x, z } = pose
  const canStandAt = (px: number, pz: number) => Math.hypot(px, pz) <= CABIN_WALK_RADIUS
    && cabinBenches.every(bench => {
      const radial = (px * bench.x + pz * bench.z) / BENCH_CENTER
      const tangent = Math.abs(pz * bench.x - px * bench.z) / BENCH_CENTER
      return radial <= CABIN_BENCH_INNER - BENCH_CLEARANCE
        || tangent >= radial * CABIN_BENCH_SLOPE + BENCH_CLEARANCE
    })
  if (canStandAt(x + dx, z)) x += dx
  if (canStandAt(x, z + dz)) z += dz
  const moving = x !== pose.x || z !== pose.z
  return { ...pose, x, z, moving, yaw: moving ? Math.atan2(x - pose.x, z - pose.z) : pose.yaw }
}

export function availableCabinSeat(pose: CabinPose, occupied: readonly number[] = []) {
  let nearest = -1
  let distance = SIT_REACH
  for (const [index, seat] of cabinSeats.entries()) {
    const candidate = Math.hypot(pose.x - seat.x, pose.z - seat.z)
    if (candidate > distance || occupied.includes(index)) continue
    distance = candidate
    nearest = index
  }
  return nearest
}

export function toggleCabinSeat(pose: CabinPose, occupied: readonly number[] = []): CabinPose {
  const index = pose.seatIndex >= 0 ? pose.seatIndex : availableCabinSeat(pose, occupied)
  const seat = cabinSeats[index]
  if (!seat) return pose
  if (pose.seatIndex >= 0) {
    const stand = (CABIN_BENCH_INNER - BENCH_CLEARANCE - .16) / BENCH_SEAT_RADIUS
    return { x: seat.x * stand, z: seat.z * stand, yaw: seat.yaw, seatIndex: -1, moving: false }
  }
  return { ...seat, seatIndex: index, moving: false }
}

export function cabinRider(position: Point, pose: CabinPose): BalloonRiderPose {
  const anchor = cabinSeats[pose.seatIndex] ?? pose
  return {
    x: position.x + anchor.x * BALLOON_SCALE,
    y: position.y + (CABIN_FLOOR_HEIGHT + (pose.seatIndex >= 0 ? CABIN_SEAT_HEIGHT : 0)) * BALLOON_SCALE,
    z: position.z + anchor.z * BALLOON_SCALE,
    yaw: anchor.yaw,
    seatIndex: pose.seatIndex,
    moving: pose.moving,
  }
}
