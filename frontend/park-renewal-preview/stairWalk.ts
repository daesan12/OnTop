import { ParkMotion } from '../src/network/parkMotion'
import type { MovementIntent } from '../src/network/movementInput'
import { clearMotionSegment } from './motionPlan'
import { MONUMENT_STAIRS as stairs, walkHeightAt, type Point } from './plan'

export const STAIR_WALK_TICK = 1 / 120

export function createStairWalk(x: number, z = stairs.zBottom + 1.1) {
  return { x, z, foot: walkHeightAt(x, z), yaw: Math.PI, motion: new ParkMotion() }
}

export function stepStairWalk(actor: ReturnType<typeof createStairWalk>, input: MovementIntent) {
  const dt = STAIR_WALK_TICK
  const wanted = actor.motion.advance(input, dt, true)
  const from: Point = [actor.x, actor.z]
  const canMove = ([x, z]: Point) =>
    Math.abs(x - stairs.x) <= stairs.width / 2 + 1.5
    && z >= stairs.zTop - 2 && z <= stairs.zBottom + 2
    && Math.abs(walkHeightAt(x, z, actor.foot) - actor.foot) <= .35
    && clearMotionSegment(from, [x, z], actor.foot)

  let next: Point = [actor.x + wanted.x, actor.z + wanted.z]
  const walls: { x: number; z: number }[] = []
  if (!canMove(next)) {
    const lateral: Point = [next[0], actor.z]
    const longitudinal: Point = [actor.x, next[1]]
    if (wanted.z && canMove(longitudinal)) {
      next = longitudinal
      walls.push({ x: -Math.sign(wanted.x), z: 0 })
    } else if (wanted.x && canMove(lateral)) {
      next = lateral
      walls.push({ x: 0, z: -Math.sign(wanted.z) })
    } else {
      next = from
      walls.push({ x: -wanted.x, z: -wanted.z })
    }
  }
  const foot = walkHeightAt(...next, actor.foot)
  const actual = { x: next[0] - actor.x, y: foot - actor.foot, z: next[1] - actor.z }
  actor.motion.contact(wanted, actual, true, walls)
  actor.x = next[0]
  actor.z = next[1]
  actor.foot = foot
  if (Math.hypot(actual.x, actual.z) > .0001) actor.yaw = Math.atan2(actual.x, actual.z)
  return actual
}
