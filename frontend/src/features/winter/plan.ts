import { EDGES, NODES, SITES, TABLES, footprintDistance, inLake, insidePark } from '../../../park-renewal-preview/plan'
import { isPlantingGround, onLand } from '../../../park-renewal-preview/groundPlan'
import { FOREST_TRAILS } from '../../../park-renewal-preview/landscapePlan'

/** 고정 배치. radius는 기존 눈 줍기 여유를 유지하며 승인 모델의 충돌은 christmasCollision에서 읽는다. */
export const WINTER_DECOR = [
  { id: 'plaza-tree', kind: 'tree', x: 0, z: 38, radius: 2.5, height: 12 },
  { id: 'santa', kind: 'santa', x: 4, z: 42, radius: 1, height: 2.8 },
  { id: 'entry-snowman', kind: 'snowman', x: -5, z: 98, radius: .85, height: 3.1 },
  { id: 'plaza-snowman', kind: 'snowman', x: 0, z: 48, radius: .85, height: 3.1 },
  { id: 'lake-snowman', kind: 'snowman', x: 47, z: 33, radius: .85, height: 3.1 },
  { id: 'tree-gifts', kind: 'gifts', x: -3.7, z: 38, radius: 1.25, height: 1.3 },
  { id: 'plaza-gifts', kind: 'gifts', x: 3.7, z: 36, radius: 1.25, height: 1.3 },
] as const
interface SnowPile { id: string; x: number; z: number; radius: number }
const snowPiles: SnowPile[] = [
  { id: 'snow-building-west', x: -16, z: 43, radius: 5 },
  { id: 'snow-building-east', x: 16, z: 43, radius: 5 },
  { id: 'snow-entry', x: 0, z: 88, radius: 2.4 },
  { id: 'snow-entry-arrival', x: 0, z: 96, radius: 3.2 },
  { id: 'snow-plaza-west', x: -5, z: 44, radius: 2.4 },
  { id: 'snow-plaza-east', x: 5, z: 32, radius: 2.4 },
  { id: 'snow-lake', x: 47, z: 36, radius: 2.4 },
]
// Alternate broad snowy sections and exposed stone along the current map's walking routes.
// The same regions are exported to the server, so every visible patch supplies snowballs.
for (const [from, to, width] of EDGES) {
  const a = NODES[from]!, b = NODES[to]!, length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const count = Math.max(1, Math.round(length / 11)), radius = Math.min(3.7, width * .48) + .6
  for (let i = 0; i < count; i++) {
    const t = (i + .5) / count, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
    if (!insidePark(x, z, radius) || inLake(x, z, radius)
      || SITES.some(s => !s.kind && s.id !== 'plaza' && footprintDistance(s, x, z) < radius + .5)
      || TABLES.some(p => Math.hypot(x - p[0], z - p[1]) < radius + 2)
      || WINTER_DECOR.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.radius)
      || snowPiles.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.radius - .4)) continue
    const n = snowPiles.length
    const suffix = String.fromCharCode(97 + Math.floor(n / 26)) + String.fromCharCode(97 + n % 26)
    snowPiles.push({ id: 'snow-road-' + suffix, x, z, radius })
  }
}
function addGrassSnow(x: number, z: number, radius: number) {
  if (!insidePark(x, z, radius) || !onLand(x, z) || !isPlantingGround(x, z) || inLake(x, z, radius)
    || SITES.some(s => !s.kind && s.id !== 'plaza' && footprintDistance(s, x, z) < radius + .5)
    || TABLES.some(p => Math.hypot(x - p[0], z - p[1]) < radius + 2)
    || WINTER_DECOR.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.radius)
    || snowPiles.some(p => Math.hypot(x - p.x, z - p.z) < radius + p.radius - .4)) return
  const n = snowPiles.length
  const suffix = String.fromCharCode(97 + Math.floor(n / 26)) + String.fromCharCode(97 + n % 26)
  snowPiles.push({ id: 'snow-grass-' + suffix, x, z, radius })
}
// Include the woodland walking lanes, then add scattered drifts across the lawns.
for (const trail of FOREST_TRAILS) {
  const a = trail.points[0]!, b = trail.points[1]!
  addGrassSnow((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, trail.width / 2 + 1.2)
}
for (const [from, to, width] of EDGES) {
  const a = NODES[from]!, b = NODES[to]!, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz)
  const count = Math.floor(length / 14)
  for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
    const t = (i + .5) / count, offset = side * (width / 2 + 2.4)
    addGrassSnow(a[0] + dx * t - dz / length * offset, a[1] + dz * t + dx / length * offset, 3.2)
  }
}
for (let x = -91; x <= 91; x += 14) for (let z = -91; z <= 91; z += 14) {
  const offset = Math.sin(x * .71 + z * .37)
  addGrassSnow(x + offset * 1.8, z + Math.cos(x * .31 - z * .63) * 1.8, 4.1 + offset * .5)
}
export const SNOW_PILES: readonly SnowPile[] = snowPiles
export const SANTA = WINTER_DECOR[1]!
/** 완성품은 통행로·출입구 밖의 눈밭에만 설치한다. FE/BE가 같은 영역을 사용한다. */
export const SNOW_BUILD_ZONES = [
  { id: 'snow-building-west', x: -16, z: 43, radius: 5 },
  { id: 'snow-building-east', x: 16, z: 43, radius: 5 },
] as const
export const CHRISTMAS_TREE = WINTER_DECOR[0]!
