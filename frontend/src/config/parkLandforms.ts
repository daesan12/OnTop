// Shared water outline without a dependency on world furniture or terrain generation.
export const LAKE = {
  x: 56,
  z: -12,
  radiusX: 17,
  radiusZ: 42,
  surfaceY: 0.045,
  depth: 2.8,
} as const
/** Adjustable, server-owned surface swimming; no stamina/drowning rules. */
export const SWIMMING = {
  depthThreshold: 0.95,
  floatOffset: -0.12,
  speed: 4.0,
  fastSpeed: 6.25,
} as const
export function lakeRadiusAt(x: number, z: number) {
  return Math.hypot((x - LAKE.x) / LAKE.radiusX, (z - LAKE.z) / LAKE.radiusZ)
}
