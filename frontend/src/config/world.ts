import { REFERENCE_PROP_COLLIDERS } from './parkProps'
import { DENSE_TREE_COLLIDERS } from './denseTrees'
import { GARDEN_TREE_COLLIDERS } from './gardenAdditions'
import { NOTES_BOX } from './notes'
import { EXPANSION_COLLIDERS, OUTER_TREES, WILLOW_TREES } from './parkExpansion'
import { FITNESS_COLLIDERS } from './fitness'
import {
  TELESCOPE_COLLIDERS,
  TELESCOPE_STEPS,
  TOWER_BENCH_SITES,
} from './telescopes'
import { GARDEN_PAGODA, PAGODA_COLLIDERS } from './pagoda'
import {
  TABLE_SEATS,
  PICNIC_TABLE_SEATS,
  tableSeats,
  tableScale,
} from './table-seats'
import { FOUNTAIN_BENCH_SITES, PLAZA_GARDEN_COLLIDERS } from './plazaGarden'
import { LAKE_ROCK_COLLIDERS } from './lakeRocks'
import { ADVERTISING_COLLIDERS } from './parkAdvertising'
import {
  BENCH_SITES,
  PAVILION_BENCH_SITES,
  groundHeight,
  PARK_SIZE,
  PARK_ENTRANCE,
  PARK_PAVILIONS,
  GAME_COURT,
  PAVILION_COLLIDERS,
  PAVILION_BASE_RADIUS,
  TOWER_RAILS,
  MINI_COLLIDERS,
  ACTIVITY_COLLIDERS,
  PICNIC_TABLES,
} from './parkLayout'
export type Vec3 = readonly [number, number, number]
export interface BoxCollider {
  id: string
  center: Vec3
  half: Vec3
  camera: boolean
  /** Optional player barrier height measured from the box bottom; camera keeps the art bounds. */
  movementHeight?: number
  /** Tighter oriented footprint for furniture; half remains its camera AABB. */
  movementHalf?: Vec3
  movementYaw?: number
}
export interface TableAnchor {
  id: string
  position: Vec3
  assetId: string
  seatAnchors: readonly Vec3[]
  spectatorRadius: number
  pavilionId?: string
  picnicId?: string
  /** Explicit world-space poses for authored maps with rotated/raised furniture. */
  seatUse?: readonly {x:number;y:number;z:number;yaw:number}[]
  seatExits?: readonly {x:number;y:number;z:number;yaw:number}[]
  floorY?: number
}
export const WORLD = {
  halfSize: PARK_SIZE / 2,
  boundaryHalfDepth: 0.35,
  boundaryHeight: 64,
  pavilion: [0, 0, PARK_PAVILIONS[0].z] as Vec3,
  groundY: 0,
} as const
export const PILLARS = Array.from({ length: 8 }, (_, i) => {
  const angle = Math.PI / 8 + (i * Math.PI) / 4
  return [Math.cos(angle) * 3.65, 2.57, Math.sin(angle) * 3.65 - 3] as Vec3
})
export const PAVILION = {
  floorHeight: 0.72,
  radius: PAVILION_BASE_RADIUS,
} as const
// Three approach treads; the raised platform itself is the fourth step.
export const PAVILION_STEPS: readonly BoxCollider[] = [0, 1, 2].map((i) => ({
  id: `pavilion-step-${i}`,
  center: [0, (0.18 * (i + 1)) / 2, 2.41 - i * 0.42] as Vec3,
  half: [1.65, (0.18 * (i + 1)) / 2, 0.24] as Vec3,
  camera: true,
}))
export const TREES: readonly Vec3[] = OUTER_TREES
export const BENCHES: readonly Vec3[] = [
  ...BENCH_SITES.map(({ x, z }) => [x, groundHeight(x, z), z] as Vec3),
  ...PAVILION_BENCH_SITES.map(({ x, y, z }) => [x, y, z] as Vec3),
  ...TOWER_BENCH_SITES.map(({ x, y, z }) => [x, y, z] as Vec3),
  ...FOUNTAIN_BENCH_SITES.map(({ x, y, z }) => [x, y, z] as Vec3),
]
export const BENCH_YAWS = [
  ...BENCH_SITES,
  ...PAVILION_BENCH_SITES,
  ...TOWER_BENCH_SITES,
  ...FOUNTAIN_BENCH_SITES,
].map((b) => b.yaw)
export const BENCH_HALF_WIDTHS = [
  ...BENCH_SITES.map(() => 1.4),
  ...PAVILION_BENCH_SITES.map((b) => b.halfWidth),
  ...TOWER_BENCH_SITES.map(() => 1.4),
  ...FOUNTAIN_BENCH_SITES.map(() => 1.4),
]
export const PAVILION_BENCH_EXIT = 1.1
export const BENCH_PAVILIONS = [
  ...BENCH_SITES.map(() => ''),
  ...PAVILION_BENCH_SITES.map((b) => b.pavilionId),
  ...TOWER_BENCH_SITES.map(() => ''),
  ...FOUNTAIN_BENCH_SITES.map(() => ''),
]
export const LAMPS: readonly Vec3[] = [
  ...[-68, -52, -38, 24, 53, 61, 71.5].flatMap((z) =>
    [-6, 6].map((x) =>
      // Move the two adjacent lamps outside the enlarged paved apron.
      z === -38
        ? ([
            GARDEN_PAGODA.x +
              Math.sign(x) * (GARDEN_PAGODA.plazaWidth / 2 + 0.85),
            0,
            GARDEN_PAGODA.z,
          ] as Vec3)
        : ([x, 0, z] as Vec3),
    ),
  ),
  [-39.5, 0, 38],
  [-35.5, 0, -10],
  [-72, 0, -35.5],
  [-40.4, 0, -50.4],
  [30.8, 0, -46],
  [30.8, 0, 16],
  [78.5, 0, -35],
  [78.5, 0, 4],
  [78.5, 0, 31],
  [-73, 0, 5],
]
const outdoorTables: readonly TableAnchor[] = [
  [-GAME_COURT.x, GAME_COURT.height, GAME_COURT.rows[0]],
  [GAME_COURT.x, GAME_COURT.height, GAME_COURT.rows[0]],
  [-GAME_COURT.x, GAME_COURT.height, GAME_COURT.rows[1]],
  [GAME_COURT.x, GAME_COURT.height, GAME_COURT.rows[1]],
].map((p, index) => ({
  id: 'table-' + (index + 1),
  position: p as unknown as Vec3,
  assetId: 'procedural/stone-game-table',
  seatAnchors: TABLE_SEATS.map(({ x, z }) => [x, 0, z] as Vec3),
  spectatorRadius: 3.5,
}))
export const TABLES: readonly TableAnchor[] = [
  ...outdoorTables,
  ...PARK_PAVILIONS.map((p, i) => ({
    id: `table-${i + 5}`,
    position: [p.x, p.floor, p.z] as Vec3,
    assetId: 'local/wood-game-table',
    pavilionId: p.id,
    seatAnchors: tableSeats({ pavilionId: p.id }).map(
      ({ x, z }) => [x, 0, z] as Vec3,
    ),
    spectatorRadius: 3.5,
  })),
  // Append only: existing outdoor and pavilion table IDs remain stable.
  ...PICNIC_TABLES.map(([x, z], i) => ({
    id: `table-${outdoorTables.length + PARK_PAVILIONS.length + i + 1}`,
    position: [x, 0, z] as Vec3,
    assetId: 'procedural/stone-picnic-table',
    picnicId: `picnic-${i}`,
    seatAnchors: PICNIC_TABLE_SEATS.map((seat) => [seat.x, 0, seat.z] as Vec3),
    spectatorRadius: 3.5,
  })),
]

