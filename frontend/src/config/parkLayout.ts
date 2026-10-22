import type { BoxCollider, Vec3 } from './world'
import { LAKE, lakeRadiusAt } from './parkLandforms'
import {
  PARK_SIZE,
  PARK_PAVILIONS,
  PAVILION_FENCE_SEGMENTS,
  PAVILION_TIMBER,
  MINI_PROPS,
  VR_ZONE,
  MAILBOX,
  FOUNTAIN,
  FITNESS_AREA,
  PAGODA_SITE,
  TOWER_SITE,
  pavilionStairJoin,
  PAVILION_STAIR_HALF_WIDTH,
} from './parkPlan'
export {
  PARK_SIZE,
  PARK_ENTRANCE,
  PARK_PAVILIONS,
  PAVILION_LANTERN,
  PAVILION_FENCE_SEGMENTS,
  PAVILION_BENCH_SITES,
  PAVILION_CLOSED_SIDES,
  PAVILION_TIMBER,
  pavilionBenchRadius,
  pavilionBenchHalfWidth,
  MINI_PROPS,
  VR_ZONE,
  MAILBOX,
  PAVILION_BASE_RADIUS,
  PAVILION_STAIR_HALF_WIDTH,
  pavilionStairJoin,
} from './parkPlan'
export {
  PARK_ROUTES,
  PARK_WALKWAYS,
  BENCH_SITES,
  BENCH_ALCOVES,
  isOnParkWalkway,
  createPathStrip,
} from './parkPaths'
export type { ParkWalkway, ParkRoute } from './parkPaths'

export const TERRAIN_GRID = 2
export const PARK_PATHS = {
  perimeter: 75,
  southSplit: 34,
  gardenZ: -54,
  westLinkX: -34,
} as const
export const GAME_COURT = {
  x: 10,
  z: 23.5,
  halfWidth: 6,
  halfDepth: 10,
  height: 0,
  rows: [18, 29],
} as const
export const OBSERVATION_TOWER = {
  ...TOWER_SITE,
  height: 18,
  inner: 5,
  outer: 8,
  turns: 3,
  segments: 360,
  railHeight: 1.4,
  // Clear the visible timber rail on an intentional jump, without changing park jumps.
  jumpSpeed: 7.8,
} as const
export function isTowerSurface(x: number, footY: number, z: number) {
  const t = OBSERVATION_TOWER
  const radius = Math.hypot(x - t.x, z - t.z)
  if (radius > t.outer + 0.08) return false
  if (Math.abs(footY - t.height - 0.12) < 0.25) return true
  if (radius < t.inner - 0.08) return false
  const angle = (Math.atan2(z - t.z, x - t.x) + Math.PI * 2) % (Math.PI * 2)
  const rise = t.height / t.turns
  const base = 0.12 + (angle / (Math.PI * 2)) * rise
  const turn = Math.round((footY - base) / rise)
  return (
    turn >= 0 && turn < t.turns && Math.abs(footY - base - turn * rise) < 0.25
  )
}
export const PARK_ZONES = [
  { id: 'central', name: '메인 팔각정', x: 0, z: 6 },
  { id: 'games-west', name: '중앙 게임마당 서편', x: -10, z: 23.5 },
  { id: 'games-east', name: '중앙 게임마당 동편', x: 10, z: 23.5 },
  { id: 'lake', name: '버드나무 호수 · 돌다리', x: LAKE.x, z: LAKE.z },
  { id: 'tower', name: '호숫가 전망대', ...TOWER_SITE },
  { id: 'fitness', name: '운동마당', x: FITNESS_AREA.x, z: FITNESS_AREA.z },
  { id: 'mini', name: '붕어빵 카트', x: MINI_PROPS[0].x, z: MINI_PROPS[0].z },
  { id: 'vr', name: 'VR 구역 · 돌탑 점프맵', x: VR_ZONE.x, z: VR_ZONE.z },
  { id: 'fountain', name: '서쪽 분수광장', x: FOUNTAIN.x, z: FOUNTAIN.z },
  { id: 'mailbox', name: '소리함', x: MAILBOX.x, z: MAILBOX.z },
  { id: 'pagoda', name: '중앙 석탑', ...PAGODA_SITE },
] as const
export const LAKE_WALK = { offset: 3, width: 3 } as const
const clamp = (n: number) => Math.max(0, Math.min(1, n))
export function terrainHeight(x: number, z: number) {
  const lakeRadius = lakeRadiusAt(x, z)
  if (lakeRadius < 1) return -LAKE.depth * clamp((1 - lakeRadius) / 0.3)
  const radius = Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z)
  if (radius >= FOUNTAIN.plazaRadius) return 0
  return (
    -FOUNTAIN.plazaDepth *
    clamp(
      (FOUNTAIN.plazaRadius - radius) /
        (FOUNTAIN.plazaRadius - FOUNTAIN.innerPlazaRadius),
    )
  )
}

