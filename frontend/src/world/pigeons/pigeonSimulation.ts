import { groundHeight, WORLD_COLLIDERS } from '../../config'
import { createGroundObstacleQuery } from './groundObstacles'

export const PIGEON = {
  countPerFlock: 6,
  scareRadius: 3.8,
  fastSpeed: 7,
  cooldown: 3,
  walkSpeed: 0.22,
} as const
export interface Point {
  x: number
  z: number
}
export interface Visitor extends Point {
  y: number
  vx: number
  vz: number
}
export interface Bird extends Point {
  y: number
  yaw: number
  mode: 'idle' | 'walk' | 'fly'
  age: number
  duration: number
  cooldown: number
  seed: number
  from: Point
  target: Point
  phase: number
}
const centers: readonly Point[] = [
  { x: 0, z: 28 },
  { x: -33, z: -32 },
  { x: 32, z: -18 },
]
const blockedGround = createGroundObstacleQuery(WORLD_COLLIDERS)
/** Conservative footprint clearance also keeps low flights out of furniture/trees. */
export function safeGround(x: number, z: number) {
  if (Math.abs(x) > 73 || Math.abs(z) > 73 || groundHeight(x, z) < -0.04)
    return false
  return !blockedGround(x, z)
}
export function clearRoute(a: Point, b: Point) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3)
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0
    if (!safeGround(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
  }
  return true
}
export const PIGEON_SITES = centers.map((c) => {
  const points: Point[] = []
  for (let z = -8; z <= 8; z += 2)
    for (let x = -8; x <= 8; x += 2) {
      const p = { x: c.x + x, z: c.z + z }
      if (safeGround(p.x, p.z)) points.push(p)
    }
  return points
})
function random(b: Bird) {
  b.seed = (Math.imul(b.seed, 1664525) + 1013904223) >>> 0
  return b.seed / 4294967296
}
export function createBirds(flock: number): Bird[] {
  const sites = [...PIGEON_SITES[flock]].sort(
    (a, b) =>
      Math.hypot(a.x - centers[flock].x, a.z - centers[flock].z) -
      Math.hypot(b.x - centers[flock].x, b.z - centers[flock].z),
  )
  return sites.slice(0, PIGEON.countPerFlock).map((p, i) => ({
    ...p,
    y: groundHeight(p.x, p.z) + 0.08,
    yaw: i * 2.4,
    mode: 'idle',
    age: 0,
    duration: 2 + i * 0.43,
    cooldown: 0,
    seed: 419 + flock * 53 + i * 13,
    from: { ...p },
    target: { ...p },
    phase: i * 1.7,
  }))
}
export function approaching(b: Point & { y: number }, p: Visitor) {
  const dx = b.x - p.x,
    dz = b.z - p.z,
    distance = Math.hypot(dx, dz),
    speed = Math.hypot(p.vx, p.vz)
  return (
    Math.abs(p.y - 0.8 - b.y) < 1.3 &&
    distance < PIGEON.scareRadius &&
    speed >= PIGEON.fastSpeed &&
    dx * p.vx + dz * p.vz > distance * speed * 0.3
  )
}
function destination(
  b: Bird,
  sites: readonly Point[],
  visitors: readonly Visitor[],
  threat: Visitor,
) {
  let best: Point | undefined,
    score = -Infinity
  for (const p of sites) {
    const distance = Math.hypot(p.x - b.x, p.z - b.z)
    if (
      distance < 5 ||
      distance > 12 ||
      visitors.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 3) ||
      !clearRoute(b, p)
    )
      continue
    const away = Math.hypot(p.x - threat.x, p.z - threat.z)
    const value = away + random(b) * 3 - distance * 0.2
    if (value > score) {
      score = value
      best = p
    }
  }
  return best
}
/** Renderer-independent ambient behavior. No rewards, collisions or gameplay authority. */
export function stepBird(
  b: Bird,
  dt: number,
  visitors: readonly Visitor[],
  sites: readonly Point[],
) {
  dt = Math.max(0, Math.min(0.1, dt))
  b.age += dt
  b.cooldown = Math.max(0, b.cooldown - dt)
  if (b.mode !== 'fly' && b.cooldown === 0) {
    const threat = visitors.find((v) => approaching(b, v))
    if (threat) {
      const target = destination(b, sites, visitors, threat)
      if (target) {
        b.mode = 'fly'
        b.from = { x: b.x, z: b.z }
        b.target = { ...target }
        b.age = 0
        b.duration = 1.8 + Math.hypot(target.x - b.x, target.z - b.z) / 7
        b.yaw = Math.atan2(target.x - b.x, target.z - b.z)
      }
    }
  }
  if (b.mode === 'fly') {
    const t = Math.min(1, b.age / b.duration),
      u = t * t * (3 - 2 * t)
    b.x = b.from.x + (b.target.x - b.from.x) * u
    b.z = b.from.z + (b.target.z - b.from.z) * u
    b.y = groundHeight(b.x, b.z) + 0.08 + Math.sin(Math.PI * t) * 2.5
    if (t === 1) {
      b.mode = 'idle'
      b.age = 0
      b.duration = 2 + random(b) * 3
      b.cooldown = PIGEON.cooldown
    }
    return
  }
  if (b.mode === 'walk') {
    const t = Math.min(1, b.age / b.duration)
    b.x = b.from.x + (b.target.x - b.from.x) * t
    b.z = b.from.z + (b.target.z - b.from.z) * t
    b.y = groundHeight(b.x, b.z) + 0.08
    if (t === 1) {
      b.mode = 'idle'
      b.age = 0
      b.duration = 2 + random(b) * 4
    }
  } else if (b.age > b.duration) {
    b.age = 0
    b.duration = 2 + random(b) * 3
    const angle = random(b) * Math.PI * 2,
      distance = 0.4 + random(b) * 0.6
    const target = {
      x: b.x + Math.sin(angle) * distance,
      z: b.z + Math.cos(angle) * distance,
    }
    // Stay within one metre of the flock's approved landing network.
    if (
      sites.some((p) => Math.hypot(p.x - target.x, p.z - target.z) < 1) &&
      clearRoute(b, target)
    ) {
      b.mode = 'walk'
      b.from = { x: b.x, z: b.z }
      b.target = target
      b.yaw = angle
      b.duration = distance / PIGEON.walkSpeed
    }
  }
}
