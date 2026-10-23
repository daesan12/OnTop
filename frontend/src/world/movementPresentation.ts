import type { AvatarSnapshot, Pose } from '../network/worldClient'

export const samePose = (a: Pose, b: Pose) => a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw
export function sampleMovement(
  sample: Pick<AvatarSnapshot, 'previous' | 'current' | 'at'>,
  now: number, interpolationMs: number, target: Pose,
): Pose {
  // Interpolation only: hold the last approved endpoint instead of extrapolating physics.
  const t = Math.min(1, Math.max(0, (now - sample.at) / interpolationMs))
  target.x = sample.previous.x + (sample.current.x - sample.previous.x) * t
  target.y = sample.previous.y + (sample.current.y - sample.previous.y) * t
  target.z = sample.previous.z + (sample.current.z - sample.previous.z) * t
  target.yaw = sample.previous.yaw + Math.atan2(
    Math.sin(sample.current.yaw - sample.previous.yaw), Math.cos(sample.current.yaw - sample.previous.yaw),
  ) * t
  return target
}
export function sampleSwimmingPose(avatar: AvatarSnapshot, now: number, interpolationMs: number, target: Pose) {
  return avatar.connected && avatar.swimming ? sampleMovement(avatar, now, interpolationMs, target) : null
}
