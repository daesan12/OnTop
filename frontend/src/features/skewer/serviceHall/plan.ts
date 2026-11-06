export type Point = { x: number; z: number }
export type TablePlan = { id: number; capacity: 1 | 2; shape: 'round' | 'rectangle'; x: number; z: number; approach: Point; seats: { x: number; z: number; yaw: number }[] }
export const ROOM = { width: 24, depth: 15, back: -7.5, front: 7.5, counterZ: -5.75, queueZ: 8.0, plantX: 11.25, plantRows: [-3.5, 2.6, 6.5], bounds: { minX: -11.4, maxX: 11.4, minZ: -4.45, maxZ: 6.7 } } as const
export const TABLES: readonly TablePlan[] = [
  ...[-7.5, 0, 7.5].map((x, index): TablePlan => ({ id: index + 1, capacity: 1, shape: 'round', x, z: -1.55, approach: { x, z: 0 }, seats: [{ x, z: -2.87, yaw: 0 }] })),
  ...[-7.5, 0, 7.5].map((x, index): TablePlan => ({ id: index + 4, capacity: 2, shape: 'rectangle', x, z: 3.7, approach: { x, z: 2.1 }, seats: [{ x: x - 1.9, z: 3.7, yaw: Math.PI / 2 }, { x: x + 1.9, z: 3.7, yaw: -Math.PI / 2 }] })),
]
export const STATIONS = {
  orders: { x: -2.6, z: -4.25 }, pickup: { x: 2.2, z: -4.25 }, fridge: { x: 10.0, z: -4.25 }, washer: { x: -6.4, z: -4.25 }, storage: { x: 6.6, z: -4.25 },
} as const
export type Station = keyof typeof STATIONS
export const START: Point = { x: -2.8, z: 1.15 }
export const PLAYER_RADIUS = .32
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
export function tableApproaches(table: TablePlan): Point[] {
  return table.capacity === 1 ? [table.approach, { x: table.x - 1.65, z: table.z }, { x: table.x + 1.65, z: table.z }]
    : [table.approach, { x: table.x, z: table.z + 1.6 }]
}
const furniture = [
  ...TABLES.map(t => ({ x: t.x, z: t.z, halfX: t.shape === 'round' ? .98 : 1.50, halfZ: t.shape === 'round' ? .98 : 1.04 })),
  ...TABLES.flatMap(t => t.seats.map(s => ({ ...s, halfX: .46, halfZ: .46 }))),
  { x: -.25, z: ROOM.counterZ, halfX: 5.05, halfZ: .65 }, { x: STATIONS.fridge.x, z: ROOM.counterZ, halfX: .83, halfZ: .70 },
  { x: STATIONS.washer.x, z: ROOM.counterZ, halfX: .85, halfZ: .70 },
  { x: STATIONS.storage.x, z: ROOM.counterZ, halfX: 1.33, halfZ: .75 },
  ...ROOM.plantRows.flatMap(z => [-ROOM.plantX, ROOM.plantX].map(x => ({ x, z, halfX: .28, halfZ: .28 }))),
]
export function walkable(p: Point): boolean {
  if (!Number.isFinite(p.x + p.z) || p.x < ROOM.bounds.minX || p.x > ROOM.bounds.maxX || p.z < ROOM.bounds.minZ || p.z > ROOM.bounds.maxZ) return false
  return !furniture.some(b => Math.abs(p.x - b.x) < b.halfX + PLAYER_RADIUS && Math.abs(p.z - b.z) < b.halfZ + PLAYER_RADIUS)
}
export function move(p: Point, dx: number, dz: number, seconds: number): Point {
  const length = Math.max(1, Math.hypot(dx, dz)), step = Math.min(.05, Math.max(0, seconds)) * 5.0
  const next = { ...p }
  if (walkable({ x: next.x + dx / length * step, z: next.z })) next.x += dx / length * step
  if (walkable({ x: next.x, z: next.z + dz / length * step })) next.z += dz / length * step
  return next
}
/** Navigation is game-owned and never rewrites the park's map or input system. */
export function route(start: Point, destination: Point): Point[] {
  if (!walkable(destination)) return []
  const snap = (p: Point) => ({ x: Math.round(p.x * 4) / 4, z: Math.round(p.z * 4) / 4 }), key = (p: Point) => `${p.x}:${p.z}`
  const origin = snap(start), queue = [origin], parent = new Map<string, Point | null>([[key(origin), null]])
  let end: Point | null = null
  const limit = Math.ceil((ROOM.bounds.maxX - ROOM.bounds.minX) * 4 + 1) * Math.ceil((ROOM.bounds.maxZ - ROOM.bounds.minZ) * 4 + 1)
  for (let i = 0; i < queue.length && i < limit; i++) {
    const p = queue[i]
    if (distance(p, destination) < .32) { end = p; break }
    for (const [dx, dz] of [[.25, 0], [-.25, 0], [0, .25], [0, -.25]]) {
      const n = { x: p.x + dx, z: p.z + dz }
      if (walkable(n) && !parent.has(key(n))) { parent.set(key(n), p); queue.push(n) }
    }
  }
  if (!end) return []
  const path = [destination]
  for (let p: Point | null = end; p; p = parent.get(key(p)) ?? null) path.unshift(p)
  return path.slice(1)
}
/** A table click uses the reachable side with the shortest actual walking route. */
export function tableDestination(from: Point, table: TablePlan): Point {
  const choices = tableApproaches(table).map(point => {
    const path = route(from, point)
    const cost = path.reduce((length, p, index) => length + distance(index ? path[index - 1] : from, p), 0)
    return { point, cost: distance(from, point) < .2 ? 0 : path.length ? cost : Infinity }
  }).sort((a, b) => a.cost - b.cost)
  return choices[0].point
}
