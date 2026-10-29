import { LAKE } from './parkLandforms'

export const BRIDGE = {
  startX: 42,
  endX: 70,
  z: 20,
  halfWidth: 2,
  segments: 56,
} as const
/** Broad granite stones: real water gaps, low end stones keep each rise walkable. */
export const STONE_CROSSING = {
  startX: 37,
  endX: 75,
  z: -24,
  halfWidth: 1.35,
  top: 0.32,
  gap: 0.22,
  count: 24,
} as const
export const STEPPING_STONES = Array.from(
  { length: STONE_CROSSING.count },
  (_, i) => {
    const step =
      (STONE_CROSSING.endX - STONE_CROSSING.startX) / STONE_CROSSING.count
    return {
      x: STONE_CROSSING.startX + (i + 0.5) * step,
      z: STONE_CROSSING.z + Math.sin(i * 2.1) * 0.06,
      width: step - STONE_CROSSING.gap + Math.sin(i * 1.7) * 0.045,
      depth: STONE_CROSSING.halfWidth * 2 - 0.07 + Math.cos(i * 2.3) * 0.07,
      // 18cm entry, then a 14cm rise: both are below the existing 22cm autostep.
      top:
        i === 0 || i === STONE_CROSSING.count - 1 ? 0.18 : STONE_CROSSING.top,
      bottom: -0.7,
    }
  },
)
export function bridgeHeight(x: number) {
  const t = Math.max(
    0,
    Math.min(1, (x - BRIDGE.startX) / (BRIDGE.endX - BRIDGE.startX)),
  )
  return 0.16 + Math.sin(Math.PI * t) * 0.7
}
/** Both crossings plus two broad, gently sloping swimming entrances. */
const cuts = [BRIDGE, STONE_CROSSING].flatMap((c) => {
  const lo = Math.asin((c.z - c.halfWidth - 0.45 - LAKE.z) / LAKE.radiusZ)
  const hi = Math.asin((c.z + c.halfWidth + 0.45 - LAKE.z) / LAKE.radiusZ)
  return [
    [lo, hi],
    [Math.PI - hi, Math.PI - lo],
  ]
})
cuts.push([-0.15, 0.15], [Math.PI - 0.15, Math.PI + 0.15])
export const SHORE_ARCS = Array.from({ length: 240 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / 240,
    b = a + (Math.PI * 2) / 240
  if (cuts.some(([lo, hi]) => b > lo! && a < hi!)) return []
  return [a, b].map(
    (t) =>
      [
        LAKE.x + Math.cos(t) * LAKE.radiusX,
        0,
        LAKE.z + Math.sin(t) * LAKE.radiusZ,
      ] as const,
  )
}).filter((arc) => arc.length)
