import { LAKE } from './parkLandforms'
import { GARDEN_PAGODA } from './pagoda'
import {
  PARK_PAVILIONS,
  FOUNTAIN,
  PAGODA_SITE,
  TOWER_SITE,
  MAILBOX,
} from './parkPlan'

export type ParkPoint = readonly [number, number]
export interface ParkRoute {
  id: string
  points: readonly ParkPoint[]
  width: number
  closed?: boolean
}
export interface ParkWalkway {
  from: ParkPoint
  to: ParkPoint
  width: number
}
const line = (
  id: string,
  from: ParkPoint,
  to: ParkPoint,
  width: number,
): ParkRoute => ({ id, points: [from, to], width })
/** Sampled cubic curves are shared by paving, guide map and vegetation exclusion. */
function curve(
  id: string,
  a: ParkPoint,
  b: ParkPoint,
  c: ParkPoint,
  d: ParkPoint,
  width: number,
): ParkRoute {
  return {
    id,
    width,
    points: Array.from({ length: 49 }, (_, i) => {
      const t = i / 48,
        u = 1 - t
      return [
        u * u * u * a[0] +
          3 * u * u * t * b[0] +
          3 * u * t * t * c[0] +
          t * t * t * d[0],
        u * u * u * a[1] +
          3 * u * u * t * b[1] +
          3 * u * t * t * c[1] +
          t * t * t * d[1],
      ]
    }),
  }
}
function ellipse(
  id: string,
  x: number,
  z: number,
  rx: number,
  rz: number,
  width: number,
): ParkRoute {
  return {
    id,
    width,
    closed: true,
    points: Array.from({ length: 161 }, (_, i) => [
      x + Math.cos((i * Math.PI) / 80) * rx,
      z + Math.sin((i * Math.PI) / 80) * rz,
    ]),
  }
}

