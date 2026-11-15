import { BRIDGE, DOCK_ACCESS, FISHING_OUTLINE, LAKE, distanceToSegment, site, walkHeightAt } from '../../../park-renewal-preview/plan'
import { inPolygon } from '../../../park-renewal-preview/roundedFootprint'
import type { ParkMapData } from '../../map/park'

type Point = { x: number; z: number }
export type BoatPose = Point & { yaw: number }
export const fare = 30
export const duration = 5 * 60 * 1000
const dock = site('dock')
const entrance = DOCK_ACCESS.points[0]!
export const walkStart: BoatPose = { x: entrance[0], z: entrance[1] + 3, yaw: Math.PI }
export const parkWalkStart: BoatPose = { ...walkStart, z: entrance[1] + 10 }
const rampBend = DOCK_ACCESS.points[1]!
// Put the park walker on the centerline of the exit ramp, outside the booth rails.
export const parkDisembark: BoatPose = { x: rampBend[0], z: rampBend[1] + .25, yaw: 0 }
const walkRoute = [[walkStart.x, walkStart.z] as const, ...DOCK_ACCESS.points]

export function duckBoatDock(data: ParkMapData) {
  const entrance = data.interactions.construction.find(site => site.id === 'dock')
  const mooring = data.physics.boxes.find(box => box.id === 'duck-boat-moored--1')
  if (data.world.size !== 220 || !entrance || !mooring) {
    throw new Error('220m 공원 맵에서 오리배 선착장과 접안 위치를 찾지 못했습니다.')
  }
  const [x, y, z] = entrance.reachPosition
  return {
    berth: { x: mooring.center[0], z: mooring.center[2], yaw: mooring.yaw },
    landing: { x, z, yaw: Math.PI },
    hullHeight: data.surfaces.lake.surfaceY + .08,
    canRent(point: Point, centerHeight = walkHeightAt(point.x, point.z) + .8) {
      return Math.hypot(point.x - x, point.z - z) <= entrance.radius
        && Math.abs(centerHeight - y) <= entrance.heightTolerance
    },
  }
}

export function walk(pose: BoatPose, across: number, forward: number, dt: number): BoatPose {
  if (!across && !forward) return pose
  const step = 3.2 * dt / Math.hypot(across, forward)
  const x = pose.x + across * step
  const z = pose.z - forward * step
  const onAccess = walkRoute.slice(1).some((end, i) => distanceToSegment(x, z, walkRoute[i]!, end) < .9)
  return onAccess ? { x, z, yaw: Math.atan2(across, -forward) } : pose
}

export function navigable({ x, z }: Point) {
  const shoreline = Math.hypot((x - LAKE.x) / (LAKE.rx - 2), (z - LAKE.z) / (LAKE.rz - 2))
  const island = Math.hypot((x - LAKE.island.x) / (LAKE.island.rx + 2.5), (z - LAKE.island.z) / (LAKE.island.rz + 2.5))
  const bridge = x <= BRIDGE.x1 + 2 && x >= BRIDGE.x0 - 2 && Math.abs(z - BRIDGE.z) < BRIDGE.width / 2 + 2
  const dockDeck = Math.abs(x - dock.x) <= 7.2 && z > dock.z - 3.6
  return shoreline <= 1 && island >= 1 && !bridge && !dockDeck && !inPolygon(x, z, FISHING_OUTLINE, 2)
}

export function steer(pose: BoatPose, turn: number, throttle: number, dt: number): BoatPose {
  if (!turn && !throttle) return pose
  const yaw = pose.yaw - turn * 1.55 * dt
  const distance = throttle * (throttle < 0 ? 2.2 : 5.6) * dt
  const next = { x: pose.x - Math.sin(yaw) * distance, z: pose.z - Math.cos(yaw) * distance, yaw }
  return navigable(next) ? next : { ...pose, yaw }
}

const routeRadius = .72
const angleAt = ({ x, z }: Point) => Math.atan2((z - LAKE.z) / LAKE.rz, (x - LAKE.x) / LAKE.rx)
const routeAt = (angle: number) => ({
  x: LAKE.x + Math.cos(angle) * LAKE.rx * routeRadius,
  z: LAKE.z + Math.sin(angle) * LAKE.rz * routeRadius,
})

export function returnRoute(pose: BoatPose, berth: BoatPose): readonly Point[] {
  // Keep the return route on the east side when passing the island bridge.
  const start = angleAt(pose), end = angleAt(berth)
  if (Math.hypot(pose.x - berth.x, pose.z - berth.z) < 4) return [berth]
  const count = Math.max(1, Math.ceil(Math.abs(end - start) / .08))
  return [...Array.from({ length: count + 1 }, (_, i) => routeAt(start + (end - start) * i / count)), berth]
}

export function returnStep(pose: BoatPose, target: Point, dt: number): BoatPose {
  const dx = target.x - pose.x, dz = target.z - pose.z
  const distance = Math.hypot(dx, dz)
  if (distance < .001) return pose
  const ratio = Math.min(1, 11 * dt / distance)
  return { x: pose.x + dx * ratio, z: pose.z + dz * ratio, yaw: Math.atan2(-dx, -dz) }
}
