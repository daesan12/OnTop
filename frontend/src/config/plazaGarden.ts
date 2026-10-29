import { FOUNTAIN } from './parkPlan'
import { groundHeight } from './parkLayout'
import type { BoxCollider, Vec3 } from './world'

export const FOUNTAIN_GARDENS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  const x = FOUNTAIN.x + Math.cos(a) * 10.5,
    z = FOUNTAIN.z + Math.sin(a) * 10.5
  return { x, z, y: groundHeight(x, z), yaw: -Math.PI / 2 - a }
})
// Additional diagonal seats are appended after all existing bench IDs.
export const FOUNTAIN_BENCH_SITES = [1, 3, 5, 7].map((i) => {
  const a = (i * Math.PI) / 4
  return {
    x: FOUNTAIN.x + Math.cos(a) * 8.5,
    z: FOUNTAIN.z + Math.sin(a) * 8.5,
    y: -FOUNTAIN.plazaDepth,
    yaw: -Math.PI / 2 - a,
  }
})
export const PLAZA_GARDEN_COLLIDERS: readonly BoxCollider[] =
  FOUNTAIN_GARDENS.map((p, i) => ({
    id: `fountain-planter-${i}`,
    center: [p.x, p.y + 0.15, p.z] as Vec3,
    half: [1.85, 0.45, 0.65] as Vec3,
    movementYaw: p.yaw,
    camera: false,
  }))
