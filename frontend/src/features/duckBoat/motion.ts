import { BRIDGE, DOCK_ACCESS, FISHING_OUTLINE, LAKE, distanceToSegment, site } from '../../../park-renewal-preview/plan'
import { inPolygon } from '../../../park-renewal-preview/roundedFootprint'

type Point = { x: number; z: number }
export type BoatPose = Point & { yaw: number }
export const fare = 30
export const duration = 5 * 60 * 1000
const dock = site('dock')
export const berth: BoatPose = { x: dock.x - 2.1, z: dock.z - 3.7, yaw: 0 }
const entrance = DOCK_ACCESS.points[0]!
const access = DOCK_ACCESS.points.at(-1)!
export const walkStart: BoatPose = { x: entrance[0], z: entrance[1] + 3, yaw: Math.PI }
export const dockLanding: BoatPose = { x: access[0], z: access[1], yaw: Math.PI }
const walkRoute = [[walkStart.x, walkStart.z] as const, ...DOCK_ACCESS.points]
const corner = DOCK_ACCESS.points[1]!

export function nearDock({ x, z }: Point) {
  return Math.hypot(x - corner[0], z - corner[1]) <= 1.05
    || Math.hypot(x - dockLanding.x, z - dockLanding.z) <= 2.5
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

export function returnRoute(pose: BoatPose): readonly Point[] {
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
