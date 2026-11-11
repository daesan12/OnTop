// A frontend prop in the legacy park, independent of the generated server map.
export const PARK_GACHA_MACHINE = { id: 'layout-shop', x: -27.1, z: 51, yaw: Math.PI }

export function canReachParkGacha(position: { x: number; y: number; z: number }) {
  const { x, y, z } = position
  const dx = x - PARK_GACHA_MACHINE.x
  const dz = z - PARK_GACHA_MACHINE.z
  // The front faces the existing path to the fish-bread shop (negative Z).
  return [x, y, z].every(Number.isFinite) && Math.abs(y - .8) <= .9
    && dz < -.3 && Math.hypot(dx, dz) <= 3.6
}
