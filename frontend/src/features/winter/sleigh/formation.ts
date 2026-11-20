import { SLEIGH_DOCK, SLEIGH_LAP_MS, SLEIGH_ROUTE, sleighPose } from './route'

const points = SLEIGH_ROUTE.points
const distances = [0]
for (let i = 1; i < points.length; i++) {
  const a = points[i - 1]!, b = points[i]!
  distances.push(distances[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
}
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
const turn = (value: number) => Math.atan2(Math.sin(value), Math.cos(value))

function pointAtDistance(distance: number) {
  const end = distances.length - 1
  let lo = 0, hi = end
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (distances[mid]! < distance) lo = mid
    else hi = mid
  }
  const span = distances[hi]! - distances[lo]!, f = (distance - distances[lo]!) / span
  const a = points[lo]!, b = points[hi]!
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }
}

/** Each pair follows its own place ahead on the curve, instead of rotating a rigid 8m line. */
export function sleighTeamPose(elapsed: number, ahead: number, side: number) {
  const root = sleighPose(elapsed)
  const u = Math.max(0, Math.min(points.length - 1, elapsed / SLEIGH_LAP_MS * (points.length - 1)))
  const i = Math.min(points.length - 2, Math.floor(u)), f = u - i
  const distance = distances[i]! + (distances[i + 1]! - distances[i]!) * f + ahead
  const p = pointAtDistance(distance), before = pointAtDistance(distance - 3), after = pointAtDistance(distance + 3)
  const yaw = Math.atan2(after.x - before.x, after.z - before.z)
  const pitch = -Math.atan2(after.y - before.y, Math.hypot(after.x - before.x, after.z - before.z))
  const farther = pointAtDistance(distance + 7), earlier = pointAtDistance(distance - 7)
  const turnAngle = turn(Math.atan2(farther.x - p.x, farther.z - p.z) - Math.atan2(p.x - earlier.x, p.z - earlier.z))
  const blend = smooth((root.y - SLEIGH_DOCK.y - 2) / 8)
    * smooth(elapsed / 1200) * smooth((SLEIGH_LAP_MS - elapsed) / 1200)
  const dx = p.x - root.x, dz = p.z - root.z, cos = Math.cos(root.yaw), sin = Math.sin(root.yaw)
  const localYaw = turn(yaw - root.yaw) * blend
  return {
    x: (dx * cos - dz * sin) * blend + Math.cos(localYaw) * side,
    y: (p.y - root.y) * blend,
    z: ahead + (dx * sin + dz * cos - ahead) * blend - Math.sin(localYaw) * side,
    yaw: localYaw,
    pitch: Math.max(-.32, Math.min(.32, pitch)) * blend,
    bank: Math.max(-.24, Math.min(.24, -turnAngle * 1.2)) * blend,
  }
}
