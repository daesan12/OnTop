import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import type { Input, Point } from './flight'

export const CABIN_FLOOR_HEIGHT = .425
export const CABIN_SEAT_HEIGHT = .34
export const CABIN_WALK_RADIUS = 1.38
export const CABIN_BENCH_WIDTH = 1.76
export const CABIN_BENCH_DEPTH = .4
const BENCH_CLEARANCE = .14
const SIT_REACH = .76

// These coordinates are in the unscaled model's basket plane.
export const cabinBenches = [
  { z: -1.13, yaw: 0 },
  { z: 1.13, yaw: Math.PI },
] as const

// Directions (0) and altitude (2) keep their existing seat IDs.
export const cabinSeats = [
  { ...cabinBenches[0], x: -.43 },
  { ...cabinBenches[0], x: .43 },
  { ...cabinBenches[1], x: .43 },
  { ...cabinBenches[1], x: -.43 },
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
    && cabinBenches.every(bench => Math.abs(px) >= CABIN_BENCH_WIDTH / 2 + BENCH_CLEARANCE
      || Math.abs(pz - bench.z) >= CABIN_BENCH_DEPTH / 2 + BENCH_CLEARANCE)
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
    const z = seat.z - Math.sign(seat.z) * (CABIN_BENCH_DEPTH / 2 + BENCH_CLEARANCE + .16)
    return { x: seat.x, z, yaw: seat.yaw, seatIndex: -1, moving: false }
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
