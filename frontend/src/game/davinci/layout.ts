export type TilePose = { x: number; y: number; z: number; yaw: number; tilt: number }
export const ROWS: [number, number, number][] = [[0, .11, 2.85], [-3.7, .11, 0], [0, .11, -2.85], [3.7, .11, 0]]
export const YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2]

/** 혼잡할 때도 중앙·각 좌석·이동 패 모두 하나의 공통 배율을 사용한다. */
export function uniformTileScale(rows: { count: number; slot: number }[]) {
  return Math.min(1, ...rows.map(row => (row.slot % 2 ? 4.8 : 7.1) / Math.max(1, row.count * .69 + .2)))
}
export function rowPose(slot: number, index: number, count: number, scale: number): TilePose {
  const [x, y, z] = ROWS[slot]!, yaw = YAW[slot]!, offset = (index - (count - 1) / 2) * .69 * scale
  return { x: x! + Math.cos(yaw) * offset, y: y!, z: z! - Math.sin(yaw) * offset, yaw, tilt: 0 }
}
export function supplyPose(index: number, count: number, scale: number): TilePose {
  const yaw = Math.sin(index * 4.2) * .1
  return { x: (index % 6 - 2.5) * .72 * scale - Math.sin(yaw) * .445 * scale, y: .12,
    z: (Math.floor(index / 6) - (Math.ceil(count / 6) - 1) / 2) * 1.02 * scale - Math.cos(yaw) * .445 * scale,
    yaw, tilt: Math.PI / 2 }
}
export function pendingPose(slot: number): TilePose {
  const [x, y, z] = ROWS[slot]!, yaw = YAW[slot]!
  return { x: x! - Math.sin(yaw) * .8, y: y! + .04, z: z! - Math.cos(yaw) * .8, yaw, tilt: 0 }
}
export const DRAW_MS = 700
export const REACTION_MS = 850
export function flightPose(from: TilePose, to: TilePose, progress: number, reduced = false): TilePose {
  const t = reduced ? 1 : Math.min(1, Math.max(0, progress)), ease = 1 - (1 - t) ** 3
  const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw))
  return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease + Math.sin(t * Math.PI) * .8,
    z: from.z + (to.z - from.z) * ease, yaw: from.yaw + turn * ease, tilt: from.tilt + (to.tilt - from.tilt) * ease }
}