// Each bench sits on a paved alcove connected to a pedestrian route. Front is local +Z.
export const BENCH_SITES = [
  { x: -9, z: 34.75, yaw: 0 },
  { x: 9, z: 34.75, yaw: 0 },
  { x: -56, z: -53.5, yaw: 0 },
  { x: -64.5, z: -45, yaw: Math.PI / 2 },
  { x: -47.5, z: -45, yaw: -Math.PI / 2 },
  { x: -56, z: -36.5, yaw: Math.PI },
  { x: -68, z: 50, yaw: Math.PI },
  { x: -54, z: 50, yaw: Math.PI },
  { x: -39, z: 31, yaw: Math.PI / 2 },
  { x: -35.5, z: -3, yaw: Math.PI / 2 },
  { x: -24.8, z: -51.5, yaw: 0 },
  { x: 12, z: -51.5, yaw: 0 },
  { x: 31.2, z: -39, yaw: Math.PI / 2 },
  { x: 31.2, z: 5, yaw: Math.PI / 2 },
  { x: 73, z: 39, yaw: Math.PI / 2 },
  { x: 43, z: 54, yaw: -Math.PI / 2 },
  { x: -20, z: 70, yaw: 0 },
  { x: 12, z: 70, yaw: 0 },
  { x: -12.5, z: -8.5, yaw: Math.PI / 2 },
  { x: 12.5, z: -8.5, yaw: -Math.PI / 2 },
] as const
const BASE_ROUTES: readonly ParkRoute[] = [
  line('arrival', [0, 75], [0, 16], 8),
  line(
    'mailbox-pocket',
    [MAILBOX.x, MAILBOX.z + 1.7],
    [-9.8, MAILBOX.z + 1.7],
    3,
  ),
  line(
    'north-axis',
    [PAGODA_SITE.x, PAGODA_SITE.z - GARDEN_PAGODA.plazaWidth / 2 + 0.1],
    [0, -75],
    6,
  ),
  line(
    'main-rear',
    [0, -7],
    [PAGODA_SITE.x, PAGODA_SITE.z + GARDEN_PAGODA.plazaWidth / 2 - 0.1],
    4,
  ),
  line('main-west', [-9.8, 20], [-9.8, -24], 3),
  line('main-east', [9.8, 20], [9.8, -24], 3),
  line('west-garden', [-33, 42], [-33, -48.9], 3),
  line('west-north', [-33, -48.9], [34, -48.9], 3),
  line('east-garden', [31, 42], [31, 20], 3),
  curve('fountain-link', [-56, -31], [-53, -24], [-37, -23], [-9.8, -24], 4),
  line('mini-link', [-75, 10], [-33, 16], 3),
  line('west-side', [-75, -75], [-75, 75], 3),
  line('south-side', [-75, 75], [76, 75], 3),
  line('east-side', [76, 75], [76, -75], 3),
  line('north-side', [-75, -75], [76, -75], 3),
  line('arrival-crossing', [-75, 42], [40, 42], 5),
  line('fitness-rest-pocket', [-56, 47.5], [-56, 51.5], 6),
  // Short right-angle detour preserves the mature trunks beside the rest area.
  line('fitness-rest-link', [-56, 51.5], [-65, 51.5], 2),
  line('fitness-rest-turn', [-65, 51.5], [-65, 47], 2),
  line('fitness-rest-west', [-65, 47], [-75, 47], 2),
  line('lake-entry', [40, 42], [40, 54], 3),
  line('bridge-link', [-33, 20], [42, 20], 4),
  line('bridge-east-landing', [70, 20], [76, 20], 4),
  line('east-connector', [34, 20], [34, -48.9], 3),
  line('stone-crossing-west', [34, -24], [40, -24], 3),
  line('stone-crossing-east', [72, -24], [76, -24], 3),
  line(
    'tower-entry',
    [76, TOWER_SITE.z],
    [TOWER_SITE.x + 6.5, TOWER_SITE.z],
    3,
  ),
  ellipse(
    'central-garden-ring',
    PAGODA_SITE.x,
    PAGODA_SITE.z,
    8 * PAGODA_SITE.scale * PAGODA_SITE.widthScale,
    8 * PAGODA_SITE.scale * PAGODA_SITE.widthScale,
    3,
  ),
  ellipse('fountain-ring', FOUNTAIN.x, FOUNTAIN.z, 12, 12, 3.5),
  ellipse('lakeside', LAKE.x, LAKE.z, LAKE.radiusX + 3, LAKE.radiusZ + 3, 3),
  ...PARK_PAVILIONS.slice(1).map((p) =>
    line('pavilion-' + p.id, [p.x, p.z - 9], [p.x, p.z + 9], 4),
  ),
  ...[-43, -24, -5, 13, 37].map((z) =>
    line('game-link-' + z, [-33, z], [34, z], 3),
  ),
  line('table-south-row', [-14, 29], [14, 29], 3),
]
export const BENCH_ALCOVES: ParkRoute[] = BENCH_SITES.flatMap((bench, i) => {
  const front: ParkPoint = [
    bench.x + Math.sin(bench.yaw) * 1.8,
    bench.z + Math.cos(bench.yaw) * 1.8,
  ]
  let closest: ParkPoint = front,
    best = Infinity
  for (const route of BASE_ROUTES)
    for (let j = 1; j < route.points.length; j++) {
      const a = route.points[j - 1]!,
        b = route.points[j]!,
        dx = b[0] - a[0],
        dz = b[1] - a[1]
      const t = Math.max(
        0,
        Math.min(
          1,
          ((front[0] - a[0]) * dx + (front[1] - a[1]) * dz) /
            (dx * dx + dz * dz),
        ),
      )
      const p: ParkPoint = [a[0] + dx * t, a[1] + dz * t],
        d = Math.hypot(front[0] - p[0], front[1] - p[1])
      if (d < best) {
        best = d
        closest = p
      }
    }
  const behind: ParkPoint = [
    bench.x - Math.sin(bench.yaw) * 0.8,
    bench.z - Math.cos(bench.yaw) * 0.8,
  ]
  // Independent strips avoid a folded U-turn when the closest path is behind
  // the seat (for example, a bench facing into the fountain plaza).
  return [
    line('bench-alcove-' + i, behind, front, 3.4),
    ...(best > 0.05
      ? [line('bench-alcove-link-' + i, front, closest, 3.4)]
      : []),
  ]
})
export const PARK_ROUTES: readonly ParkRoute[] = [
  ...BASE_ROUTES,
  ...BENCH_ALCOVES,
]
export const PARK_WALKWAYS: readonly ParkWalkway[] = PARK_ROUTES.flatMap(
  (route) =>
    route.points
      .slice(1)
      .map((to, i) => ({ from: route.points[i]!, to, width: route.width })),
)
// Lawn placement queries thousands of points. Reject distant segments with a
// conservative box before running the unchanged capsule-distance calculation.
const walkwayBounds = PARK_WALKWAYS.map((segment) => ({
  segment,
  minX: Math.min(segment.from[0], segment.to[0]) - segment.width / 2,
  maxX: Math.max(segment.from[0], segment.to[0]) + segment.width / 2,
  minZ: Math.min(segment.from[1], segment.to[1]) - segment.width / 2,
  maxZ: Math.max(segment.from[1], segment.to[1]) + segment.width / 2,
}))
export function distanceToParkSegment(x: number, z: number, p: ParkWalkway) {
  const dx = p.to[0] - p.from[0],
    dz = p.to[1] - p.from[1],
    length2 = dx * dx + dz * dz
  const t = length2
    ? Math.max(
        0,
        Math.min(1, ((x - p.from[0]) * dx + (z - p.from[1]) * dz) / length2),
      )
    : 0
  return Math.hypot(x - p.from[0] - dx * t, z - p.from[1] - dz * t)
}
export function isOnParkWalkway(x: number, z: number, padding = 0) {
  // A tiny outward tolerance keeps floating-point boundary points in the exact
  // test; it never expands the accepted walkway itself.
  const margin = padding + 1e-10
  return walkwayBounds.some(
    ({ segment, minX, maxX, minZ, maxZ }) =>
      x >= minX - margin &&
      x <= maxX + margin &&
      z >= minZ - margin &&
      z <= maxZ + margin &&
      distanceToParkSegment(x, z, segment) <= segment.width / 2 + padding,
  )
}
/** Mitered strip vertices follow bends, with UV metres along/across each route. */
export function createPathStrip(route: ParkRoute) {
  const vertices: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  let distance = 0
  // Sample long straights so paving follows the shared collision terrain.
  const points: ParkPoint[] = [route.points[0]!]
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!,
      b = route.points[i]!
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])))
    for (let n = 1; n <= steps; n++)
      points.push([
        a[0] + ((b[0] - a[0]) * n) / steps,
        a[1] + ((b[1] - a[1]) * n) / steps,
      ])
  }
  points.forEach((point, i) => {
    const previous =
      points[i - 1] ?? (route.closed ? points[points.length - 2]! : point)
    const next = points[i + 1] ?? (route.closed ? points[1]! : point)
    const dx = next[0] - previous[0],
      dz = next[1] - previous[1],
      len = Math.hypot(dx, dz) || 1
    if (i)
      distance += Math.hypot(point[0] - previous[0], point[1] - previous[1])
    for (const side of [-1, 1]) {
      vertices.push(
        point[0] - (((dz / len) * route.width) / 2) * side,
        0,
        point[1] + (((dx / len) * route.width) / 2) * side,
      )
      uv.push(((side + 1) * route.width) / 2, distance)
    }
    if (i) {
      const j = (i - 1) * 2
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2)
    }
  })
  return { vertices, uv, indices }
}
