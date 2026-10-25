import { FITNESS, FITNESS_STATIONS } from '../../config'
import type { Pose } from '../../network/worldClient'
import { facilityInRange } from '../facilities/state'

export const findFitness = (id: string) => FITNESS_STATIONS.find(station => station.id === id)
export function canReachFitness(position: Pose, id: string) {
  const approved = facilityInRange(position, id)
  if (approved !== undefined) return approved
  const station = findFitness(id)
  return !!station && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - station.position[0], position.z - station.position[2]) <= FITNESS.interactionRadius
    && Math.abs(position.y - station.position[1] - 0.8) <= 0.7
}
export function fitnessAnchors(id: string) {
  const station = findFitness(id)
  if (!station) throw new Error('운동기구를 확인해주세요.')
  return {
    use: { x: station.position[0], y: station.position[1] + station.baseHeight + 0.8, z: station.position[2], yaw: station.yaw },
    exit: { x: station.position[0] - Math.sin(station.yaw) * FITNESS.exitOffset,
      y: station.position[1] + FITNESS.padSurfaceHeight + 0.8,
      z: station.position[2] - Math.cos(station.yaw) * FITNESS.exitOffset, yaw: station.yaw },
  }
}
