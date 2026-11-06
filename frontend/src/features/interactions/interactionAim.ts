import { Vector3, type Camera } from 'three'

/** Camera direction, updated in place without per-frame React state. */
export const interactionAim = { ready: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 }
let interactionCamera: Camera | null = null
const direction = new Vector3()
export function setInteractionCamera(camera: Camera | null) { interactionCamera = camera }

/** Read at the input edge: the camera may have turned since the last hint/aim sample. */
export function readInteractionDirection() {
  if (!interactionAim.ready) return null
  if (!interactionCamera) return { dx: interactionAim.dx, dy: interactionAim.dy, dz: interactionAim.dz }
  interactionCamera.getWorldDirection(direction)
  return { dx: direction.x, dy: direction.y, dz: direction.z }
}

export function interactionScore(distance: number, target: { x: number; y: number; z: number }, aim = interactionAim) {
  if (!aim.ready) return distance
  const x = target.x - aim.x, y = target.y - aim.y, z = target.z - aim.z
  const length = Math.hypot(x, y, z)
  if (length < 0.001) return distance
  const dot = (x * aim.dx + y * aim.dy + z * aim.dz) / length
  if (dot <= 0) return Infinity
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 8 + distance * 0.12
}
