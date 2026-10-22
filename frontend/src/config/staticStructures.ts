import {
  PARK_PAVILIONS,
  PAVILION_STAIR_HALF_WIDTH,
  pavilionStairJoin,
  PAVILION_FENCE_SEGMENTS,
} from './parkPlan'
import {
  OBSERVATION_TOWER,
  TOWER_DECK_RAIL_SEGMENTS,
  TOWER_INNER_RAIL_CEILING,
  towerPoint,
  type MeshData,
} from './parkLayout'
import type { BoxCollider, Vec3 } from './world'

/** One watertight stair solid per flight, with no overlapping/internal box faces.
 * All flights share one render geometry and one static collision mesh. */
export function createPavilionStairs(): MeshData {
  const vertices: number[] = [],
    indices: number[] = []
  function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3) {
    const k = vertices.length / 3
    vertices.push(...a, ...b, ...c, ...d)
    const u = b.map((v, i) => v - a[i]!),
      v = c.map((n, i) => n - a[i]!)
    const dot =
      (u[1]! * v[2]! - u[2]! * v[1]!) * normal[0] +
      (u[2]! * v[0]! - u[0]! * v[2]!) * normal[1] +
      (u[0]! * v[1]! - u[1]! * v[0]!) * normal[2]
    indices.push(
      ...(dot > 0
        ? [k, k + 1, k + 2, k, k + 2, k + 3]
        : [k, k + 2, k + 1, k, k + 3, k + 2]),
    )
  }
  for (const p of PARK_PAVILIONS) {
    const rise = p.floor - p.ground,
      count = Math.ceil(rise / 0.18)
    const left = p.x - PAVILION_STAIR_HALF_WIDTH * p.scale
    const right = p.x + PAVILION_STAIR_HALF_WIDTH * p.scale
    for (const side of [-1, 1]) {
      const outer = p.z + side * (pavilionStairJoin(p.scale) + count * 0.5)
      const inner = outer - side * count * 0.5
      for (let i = 0; i < count; i++) {
        const z = outer - side * i * 0.5,
          next = z - side * 0.5
        const lower = p.ground + (rise * i) / count,
          top = p.ground + (rise * (i + 1)) / count
        quad(
          [left, top, z],
          [right, top, z],
          [right, top, next],
          [left, top, next],
          [0, 1, 0],
        )
        quad(
          [left, lower, z],
          [right, lower, z],
          [right, top, z],
          [left, top, z],
          [0, 0, side],
        )
        for (const [x, nx] of [
          [left, -1],
          [right, 1],
        ] as const)
          quad(
            [x, p.ground, z],
            [x, p.ground, next],
            [x, top, next],
            [x, top, z],
            [nx, 0, 0],
          )
      }
      quad(
        [left, p.ground, inner],
        [right, p.ground, inner],
        [right, p.floor, inner],
        [left, p.floor, inner],
        [0, 0, -side],
      )
      quad(
        [left, p.ground, outer],
        [right, p.ground, outer],
        [right, p.ground, inner],
        [left, p.ground, inner],
        [0, -1, 0],
      )
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}

/** Bake the existing oriented movement bounds into one static triangle collider.
 * Keep the source bounds available to navigation/camera queries, not Rapier objects. */
export function boxesToCollisionMesh(boxes: readonly BoxCollider[]): MeshData {
  const vertices: number[] = [],
    indices: number[] = []
  const faces = [
    0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3,
    7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4,
  ]
  for (const box of boxes) {
    const half = box.movementHalf ?? box.half
    const hy =
      box.movementHeight === undefined ? half[1] : box.movementHeight / 2
    const y = box.center[1] - box.half[1] + hy
    const angle = box.movementYaw ?? 0,
      cos = Math.cos(angle),
      sin = Math.sin(angle)
    const k = vertices.length / 3
    for (const [sx, sy, sz] of [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ]) {
      const x = sx! * half[0],
        z = sz! * half[2]
      vertices.push(
        box.center[0] + cos * x + sin * z,
        y + sy! * hy,
        box.center[2] - sin * x + cos * z,
      )
    }
    indices.push(...faces.map((i) => k + i))
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}
export function mergeCollisionMeshes(meshes: readonly MeshData[]): MeshData {
  const vertices = new Float32Array(
    meshes.reduce((n, m) => n + m.vertices.length, 0),
  )
  const indices = new Uint32Array(
    meshes.reduce((n, m) => n + m.indices.length, 0),
  )
  let v = 0,
    t = 0
  for (const mesh of meshes) {
    vertices.set(mesh.vertices, v)
    for (const index of mesh.indices) indices[t++] = index + v / 3
    v += mesh.vertices.length
  }
  return { vertices, indices }
}

/** Continuous wall ribbons replace overlapping tiny boxes. Six-degree arcs have
 * < 12mm chord error; the 80mm half-width covers that error and the visible rail.
 * End caps remain, while all internal segment faces are removed. */
export function createTowerRailCollision(): MeshData {
  const vertices: number[] = [],
    indices: number[] = []
  function ribbon(points: readonly Vec3[], ceiling = Infinity) {
    const base = vertices.length / 3
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!,
        prev = points[Math.max(0, i - 1)]!,
        next = points[Math.min(points.length - 1, i + 1)]!
      const dx = next[0] - prev[0],
        dz = next[2] - prev[2],
        len = Math.hypot(dx, dz)
      const nx = (-dz / len) * 0.08,
        nz = (dx / len) * 0.08
      for (const [side, height] of [
        [-1, -0.06],
        [1, -0.06],
        [-1, OBSERVATION_TOWER.railHeight],
        [1, OBSERVATION_TOWER.railHeight],
      ])
        vertices.push(
          p[0] + side! * nx,
          Math.min(p[1] + height!, ceiling),
          p[2] + side! * nz,
        )
      if (i > 0) {
        const a = base + (i - 1) * 4,
          b = a + 4
        indices.push(
          a,
          a + 2,
          b,
          b,
          a + 2,
          b + 2,
          a + 1,
          b + 1,
          a + 3,
          b + 1,
          b + 3,
          a + 3,
          a + 2,
          a + 3,
          b + 2,
          a + 3,
          b + 3,
          b + 2,
          a,
          b,
          a + 1,
          a + 1,
          b,
          b + 1,
        )
      }
    }
    const end = base + (points.length - 1) * 4
    indices.push(
      base,
      base + 1,
      base + 2,
      base + 1,
      base + 3,
      base + 2,
      end,
      end + 2,
      end + 1,
      end + 1,
      end + 2,
      end + 3,
    )
  }
  for (const radius of [OBSERVATION_TOWER.inner, OBSERVATION_TOWER.outer]) {
    const last = radius === OBSERVATION_TOWER.inner ? 179 : 180
    ribbon(
      Array.from({ length: last + 1 }, (_, i) => towerPoint(i / 180, radius)),
      radius === OBSERVATION_TOWER.inner ? TOWER_INNER_RAIL_CEILING : Infinity,
    )
  }
  // Group only adjoining deck edges. Preserve the stairwell opening and radial edge.
  let chain: Vec3[] = []
  for (const [a, b] of TOWER_DECK_RAIL_SEGMENTS) {
    const last = chain.at(-1)
    if (last && Math.hypot(last[0] - a[0], last[2] - a[2]) > 0.001) {
      ribbon(chain)
      chain = []
    }
    if (!chain.length) chain.push(a)
    chain.push(b)
  }
  if (chain.length) ribbon(chain)
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}

/** One oriented box per straight fence bay instead of staircase-shaped AABBs. */
export function pavilionFenceBounds(): BoxCollider[] {
  return PAVILION_FENCE_SEGMENTS.map((bay) => {
    const p = PARK_PAVILIONS.find((p) => p.id === bay.pavilionId)!
    const dx = bay.to[0] - bay.from[0],
      dz = bay.to[1] - bay.from[1]
    return {
      id: `${p.id}-merged-fence-${bay.side}`,
      center: [
        (bay.from[0] + bay.to[0]) / 2,
        p.floor + 2,
        (bay.from[1] + bay.to[1]) / 2,
      ],
      half: [0.09, 2, Math.hypot(dx, dz) / 2 + 0.06],
      movementYaw: Math.atan2(dx, dz),
      camera: false,
    }
  })
}
export function staticStructureBatch(
  id: string,
): 'stairs' | 'tower' | 'pavilion-fences' | null {
  if (/^P\d+-step-/.test(id)) return 'stairs'
  if (/^tower-(rail|deck-rail)-/.test(id)) return 'tower'
  if (/^P\d+-fence-/.test(id)) return 'pavilion-fences'
  return null
}