export interface MeshData {
  vertices: Float32Array
  indices: Uint32Array
}
/** Height on the exact two-metre collision triangles, for decals and foliage. */
export function groundHeight(x: number, z: number) {
  const ax = Math.floor(x / TERRAIN_GRID) * TERRAIN_GRID,
    az = Math.floor(z / TERRAIN_GRID) * TERRAIN_GRID
  const u = (x - ax) / TERRAIN_GRID,
    v = (z - az) / TERRAIN_GRID
  const a = terrainHeight(ax, az),
    b = terrainHeight(ax + TERRAIN_GRID, az),
    c = terrainHeight(ax, az + TERRAIN_GRID),
    d = terrainHeight(ax + TERRAIN_GRID, az + TERRAIN_GRID)
  return u + v <= 1
    ? a + u * (b - a) + v * (c - a)
    : d + (1 - v) * (b - d) + (1 - u) * (c - d)
}
export function createTerrainMesh(): MeshData {
  const n = PARK_SIZE / TERRAIN_GRID,
    step = PARK_SIZE / n
  const vertices = new Float32Array((n + 1) ** 2 * 3)
  const indices = new Uint32Array(n * n * 6)
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      const px = -PARK_SIZE / 2 + x * step,
        pz = -PARK_SIZE / 2 + z * step,
        k = (z * (n + 1) + x) * 3
      vertices.set([px, terrainHeight(px, pz), pz], k)
    }
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const a = z * (n + 1) + x,
        b = a + 1,
        c = a + n + 1
      indices.set([a, c, b, b, c, c + 1], (z * n + x) * 6)
    }
  return { vertices, indices }
}
export const PAVILION_COLLIDERS: readonly BoxCollider[] =
  PARK_PAVILIONS.flatMap((p) => {
    const boxes: BoxCollider[] = []
    const rise = p.floor - p.ground,
      count = Math.ceil(rise / 0.18),
      tread = 0.5
    for (const side of [1, -1])
      for (let i = 0; i < count; i++) {
        const h = (rise * (i + 1)) / count
        boxes.push({
          id: `${p.id}-step-${side === 1 ? 'front' : 'rear'}-${i}`,
          center: [
            p.x,
            p.ground + h / 2,
            p.z +
              side * (pavilionStairJoin(p.scale) + (count - i - 0.5) * tread),
          ],
          half: [PAVILION_STAIR_HALF_WIDTH * p.scale, h / 2, tread / 2 + 0.01],
          camera: true,
        })
      }
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4
      boxes.push({
        id: `${p.id}-pillar-${i}`,
        center: [
          p.x + Math.cos(a) * 3.65 * p.scale,
          p.floor + 1.85 * p.scale,
          p.z + Math.sin(a) * 3.65 * p.scale,
        ],
        half: [0.23 * p.scale, 1.85 * p.scale, 0.23 * p.scale],
        camera: true,
      })
    }
    boxes.push({
      id: `${p.id}-roof`,
      center: [p.x, p.floor + 4.3 * p.scale, p.z],
      half: [4.8 * p.scale, 0.3, 4.8 * p.scale],
      camera: true,
    })
    // Short segments closely follow diagonal bays without an oversized blocking AABB.
    for (const bay of PAVILION_FENCE_SEGMENTS.filter(
      (b) => b.pavilionId === p.id,
    )) {
      const dx = bay.to[0] - bay.from[0],
        dz = bay.to[1] - bay.from[1]
      const n = Math.ceil(Math.hypot(dx, dz) / 0.35)
      for (let i = 0; i < n; i++)
        boxes.push({
          id: `${p.id}-fence-${bay.side}-${i}`,
          center: [
            bay.from[0] + (dx * (i + 0.5)) / n,
            p.floor + PAVILION_TIMBER.railHeight / 2,
            bay.from[1] + (dz * (i + 0.5)) / n,
          ],
          half: [
            Math.abs(dx) / n / 2 + 0.06,
            PAVILION_TIMBER.railHeight / 2,
            Math.abs(dz) / n / 2 + 0.06,
          ],
          camera: true,
          movementHeight: 4,
        })
    }
    return boxes
  })
