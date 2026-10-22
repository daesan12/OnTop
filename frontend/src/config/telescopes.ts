import { OBSERVATION_TOWER } from './parkLayout'
import type { BoxCollider, Vec3 } from './world'

/** Provisional viewing/furniture tuning; shared by render, input and server. */
export const TELESCOPE = {
  interactionRadius: 2,
  eyeHeight: 2.45,
  platformHeight: 0,
  standOffset: 0.85,
  exitOffset: 2.5,
  minZoom: 2,
  maxZoom: 8,
  defaultZoom: 3,
  minPitch: -1.35,
  maxPitch: 1.15,
  initialPitch: -0.18,
  aimIntervalMs: 100,
} as const
export const TELESCOPES = [
  [-6.9, -1.8],
  [-4.9, -4.0],
].map(([x, z], i) => {
  const position: Vec3 = [
    OBSERVATION_TOWER.x + x!,
    OBSERVATION_TOWER.height + 0.12,
    OBSERVATION_TOWER.z + z!,
  ]
  return {
    id: `telescope-${i + 1}`,
    name: `전망 망원경 ${i + 1}`,
    position,
    yaw: Math.atan2(-position[0], 6 - position[2]),
  }
})
export type Telescope = (typeof TELESCOPES)[number]
export function telescopeLanding(t: Telescope, exit = false): Vec3 {
  const offset = exit ? TELESCOPE.exitOffset : TELESCOPE.standOffset
  return [
    t.position[0] - Math.sin(t.yaw) * offset,
    t.position[1] + 0.8 + (exit ? 0 : TELESCOPE.platformHeight),
    t.position[2] - Math.cos(t.yaw) * offset,
  ]
}
export function telescopeFov(baseFov: number, zoom: number) {
  const magnification = Math.max(
    TELESCOPE.minZoom,
    Math.min(TELESCOPE.maxZoom, zoom),
  )
  return (
    (360 / Math.PI) *
    Math.atan(Math.tan((baseFov * Math.PI) / 360) / magnification)
  )
}
export const TELESCOPE_COLLIDERS: readonly BoxCollider[] = TELESCOPES.map(
  (t) => ({
    id: t.id,
    center: [t.position[0], t.position[1] + 0.65, t.position[2]],
    half: [0.23, 0.65, 0.23],
    camera: false,
  }),
)
/** Visitors now use the instrument directly from the summit deck. */
export const TELESCOPE_STEPS: readonly BoxCollider[] = []
// Append these to existing bench IDs. The stair arrival and its overhead gap stay clear.
export const TOWER_BENCH_SITES = [
  { dx: -2.2, dz: 5.8 },
  { dx: 2.2, dz: 5.8 },
].map(({ dx, dz }) => ({
  x: OBSERVATION_TOWER.x + dx,
  y: OBSERVATION_TOWER.height + 0.12,
  z: OBSERVATION_TOWER.z + dz,
  yaw: Math.PI,
}))
