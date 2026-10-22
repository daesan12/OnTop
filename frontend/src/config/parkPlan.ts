/** Metres, Y-up. Placement changes never scale the surrounding facilities. */
export const PARK_SIZE = 160
export const PARK_ENTRANCE = { gateZ: 42, spawnZ: 34, crossingZ: 42 } as const
export const PAVILION_BASE_RADIUS = 4.5
export const PAVILION_STAIR_HALF_WIDTH = 1.8
/** Join the actual octagon face even at the stairs' outer corners, with a 6cm overlap. */
export function pavilionStairJoin(scale: number) {
  const face = PAVILION_BASE_RADIUS * Math.cos(Math.PI / 8)
  const faceHalfWidth = PAVILION_BASE_RADIUS * Math.sin(Math.PI / 8)
  return (
    (face - Math.max(0, PAVILION_STAIR_HALF_WIDTH - faceHalfWidth)) * scale -
    0.06
  )
}
export const PARK_PAVILIONS = [
  { id: 'P0', x: 0, z: 6, ground: 0, floor: 2, scale: 2.05 },
  { id: 'P1', x: -18, z: 4, ground: 0, floor: 0.72, scale: 1.2 },
  { id: 'P2', x: 18, z: 4, ground: 0, floor: 0.72, scale: 1.2 },
  { id: 'P3', x: -18, z: -15, ground: 0, floor: 0.72, scale: 1.2 },
  { id: 'P4', x: 18, z: -15, ground: 0, floor: 0.72, scale: 1.2 },
  { id: 'P5', x: -18, z: -34, ground: 0, floor: 0.72, scale: 1.2 },
  { id: 'P6', x: 18, z: -34, ground: 0, floor: 0.72, scale: 1.2 },
  { id: 'P7', x: -23, z: 28, ground: 0, floor: 0.72, scale: 1.2 },
  { id: 'P8', x: 23, z: 28, ground: 0, floor: 0.72, scale: 1.2 },
] as const
/** Hanging lantern proportions used by both pavilion art and spectator camera. */
export const PAVILION_LANTERN = {
  heightFactor: 2.9,
  bottomOffset: 0.32,
  spectatorClearance: 0.28,
} as const
export const FOUNTAIN = {
  x: -56,
  z: -45,
  radius: 5,
  plazaRadius: 14,
  plazaDepth: 1.1,
  innerPlazaRadius: 9.5,
} as const
export const VR_ZONE = { x: -56, z: -7, width: 28, depth: 24 } as const
export const FITNESS_AREA = { x: -56, z: 31, width: 28, depth: 30 } as const
// Tunable layout: 12m farther north, with a uniform enlargement of the monument.
export const PAGODA_SITE = {
  x: 0,
  z: -36,
  scale: 1.3,
  widthScale: 1.35,
} as const
export const TOWER_SITE = { x: 56, z: 50 } as const
export const MINI_PROPS = [
  { id: 'fish-bread', x: -36, z: 13, width: 3.8, depth: 2.4, height: 3.1 },
  {
    id: 'vr-entry',
    x: VR_ZONE.x - 6,
    z: VR_ZONE.z - 2,
    width: 13,
    depth: 9,
    height: 5.2,
  },
] as const
export const MAILBOX = {
  x: -10.8,
  z: 14.5,
  height: 1.8,
  bodyHalfWidth: 0.46,
  bodyHalfDepth: 0.4,
  interactionRadius: 2.6,
} as const

/** Front/back are the two horizontal polygon sides. All other bays are fenced. */
export const PAVILION_CLOSED_SIDES = [0, 2, 3, 4, 6, 7] as const
/** Perimeter joinery, in metres. Seat anchors stay fixed for existing spectators. */
export const PAVILION_TIMBER = {
  inset: 0.46,
  seatHalfDepth: 0.38,
  seatHeight: 0.56,
  railHeight: 1.22,
} as const
export function pavilionBenchRadius(scale: number) {
  return 3.65 * Math.cos(Math.PI / 8) * scale - PAVILION_TIMBER.inset
}
/** Conservative oriented footprint encloses both ends of the mitred seat. */
export function pavilionBenchHalfWidth(scale: number) {
  return (pavilionBenchRadius(scale) + 0.45) * Math.tan(Math.PI / 8)
}
export const PAVILION_FENCE_SEGMENTS = PARK_PAVILIONS.flatMap((p) =>
  PAVILION_CLOSED_SIDES.map((side) => {
    const a = Math.PI / 8 + (side * Math.PI) / 4,
      b = a + Math.PI / 4
    return {
      pavilionId: p.id,
      side,
      y: p.floor,
      from: [
        p.x + Math.cos(a) * 3.65 * p.scale,
        p.z + Math.sin(a) * 3.65 * p.scale,
      ] as const,
      to: [
        p.x + Math.cos(b) * 3.65 * p.scale,
        p.z + Math.sin(b) * 3.65 * p.scale,
      ] as const,
    }
  }),
)
export const PAVILION_BENCH_SITES = PARK_PAVILIONS.flatMap((p) =>
  PAVILION_CLOSED_SIDES.map((side) => {
    const angle = ((side + 1) * Math.PI) / 4
    const radius = pavilionBenchRadius(p.scale)
    return {
      x: p.x + Math.cos(angle) * radius,
      z: p.z + Math.sin(angle) * radius,
      y: p.floor,
      yaw: -Math.PI / 2 - angle,
      pavilionId: p.id,
      halfWidth: pavilionBenchHalfWidth(p.scale),
    }
  }),
)
