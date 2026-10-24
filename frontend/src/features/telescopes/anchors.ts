import { TELESCOPE, TELESCOPES, telescopeLanding } from '../../config'
import type { Pose } from '../../network/worldClient'

export const findTelescope = (id: string) => TELESCOPES.find(t => t.id === id)
export function canReachTelescope(position: Pose, id: string) {
  const t = findTelescope(id)
  return !!t && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - t.position[0], position.z - t.position[2]) <= TELESCOPE.interactionRadius
    && Math.abs(position.y - t.position[1] - 0.8) <= 0.7
}
export function telescopeAnchors(id: string) {
  const t = findTelescope(id)
  if (!t) throw new Error('망원경을 확인해주세요.')
  const pose = (exit: boolean): Pose => {
    const [x, y, z] = telescopeLanding(t, exit)
    return { x, y, z, yaw: t.yaw }
  }
  return { use: pose(false), exit: pose(true) }
}
export function normalizeTelescopeAim(yaw: number, pitch: number) {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new Error('망원경 방향을 확인해주세요.')
  return { yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
    pitch: Math.max(TELESCOPE.minPitch, Math.min(TELESCOPE.maxPitch, pitch)) }
}