export function towerPoint(t: number, radius: number): Vec3 {
  const a = t * Math.PI * 2 * OBSERVATION_TOWER.turns
  return [
    OBSERVATION_TOWER.x + Math.cos(a) * radius,
    t * OBSERVATION_TOWER.height + 0.12,
    OBSERVATION_TOWER.z + Math.sin(a) * radius,
  ]
}
export function createTowerRamp(): MeshData {
  const t = OBSERVATION_TOWER,
    vertices: number[] = [],
    indices: number[] = []
  for (let i = 0; i <= t.segments; i++)
    vertices.push(
      ...towerPoint(i / t.segments, t.inner),
      ...towerPoint(i / t.segments, t.outer),
    )
  for (let i = 0; i < t.segments; i++) {
    const a = i * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}
// Leave an open stairwell above the final ramp arc; a full disk traps the
// character's head below the summit. Both physics and rendering use this mesh.
export const TOWER_DECK_ARC = Math.PI * 1.25
// The spiral's inner guard is below the solid summit disk. Its jump barrier
// must not protrude through that floor; the stairwell has its own deck guard.
export const TOWER_INNER_RAIL_CEILING = OBSERVATION_TOWER.height + 0.08
export function createTowerDeck(): MeshData {
  const vertices: number[] = [],
    indices: number[] = []
  for (let i = 0; i < 96; i++) {
    const a = (i * Math.PI) / 48,
      b = ((i + 1) * Math.PI) / 48
    const radius =
      a < TOWER_DECK_ARC - 1e-6
        ? OBSERVATION_TOWER.outer
        : OBSERVATION_TOWER.inner
    const k = vertices.length / 3,
      y = OBSERVATION_TOWER.height + 0.12
    vertices.push(
      OBSERVATION_TOWER.x,
      y,
      OBSERVATION_TOWER.z,
      OBSERVATION_TOWER.x + Math.cos(a) * radius,
      y,
      OBSERVATION_TOWER.z + Math.sin(a) * radius,
      OBSERVATION_TOWER.x + Math.cos(b) * radius,
      y,
      OBSERVATION_TOWER.z + Math.sin(b) * radius,
    )
    indices.push(k, k + 2, k + 1)
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}
export const TOWER_DECK_RAIL_SEGMENTS: readonly (readonly [Vec3, Vec3])[] = [
  ...Array.from({ length: 94 }, (_, i) => {
    const a = (i * Math.PI) / 48,
      b = ((i + 1) * Math.PI) / 48,
      r = i < 60 ? OBSERVATION_TOWER.outer : OBSERVATION_TOWER.inner
    return [towerDeckPoint(a, r), towerDeckPoint(b, r)] as const
  }),
  [
    towerDeckPoint(TOWER_DECK_ARC, OBSERVATION_TOWER.inner),
    towerDeckPoint(TOWER_DECK_ARC, OBSERVATION_TOWER.outer),
  ],
]
function towerDeckPoint(a: number, r: number): Vec3 {
  return [
    OBSERVATION_TOWER.x + Math.cos(a) * r,
    OBSERVATION_TOWER.height + 0.12,
    OBSERVATION_TOWER.z + Math.sin(a) * r,
  ]
}
const spiralRails: readonly BoxCollider[] = [5, 8]
  .flatMap((radius) =>
    Array.from({ length: 360 }, (_, i) => {
      const a = towerPoint(i / 360, radius),
        b = towerPoint((i + 1) / 360, radius)
      return {
        id: `tower-rail-${radius}-${i}`,
        movementHeight:
          radius === OBSERVATION_TOWER.inner
            ? Math.min(
                OBSERVATION_TOWER.railHeight,
                TOWER_INNER_RAIL_CEILING - (a[1] + b[1]) / 2,
              )
            : OBSERVATION_TOWER.railHeight,
        center: [
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2 + 0.7,
          (a[2] + b[2]) / 2,
        ] as Vec3,
        half: [
          Math.abs(a[0] - b[0]) / 2 + 0.06,
          0.7,
          Math.abs(a[2] - b[2]) / 2 + 0.06,
        ] as Vec3,
        camera: true,
      }
    }),
  )
  .filter((_, i) => i < 358 || i >= 360)
export const TOWER_RAILS: readonly BoxCollider[] = [
  ...spiralRails,
  ...TOWER_DECK_RAIL_SEGMENTS.map(([a, b], i) => ({
    id: 'tower-deck-rail-' + i,
    movementHeight: OBSERVATION_TOWER.railHeight,
    center: [(a[0] + b[0]) / 2, a[1] + 0.7, (a[2] + b[2]) / 2] as Vec3,
    half: [
      Math.abs(a[0] - b[0]) / 2 + 0.04,
      0.7,
      Math.abs(a[2] - b[2]) / 2 + 0.04,
    ] as Vec3,
    camera: true,
  })),
]
export const VR_PAGODA = {
  id: 'vr-pagoda',
  x: VR_ZONE.x + 8,
  z: VR_ZONE.z - 1,
  scale: 0.7,
} as const
export const VR_COURSE_PADS = Array.from({ length: 24 }, (_, i) => {
  const angle = Math.PI / 2 + (i * Math.PI) / 4
  return {
    x: VR_PAGODA.x + Math.cos(angle) * 4.7,
    z: VR_PAGODA.z + Math.sin(angle) * 4.7,
    height: 0.65 + i * 0.65,
    thickness: 0.24,
    width: 1.8,
    depth: 1.8,
  }
})
export const MINI_COLLIDERS: readonly BoxCollider[] = [
  {
    id: 'vr-pagoda-body',
    center: [VR_PAGODA.x, 7, VR_PAGODA.z],
    half: [3, 7, 3],
    camera: true,
  },
  {
    id: 'fish-bread',
    center: [MINI_PROPS[0].x, 1.5, MINI_PROPS[0].z],
    half: [2, 1.5, 1.25],
    camera: true,
  },
  {
    id: 'vr-back',
    center: [MINI_PROPS[1].x, 1.6, MINI_PROPS[1].z - 4.3],
    half: [6.25, 1.6, 0.1],
    camera: true,
  },
  ...[-1, 1].map((side) => ({
    id: 'vr-side-' + side,
    center: [MINI_PROPS[1].x + side * 6.2, 1.35, MINI_PROPS[1].z - 0.2] as Vec3,
    half: [0.075, 1.35, 4.1] as Vec3,
    camera: true,
  })),
  ...[-3, 0, 3].map((x) => ({
    id: 'vr-locker-' + x,
    center: [MINI_PROPS[1].x + x, 0.5, MINI_PROPS[1].z - 2] as Vec3,
    half: [0.9, 0.5, 0.5] as Vec3,
    camera: true,
  })),
  ...VR_COURSE_PADS.map((p, i) => ({
    id: 'future-jump-pad-' + i,
    center: [p.x, p.height - p.thickness / 2, p.z] as Vec3,
    half: [p.width / 2, p.thickness / 2, p.depth / 2] as Vec3,
    camera: true,
  })),
]
export const PICNIC_TABLES = [
  [-56, 57],
  [-23, -62],
  [24, 61],
] as const
export const ACTIVITY_COLLIDERS: readonly BoxCollider[] = [
  {
    id: 'feedback-mailbox',
    center: [MAILBOX.x, MAILBOX.height / 2, MAILBOX.z],
    half: [MAILBOX.bodyHalfWidth, MAILBOX.height / 2, MAILBOX.bodyHalfDepth],
    camera: true,
  },
]
