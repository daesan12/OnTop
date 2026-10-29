import { Camera, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { GOMOKU } from '../config/gomoku'

export const OMOK_FOCUS_LAYER = 1

/** The original board occupies 80% of the shorter viewport dimension. */
export function omokTopDownHeight(aspect: number, scale: number, viewportHeight?: number) {
  // Reserve symmetric HUD space so the grid never moves when the turn changes.
  const fit = viewportHeight ? Math.max(.3, Math.min(.8, (viewportHeight - 250) / viewportHeight)) : GOMOKU.topDownScreenFill
  const span = GOMOKU.boardOuterSpan * scale / fit / Math.min(1, aspect)
  return span / (2 * Math.tan(GOMOKU.topDownFov * Math.PI / 360))
}

/** Rendering only: readiness never grants a seat or permission to place a stone. */
export function advanceOmokCamera(camera: Camera, position: Vector3, rotation: Quaternion, fov: number, delta: number) {
  const blend = 1 - Math.exp(-7 * delta)
  camera.position.lerp(position, blend)
  camera.quaternion.slerp(rotation, blend)
  if (camera instanceof PerspectiveCamera) {
    if (Math.abs(camera.fov - fov) > .02) camera.fov += (fov - camera.fov) * blend
    else camera.fov = fov
    camera.updateProjectionMatrix()
  }
  const settled = camera.position.distanceToSquared(position) < .000004
    && camera.quaternion.angleTo(rotation) < .001
    && (!(camera instanceof PerspectiveCamera) || Math.abs(camera.fov - fov) < .02)
  if (settled) {
    camera.position.copy(position)
    camera.quaternion.copy(rotation)
  }
  return settled
}
