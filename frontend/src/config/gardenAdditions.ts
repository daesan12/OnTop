import type { BoxCollider, Vec3 } from './world'

/** Additive planting only. The mature-tree manifest and its renderer stay unchanged. */
export const GARDEN_TREES = [
  { x: -44, z: 61, kind: 'pink-cherry', scale: 1.1 },
  { x: -30.5, z: 62, kind: 'white-cherry', scale: 0.85 },
  { x: -17, z: 65, kind: 'pink-cherry', scale: 1 },
  { x: 12, z: 64, kind: 'pink-cherry', scale: 1.05 },
  { x: 24, z: 62, kind: 'white-cherry', scale: 0.85 },
  { x: 31, z: 59, kind: 'maple', scale: 0.9 },
  { x: -25, z: -57, kind: 'maple', scale: 1 },
  { x: -8.5, z: -55.5, kind: 'white-cherry', scale: 0.8 },
  { x: 15, z: -67, kind: 'pink-cherry', scale: 1.1 },
  { x: 29, z: -68, kind: 'white-cherry', scale: 0.95 },
  { x: 39, z: -65, kind: 'maple', scale: 1 },
  { x: 48, z: -61, kind: 'pink-cherry', scale: 0.9 },
] as const
export const GARDEN_TREE_COLLIDERS: readonly BoxCollider[] = GARDEN_TREES.map(
  (t, i) => ({
    id: `garden-tree-${i}`,
    center: [t.x, 1.7 * t.scale, t.z] as Vec3,
    half: [0.27 * t.scale, 1.7 * t.scale, 0.27 * t.scale] as Vec3,
    camera: true,
  }),
)

/** Low, non-blocking planting edges, clear of the eight-metre arrival avenue. */
export const ARRIVAL_FLOWER_BEDS = [-1, 1].flatMap((side) =>
  [49, 57, 65].map((z) => ({ x: side * 6, z, width: 1.8, depth: 4.5 })),
)
