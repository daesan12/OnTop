import { EDGES, NODES, SITES, TABLES, footprintDistance, inLake, insidePark } from '../../../park-renewal-preview/plan'

/** 통행로·게임 진입점 바깥의 고정 겨울 장식. 충돌과 렌더링이 같은 배치를 사용한다. */
export const WINTER_DECOR = [
  { id: 'plaza-tree', kind: 'tree', x: 0, z: 38, radius: 2.5, height: 7.8 },
  { id: 'santa', kind: 'santa', x: 4, z: 42, radius: 1, height: 2.8 },
  { id: 'entry-snowman', kind: 'snowman', x: -5, z: 98, radius: .85, height: 3.1 },
  { id: 'plaza-snowman', kind: 'snowman', x: 0, z: 48, radius: .85, height: 3.1 },
  { id: 'lake-snowman', kind: 'snowman', x: 47, z: 33, radius: .85, height: 3.1 },
  { id: 'tree-gifts', kind: 'gifts', x: -3.7, z: 38, radius: 1.25, height: 1.3 },
  { id: 'plaza-gifts', kind: 'gifts', x: 3.7, z: 36, radius: 1.25, height: 1.3 },
] as const
interface SnowPile { id: string; x: number; z: number; radius: number }
const snowPiles: SnowPile[] = [
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
export const SNOW_PILES: readonly SnowPile[] = snowPiles
export const SANTA = WINTER_DECOR[1]!
