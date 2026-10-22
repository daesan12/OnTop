import type { BoxCollider, Vec3 } from './world'

/** Front is local +Z. Keep the arrival axis, table seats and pavilion stairs clear. */
export const A_FRAME_SIGNS = [
  { id: 'arrival', x: 5.7, z: 32, yaw: -0.28 },
  { id: 'pavilion', x: -7.2, z: 16, yaw: 0.3 },
  { id: 'west-walk', x: -29.5, z: 9, yaw: -Math.PI / 2 },
] as const
export const A_FRAME = {
  width: 1.36,
  depth: 0.96,
  height: 1.98,
  panelWidth: 0.99,
  panelY: 1.1,
} as const
export const AD_BALLOON = {
  x: -6.5,
  z: 32,
  yaw: 0.14,
  panelY: 9.1,
  panelWidth: 3.2,
  balloonY: 13,
  balloonRadius: 1.2,
  anchorWidth: 1.5,
  anchorDepth: 0.7,
  anchorHeight: 0.34,
} as const

export const ADVERTISING_COLLIDERS: readonly BoxCollider[] = [
  ...A_FRAME_SIGNS.map((s) => {
    const c = Math.abs(Math.cos(s.yaw)),
      sn = Math.abs(Math.sin(s.yaw))
    return {
      id: `ad-a-frame-${s.id}`,
      center: [s.x, A_FRAME.height / 2, s.z] as Vec3,
      half: [
        (c * A_FRAME.width) / 2 + (sn * A_FRAME.depth) / 2,
        A_FRAME.height / 2,
        (sn * A_FRAME.width) / 2 + (c * A_FRAME.depth) / 2,
      ] as Vec3,
      movementHalf: [
        A_FRAME.width / 2,
        A_FRAME.height / 2,
        A_FRAME.depth / 2,
      ] as Vec3,
      movementYaw: s.yaw,
      camera: true,
    }
  }),
]
