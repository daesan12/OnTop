/** Camera direction, updated in place without per-frame React state. */
export const interactionAim = { ready: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 }
export function interactionScore(distance: number, target: { x: number; y: number; z: number }, aim = interactionAim) {
  if (!aim.ready) return distance
  const x = target.x - aim.x, y = target.y - aim.y, z = target.z - aim.z
  const length = Math.hypot(x, y, z)
  if (length < 0.001) return distance
  const dot = (x * aim.dx + y * aim.dy + z * aim.dz) / length
  if (dot <= 0) return Infinity
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 8 + distance * 0.12
}
