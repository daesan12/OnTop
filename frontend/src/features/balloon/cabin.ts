import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import type { Input, Point } from './flight'

export const CABIN_FLOOR_HEIGHT = .425
export const CABIN_SEAT_HEIGHT = .34
export const CABIN_WALK_RADIUS = 1.38
const CHAIR_RADIUS = 1.22
const CHAIR_CLEARANCE = .52
const SIT_REACH = .76

// These coordinates are in the unscaled model's basket plane.
export const cabinSeats = [
  { x: 0, z: -CHAIR_RADIUS, yaw: 0 },
  { x: CHAIR_RADIUS, z: 0, yaw: -Math.PI / 2 },
  { x: 0, z: CHAIR_RADIUS, yaw: Math.PI },
  { x: -CHAIR_RADIUS, z: 0, yaw: Math.PI / 2 },
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
    && cabinSeats.every(seat => Math.hypot(px - seat.x, pz - seat.z) >= CHAIR_CLEARANCE)
  if (canStandAt(x + dx, z)) x += dx
  if (canStandAt(x, z + dz)) z += dz
  const moving = x !== pose.x || z !== pose.z
  return { ...pose, x, z, moving, yaw: moving ? Math.atan2(x - pose.x, z - pose.z) : pose.yaw }
}

export function availableCabinSeat(pose: CabinPose) {
  let nearest = -1
  let distance = SIT_REACH
  for (const [index, seat] of cabinSeats.entries()) {
    const candidate = Math.hypot(pose.x - seat.x, pose.z - seat.z)
    if (candidate > distance) continue
    distance = candidate
    nearest = index
  }
  return nearest
}

export function toggleCabinSeat(pose: CabinPose): CabinPose {
  const index = pose.seatIndex >= 0 ? pose.seatIndex : availableCabinSeat(pose)
  const seat = cabinSeats[index]
  if (!seat) return pose
  if (pose.seatIndex >= 0) {
    return { x: seat.x * .55, z: seat.z * .55, yaw: seat.yaw, seatIndex: -1, moving: false }
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
