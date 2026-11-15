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
  anchor: Pick<TableAnchor, 'picnicId' | 'pavilionId'> & Partial<Pick<TableAnchor,'seatAnchors'>>,
  count = 4,
) {
  const seats = anchor.seatAnchors ? anchor.seatAnchors.map(([x,,z],n) => ({ x, z, yaw: TABLE_SEATS[n]?.yaw ?? Math.atan2(-x,-z) }))
    : anchor.picnicId
    ? PICNIC_TABLE_SEATS
    : anchor.pavilionId === 'P0'
      ? MAIN_SEATS
      : TABLE_SEATS
  if (count <= 4 || seats.length >= count) return seats
  // 기존 1~4번 위치를 보존하고 돌탑 정원이 늘 때 모서리 좌석만 추가한다.
  const centerX = seats.slice(0, 4).reduce((sum, s) => sum + s.x, 0) / 4
  const centerZ = seats.slice(0, 4).reduce((sum, s) => sum + s.z, 0) / 4
  // 두 인접 좌석의 벡터를 합쳐 회전된 새 공원 테이블에서도 기존 좌석과 겹치지 않는다.
  const corners = [[2, 0], [3, 1], [2, 1], [3, 0]].map(([a, b]) => {
    const x = seats[a!]!.x + seats[b!]!.x - centerX, z = seats[a!]!.z + seats[b!]!.z - centerZ
    return { x, z, yaw: Math.atan2(centerX - x, centerZ - z) }
  })
  return [...seats, ...corners].slice(0, count)
}
