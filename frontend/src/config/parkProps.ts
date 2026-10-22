import type { BoxCollider, Vec3 } from './world'
import { MINI_PROPS } from './parkPlan'
export const STREET_PLANTERS = [
  { x: -13, z: 46.2, kind: 'bowl' },
  { x: 13, z: 46.2, kind: 'bowl' },
  { x: -11.9, z: 45.6, kind: 'square' },
  { x: 11.9, z: 45.6, kind: 'square' },
] as const
const hall = MINI_PROPS[1]
export const REFERENCE_PROP_COLLIDERS: readonly BoxCollider[] = [
  {
    id: 'vr-apron',
    center: [hall.x, 0.07, hall.z],
    half: [6.25, 0.07, 4.3],
    camera: false,
  },
  ...STREET_PLANTERS.map((p, i) => ({
    id: `street-planter-${i}`,
    center: [p.x, 0.5, p.z] as Vec3,
    half: [
      p.kind === 'bowl' ? 0.6 : 0.38,
      0.5,
      p.kind === 'bowl' ? 0.6 : 0.38,
    ] as Vec3,
    camera: true,
  })),
  ...[-6.05, 6.05].flatMap((x) =>
    [-4.12, 3.65].map((z) => ({
      id: `vr-column-${x}-${z}`,
      center: [hall.x + x, 1.85, hall.z + z] as Vec3,
      half: [0.24, 1.85, 0.24] as Vec3,
      camera: true,
    })),
  ),
  ...[-6.05, 6.05].flatMap((x) =>
    [-4.12, 3.65].map((z) => ({
      id: `vr-column-base-${x}-${z}`,
      center: [hall.x + x, 0.2, hall.z + z] as Vec3,
      half: [0.36, 0.2, 0.36] as Vec3,
      camera: true,
    })),
  ),
  ...[-5.1, 5.1].map((x) => ({
    id: `vr-display-${x}`,
    center: [hall.x + x, 1.9, hall.z + 3.7] as Vec3,
    half: [0.68, 1.35, 0.06] as Vec3,
    camera: true,
  })),
]
