// East of the central plaza's paving emblem, facing the plaza and entrance.
export const PARK_GACHA_MACHINE = { id: 'layout-shop', x: 9, y: .14, z: 46, yaw: -Math.PI / 3 }
const frontX = Math.sin(PARK_GACHA_MACHINE.yaw)
const frontZ = Math.cos(PARK_GACHA_MACHINE.yaw)

export function canReachParkGacha(position: { x: number; y: number; z: number }) {
  const { x, y, z } = position
  const dx = x - PARK_GACHA_MACHINE.x
  const dz = z - PARK_GACHA_MACHINE.z
  const forward = dx * frontX + dz * frontZ
  return [x, y, z].every(Number.isFinite) && Math.abs(y - PARK_GACHA_MACHINE.y - .8) <= .9
    && forward > .3 && Math.hypot(dx, dz) <= 3.6
}
