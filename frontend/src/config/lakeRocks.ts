import { LAKE } from './parkLandforms'
import { SHORE_ARCS, BRIDGE, STONE_CROSSING } from './lakeCrossings'
import type { BoxCollider, Vec3 } from './world'
const rockCandidates = SHORE_ARCS.filter((_, i) => i % 5 === 0).map(
  (arc, i) => ({
    position: [arc[0]![0], 0.2 + (i % 3) * 0.1, arc[0]![2]] as Vec3,
    size: [
      1.1 + (i % 3) * 0.18,
      0.65 + (i % 4) * 0.12,
      0.85 + (i % 2) * 0.3,
    ] as Vec3,
    yaw: i * 1.7,
  }),
)
for (const [dx, dz] of [
  [5, 9],
  [-7, -23],
  [8, 27],
])
  for (let i = 0; i < 4; i++) {
    const a = i * 2.4
    rockCandidates.push({
      position: [
        LAKE.x + dx! + Math.cos(a) * 1.1,
        i === 0 ? 0.45 : 0.15,
        LAKE.z + dz! + Math.sin(a) * 0.9,
      ],
      size: [1.4 + i * 0.12, i === 0 ? 1.25 : 0.8, 1.05],
      yaw: a,
    })
  }
// Include rotated/noisy visual bounds, not just rock centres, at both entrances.
export const LAKE_ROCKS = rockCandidates.filter((r) => {
  const radius = Math.hypot(r.size[0], r.size[2]) * 1.1
  return ![BRIDGE, STONE_CROSSING].some(
    (c) =>
      r.position[0] + radius > c.startX - 1 &&
      r.position[0] - radius < c.endX + 1 &&
      Math.abs(r.position[2] - c.z) < c.halfWidth + radius + 0.6,
  )
})
export const LAKE_ROCK_COLLIDERS: readonly BoxCollider[] = LAKE_ROCKS.map(
  (r, i) => ({
    id: `lake-boulder-${i}`,
    center: r.position,
    half: [r.size[0] * 0.7, r.size[1] * 0.7, r.size[2] * 0.7],
    camera: false,
  }),
)
