import { EXISTING_TREE_PLANTINGS } from './existingTrees'
import type { BoxCollider, Vec3 } from './world'
import { LAKE } from './parkLandforms'
import { FOUNTAIN } from './parkPlan'
import {
  BRIDGE,
  SHORE_ARCS,
  bridgeHeight,
  STEPPING_STONES,
  STONE_CROSSING,
} from './lakeCrossings'
export { FOUNTAIN } from './parkPlan'
export {
  BRIDGE,
  SHORE_ARCS,
  bridgeHeight,
  STEPPING_STONES,
  STONE_CROSSING,
} from './lakeCrossings'
export { LAKE } from './parkLandforms'
export const COLONNADE = {
  x: -57,
  z: -2,
  halfWidth: 2.2,
  halfLength: 9,
} as const
export const EXPANSION_COLLIDERS: readonly BoxCollider[] = [
  ...SHORE_ARCS.flatMap((arc, side) =>
    arc.slice(1).map((p, i) => {
      const a = arc[i]!
      return {
        id: `shore-${side}-${i}`,
        center: [(p[0] + a[0]) / 2, 0.7, (p[2] + a[2]) / 2] as Vec3,
        half: [
          Math.abs(p[0] - a[0]) / 2 + 0.06,
          0.7,
          Math.abs(p[2] - a[2]) / 2 + 0.06,
        ] as Vec3,
        camera: true,
        movementHeight: 4,
      }
    }),
  ),
  ...Array.from({ length: BRIDGE.segments }, (_, i) => {
    const step = (BRIDGE.endX - BRIDGE.startX) / BRIDGE.segments,
      x = BRIDGE.startX + (i + 0.5) * step,
      h = bridgeHeight(x)
    return {
      id: `bridge-deck-${i}`,
      center: [x, h / 2, BRIDGE.z] as Vec3,
      half: [step / 2 + 0.004, h / 2, BRIDGE.halfWidth] as Vec3,
      camera: false,
    }
  }),
  ...[-1, 1].flatMap((side) =>
    Array.from({ length: BRIDGE.endX - BRIDGE.startX }, (_, i) => {
      const x = BRIDGE.startX + i + 0.5
      return {
        id: `bridge-rail-${side}-${i}`,
        center: [
          x,
          bridgeHeight(x) + 0.7,
          BRIDGE.z + side * BRIDGE.halfWidth,
        ] as Vec3,
        half: [0.505, 0.7, 0.07] as Vec3,
        camera: true,
        movementHeight: 4,
      }
    }),
  ),
  // Conservative circular footprint of the 5.4m stone base. Thin strips remove
  // the old square's invisible corners; the server map must be rebaked in sync.
  ...Array.from({ length: 48 }, (_, i): BoxCollider => {
    const radius = 5.4, step = radius * 2 / 48
    const low = -radius + i * step, high = low + step
    const nearest = Math.max(0, Math.abs((low + high) / 2) - step / 2)
    return {
      id: `fountain-basin-${i}`,
      center: [FOUNTAIN.x, 0.7 - FOUNTAIN.plazaDepth, FOUNTAIN.z + (low + high) / 2],
      half: [Math.sqrt(radius * radius - nearest * nearest), 0.7, step / 2],
      camera: true,
      movementHeight: 4,
    }
  }),
  ...STEPPING_STONES.map((s, i) => ({
    id: 'stepping-stone-' + i,
    center: [s.x, (s.top + s.bottom) / 2, s.z] as Vec3,
    half: [s.width / 2, (s.top - s.bottom) / 2, s.depth / 2] as Vec3,
    camera: false,
  })),
]
// Frozen planting: path edits must not reseed existing tree geometry or positions.
export type TreeKind =
  'broadleaf' | 'slender' | 'cone' | 'box' | 'round' | 'column'
export const TREE_PLANTINGS = EXISTING_TREE_PLANTINGS
export const OUTER_TREES: readonly Vec3[] = TREE_PLANTINGS.map(
  (t) => t.position,
)

export const WILLOW_TREES: readonly Vec3[] = Array.from(
  { length: 18 },
  (_, i) => {
    const a = ((i + 0.35) * Math.PI * 2) / 18
    return [
      LAKE.x + Math.cos(a) * (LAKE.radiusX + 0.12),
      0,
      LAKE.z + Math.sin(a) * (LAKE.radiusZ + 0.12),
    ] as Vec3
  },
).filter(
  ([x, , z]) =>
    ![BRIDGE, STONE_CROSSING].some((c) => Math.abs(z - c.z) < 4) &&
    Math.abs(x) < 76,
)
