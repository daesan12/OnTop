import { CatmullRomCurve3, Vector3 } from 'three'
import { groundSurfaceHeight } from '../../../../park-renewal-preview/groundSurface'

export const SLEIGH_ID = 'winter-sleigh'
export const SLEIGH_LAP_MS = 40_000
const dock = { x: 6, y: groundSurfaceHeight(6, 86) + .95, z: 86 }
// Lift above the entrance first, then circle the current park above its tallest roofs.
// Bake once into the map so Java and the renderer interpolate exactly the same poses.
const curve = new CatmullRomCurve3([
  [6, dock.y, 86], [6, 23, 78], [32, 59, 72], [92, 73, 20],
  [80, 76, -65], [0, 75, -98], [-88, 73, -60], [-98, 72, 25],
  [-55, 66, 85], [6, 51, 102], [6, 23, 94], [6, dock.y, 86],
].map(p => new Vector3(...p as [number, number, number])), false, 'centripetal')
const count = 400
export const SLEIGH_ROUTE = { durationMs: SLEIGH_LAP_MS, points: Array.from({ length: count + 1 }, (_, i) => {
  const t = i / count, eased = t * t * (3 - 2 * t), p = curve.getPointAt(eased)
  return { x: p.x, y: Math.max(dock.y, p.y), z: p.z }
}) }
export const SLEIGH_DOCK = { ...dock, yaw: Math.PI }
export const SLEIGH_EXIT = { x: 2, y: groundSurfaceHeight(2, 86) + .8, z: 86, yaw: Math.PI }
export function sleighPose(elapsedMs: number) {
  const u = Math.max(0, Math.min(count, elapsedMs / SLEIGH_LAP_MS * count))
  const i = Math.min(count - 1, Math.floor(u)), f = u - i
  const a = SLEIGH_ROUTE.points[i]!, b = SLEIGH_ROUTE.points[i + 1]!
  const before = SLEIGH_ROUTE.points[Math.max(0, i - 2)]!, after = SLEIGH_ROUTE.points[Math.min(count, i + 3)]!
  const dx = after.x - before.x, dz = after.z - before.z
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f,
    yaw: Math.hypot(dx, dz) < .01 ? Math.PI : Math.atan2(dx, dz),
    pitch: Math.max(-.22, Math.min(.22, -Math.atan2(after.y - before.y, Math.hypot(dx, dz)))),
    seatIndex: 0, moving: false }
}
export function buildSleighFacility() {
  return [{ id: SLEIGH_ID, kind: 'SLEIGH', position: [SLEIGH_EXIT.x, SLEIGH_EXIT.y - .8, SLEIGH_EXIT.z],
    yaw: Math.PI, radius: 4, heightTolerance: 1.2, use: SLEIGH_DOCK, exit: SLEIGH_EXIT, route: SLEIGH_ROUTE }]
}
