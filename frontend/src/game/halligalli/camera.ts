import { tableScale, tableSeats, type TableAnchor } from '../../config'
import { oneCardSpectatorCameraPose } from '../onecard/camera'
import type { Game } from '../protocol'

/**
 * Seated table view for HALLI_GALLI: a little higher and further back than ONE_CARD (eye 2.25, offset .55, fov 68)
 * so every seat's face-up card, the centre bell and the opponents' upper bodies stay in frame.
 * Values are table-local metres above the anchor; the table top is at about 1.06.
 */
export const HALLI_CAMERA = { fov: 64, seatOffset: .75, eyeHeight: 2.65, targetHeight: .96, tableTop: 1.06, narrowAspect: 1.3 } as const

export function halliPlayerViewActive(game: Game | null, seatedAtTable: boolean, looking: boolean) {
  return seatedAtTable && !looking && game?.role === 'PLAYER' && game.halli?.status === 'PLAYING'
}
export function halliSpectatorViewActive(game: Game | null, watching: boolean) {
  return watching && game?.role === 'SPECTATOR' && !!game.halli
}

/** Behind the own physical seat, looking down at the table centre. Narrow screens pull back instead of cropping side seats. */
export function halliCameraPose(anchor: TableAnchor, seatIndex: number, aspect = 16 / 9) {
  const seats = tableSeats(anchor), seat = seats[seatIndex] ?? seats[0]!
  const radius = Math.hypot(seat.x, seat.z), scale = tableScale(anchor)
  const widen = Math.max(1, Math.sqrt(HALLI_CAMERA.narrowAspect / Math.max(.35, aspect)))
  const out = (radius + HALLI_CAMERA.seatOffset * scale) * widen
  const lift = HALLI_CAMERA.tableTop + (HALLI_CAMERA.eyeHeight - HALLI_CAMERA.tableTop) * Math.sqrt(scale) * widen
  return {
    position: [anchor.position[0] + seat.x / radius * out, anchor.position[1] + lift, anchor.position[2] + seat.z / radius * out] as const,
    target: [anchor.position[0], anchor.position[1] + HALLI_CAMERA.targetHeight, anchor.position[2]] as const,
  }
}

/**
 * Spectator orbit from ONE_CARD, anchored to the first player's seat instead of the turn seat: turns change every few
 * seconds here and a turn-following camera would swing constantly. dragYaw is the spectator's own drag.
 */
export function halliSpectatorYaw(anchor: TableAnchor, firstSeatIndex: number, dragYaw: number) {
  const seats = tableSeats(anchor), seat = seats[firstSeatIndex] ?? seats[0]!
  return Math.atan2(seat.x, seat.z) + dragYaw
}
export function halliSpectatorCameraPose(anchor: TableAnchor, firstSeatIndex: number, dragYaw: number, aspect: number, ceiling: number) {
  return oneCardSpectatorCameraPose(anchor, halliSpectatorYaw(anchor, firstSeatIndex, dragYaw), aspect, ceiling)
}
