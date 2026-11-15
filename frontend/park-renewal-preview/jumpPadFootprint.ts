import type { JumpPad } from './jump10Plan'

export function containsPad(pad: JumpPad, x: number, z: number, margin = .12) {
  const dx = x - pad.x, dz = z - pad.z
  if (pad.sourceId) margin = .18
  if (pad.radius !== undefined) return Math.hypot(dx, dz) < pad.radius + margin
  const yaw = pad.collisionYaw ?? pad.yaw, c = Math.cos(yaw), s = Math.sin(yaw)
  return Math.abs(c * dx - s * dz) < pad.halfX + margin && Math.abs(s * dx + c * dz) < pad.halfZ + margin
}