/** Shared meters/Y-up collider manifest. Art can change without changing interaction identity. */
export const WORLD_COLLIDERS: readonly BoxCollider[] = [
  {
    id: 'ground',
    // Safety floor under the terrain, never a solid lid over water / sunken plazas.
    center: [0, -4.25, 0],
    half: [WORLD.halfSize, 0.25, WORLD.halfSize],
    camera: false,
  },
  {
    id: 'wall-n',
    center: [0, 1, -WORLD.halfSize],
    half: [WORLD.halfSize, 1, WORLD.boundaryHalfDepth],
    camera: true,
    movementHeight: WORLD.boundaryHeight,
  },
  {
    id: 'wall-s',
    center: [0, 1, WORLD.halfSize],
    half: [WORLD.halfSize, 1, WORLD.boundaryHalfDepth],
    camera: true,
    movementHeight: WORLD.boundaryHeight,
  },
  {
    id: 'wall-w',
    center: [-WORLD.halfSize, 1, 0],
    half: [WORLD.boundaryHalfDepth, 1, WORLD.halfSize],
    camera: true,
    movementHeight: WORLD.boundaryHeight,
  },
  {
    id: 'wall-e',
    center: [WORLD.halfSize, 1, 0],
    half: [WORLD.boundaryHalfDepth, 1, WORLD.halfSize],
    camera: true,
    movementHeight: WORLD.boundaryHeight,
  },
  ...EXPANSION_COLLIDERS,
  ...LAKE_ROCK_COLLIDERS,
  ...PLAZA_GARDEN_COLLIDERS,
  ...ADVERTISING_COLLIDERS,
  ...FITNESS_COLLIDERS,
  ...PAVILION_COLLIDERS,
  ...TOWER_RAILS,
  ...TELESCOPE_COLLIDERS,
  ...TELESCOPE_STEPS,
  ...MINI_COLLIDERS,
  ...ACTIVITY_COLLIDERS,
  {
    id: 'tower-notes-box',
    center: [NOTES_BOX.x, NOTES_BOX.y + 0.86, NOTES_BOX.z],
    half: [0.65, 0.86, 0.48],
    camera: true,
  },
  ...PAGODA_COLLIDERS,
  ...TABLES.map((t) => ({
    id: t.id,
    center: [t.position[0], t.position[1] + 0.53, t.position[2]] as Vec3,
    half: t.picnicId
      ? ([1.1, 0.53, 1.1] as Vec3)
      : ([1.05 * tableScale(t), 0.53, 0.8 * tableScale(t)] as Vec3),
    camera: true,
    // Taller than reachable park jumps, so capsule/autostep cannot climb the tabletop.
    // Keep the actual tabletop bounds above for orbit-camera collision.
    movementHeight: 4,
  })),
  ...TABLES.filter((t) => t.pavilionId).flatMap((t) =>
    tableSeats(t).map((seat, i) => ({
      id: t.id + '-chair-' + i,
      center: [
        t.position[0] + seat.x,
        t.position[1] + 0.62,
        t.position[2] + seat.z,
      ] as Vec3,
      half: [0.4 * tableScale(t), 0.62, 0.4 * tableScale(t)] as Vec3,
      camera: true,
      movementHeight: 2.5,
    })),
  ),
  // Outdoor stone seats are rendered too; use the server bake's movement walls.
  ...TABLES.filter((t) => !t.pavilionId && !t.picnicId).flatMap((t) =>
    tableSeats(t).map((seat, i) => ({
      id: `${t.id}-stone-seat-${i}`,
      center: [t.position[0] + seat.x, t.position[1] + 0.28, t.position[2] + seat.z] as Vec3,
      half: (i < 2 ? [1.05, 0.28, 0.26] : [0.26, 0.28, 0.425]) as Vec3,
      camera: true,
      movementHeight: 2.5,
    })),
  ),
  ...TABLES.filter((t) => t.picnicId).flatMap((t) =>
    PICNIC_TABLE_SEATS.map((seat, i) => ({
      id: `${t.id}-stool-${i}`,
      center: [t.position[0] + seat.x, 0.28, t.position[2] + seat.z] as Vec3,
      half: [0.325, 0.28, 0.325] as Vec3,
      camera: true,
      movementHeight: 2.5,
    })),
  ),
  ...REFERENCE_PROP_COLLIDERS,
  ...GARDEN_TREE_COLLIDERS,
  ...DENSE_TREE_COLLIDERS,
  ...TREES.map((p, i) => ({
    id: 'tree-' + i,
    center: [p[0], p[1] + 2, p[2]] as Vec3,
    half: [0.4, 2, 0.4] as Vec3,
    camera: true,
  })),
  ...WILLOW_TREES.map((p, i) => ({
    id: 'willow-' + i,
    center: [p[0], 2, p[2]] as Vec3,
    half: [0.32, 2, 0.32] as Vec3,
    camera: true,
  })),
  ...BENCHES.map((p, i) => ({
    id: 'bench-' + i,
    center: [p[0], p[1] + 0.65, p[2]] as Vec3,
    half: [
      Math.abs(Math.cos(BENCH_YAWS[i]!)) * BENCH_HALF_WIDTHS[i]! +
        Math.abs(Math.sin(BENCH_YAWS[i]!)) * 0.45,
      0.65,
      Math.abs(Math.sin(BENCH_YAWS[i]!)) * BENCH_HALF_WIDTHS[i]! +
        Math.abs(Math.cos(BENCH_YAWS[i]!)) * 0.45,
    ] as Vec3,
    camera: true,
    movementHalf: [BENCH_HALF_WIDTHS[i]!, 0.65, 0.45] as Vec3,
    movementYaw: BENCH_YAWS[i],
  })),
  ...LAMPS.map((p, i) => ({
    id: 'lamp-' + i,
    center: [p[0], p[1] + 1.8, p[2]] as Vec3,
    half: [0.13, 1.8, 0.13] as Vec3,
    camera: true,
  })),
]
export function spawnPosition(slot: number): Vec3 {
  return [
    ((slot % 4) - 1.5) * 1.35,
    0.84,
    PARK_ENTRANCE.spawnZ + Math.floor(slot / 4) * 1.35,
  ]
}
