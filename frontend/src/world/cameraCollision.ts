import { groundHeight } from '../park/mapConfig'
import { MONUMENT_STAIRS as stairs, MONUMENT_STAIR_CHEEK_WIDTH, MONUMENT_TREAD_OFFSET } from '../../park-renewal-preview/monumentStairPlan'

type Position = { x: number; y: number; z: number }
const clearance = .27
const stairHalfWidth = stairs.width / 2 + MONUMENT_STAIR_CHEEK_WIDTH + clearance
const stairMinX = stairs.x - stairHalfWidth
const stairMaxX = stairs.x + stairHalfWidth
const stairMinZ = stairs.zTop - clearance
const stairMaxZ = stairs.zBottom + clearance
const stairSlope = (stairs.top - stairs.bottom) / (stairs.zBottom - stairs.zTop)
// Enclose the highest edge of every tread and leave room for the camera's near plane.
const stairPlane = stairs.top + MONUMENT_TREAD_OFFSET + (stairs.top - stairs.bottom) / stairs.steps
  + clearance * Math.hypot(1, stairSlope) + stairSlope * stairs.zTop
const stairMinY = stairs.bottom - clearance

/** Clip the orbit against the solid flight, independently of scenery fading and player collision. */
export function constrainMonumentStairCamera(position: Position, focus: Position) {
  if ((focus.x < stairMinX && position.x < stairMinX) || (focus.x > stairMaxX && position.x > stairMaxX)
    || (focus.z < stairMinZ && position.z < stairMinZ) || (focus.z > stairMaxZ && position.z > stairMaxZ)) return

  let enter = 0, leave = 1
  // Parametric clip against each plane (positive distance is outside).
  const clip = (from: number, to: number) => {
    if (from > 0 && to > 0) return false
    if (from > 0) enter = Math.max(enter, from / (from - to))
    else if (to > 0) leave = Math.min(leave, from / (from - to))
    return enter <= leave
  }
  if (!clip(stairMinX - focus.x, stairMinX - position.x)
    || !clip(focus.x - stairMaxX, position.x - stairMaxX)
    || !clip(stairMinZ - focus.z, stairMinZ - position.z)
    || !clip(focus.z - stairMaxZ, position.z - stairMaxZ)
    || !clip(stairMinY - focus.y, stairMinY - position.y)
    || !clip(focus.y + stairSlope * focus.z - stairPlane, position.y + stairSlope * position.z - stairPlane)
    || enter <= 0 || enter >= 1) return
  position.x = focus.x + (position.x - focus.x) * enter
  position.y = focus.y + (position.y - focus.y) * enter
  position.z = focus.z + (position.z - focus.z) * enter
}

/** Terrain floor at the rendered orbit position. Scenery still fades without changing zoom. */
export function constrainRoamingCamera(
  position: { x: number; y: number; z: number },
  heightAt: (x: number, z: number) => number = groundHeight,
) {
  position.y = Math.max(position.y, heightAt(position.x, position.z) + 0.3)
}
