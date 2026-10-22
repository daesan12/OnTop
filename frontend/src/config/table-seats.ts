import type { TableAnchor } from './world'

/** Keep the original south/north seat IDs stable for existing two-player games. */
export const TABLE_SEATS = [
  { x: 0, z: 1.25, yaw: Math.PI },
  { x: 0, z: -1.25, yaw: 0 },
  { x: -1.45, z: 0, yaw: Math.PI / 2 },
  { x: 1.45, z: 0, yaw: -Math.PI / 2 },
] as const
export const TABLE_CLOCKWISE_PLAYERS = [1, 3, 2, 4] as const
/** Existing outer stone stools, in the same player order as every game. */
export const PICNIC_TABLE_SEATS = TABLE_SEATS.map(({ x, z, yaw }) => ({
  x: Math.sign(x) * 1.8,
  z: Math.sign(z) * 1.8,
  yaw,
}))
export function tableScale(anchor: Pick<TableAnchor, 'pavilionId'>) {
  return anchor.pavilionId === 'P0' ? 1.8 : 1
}
const MAIN_SEATS = TABLE_SEATS.map((s) => ({
  ...s,
  x: s.x * 1.8,
  z: s.z * 1.8,
}))
export function tableSeats(
  anchor: Pick<TableAnchor, 'picnicId' | 'pavilionId'>,
) {
  return anchor.picnicId
    ? PICNIC_TABLE_SEATS
    : anchor.pavilionId === 'P0'
      ? MAIN_SEATS
      : TABLE_SEATS
}
