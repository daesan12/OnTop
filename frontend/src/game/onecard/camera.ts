import { tableScale, tableSeats, type TableAnchor } from '../../config'
import type { Game } from '../protocol'

export const ONECARD_CAMERA = { fov: 54, behind: 1.8, shoulder: .9, height: 2.12, targetHeight: 1.12 } as const
export function oneCardShoulderActive(game: Game | null) {
  return game?.role === 'PLAYER' && game.onecard?.status === 'PLAYING'
}
/** Seat-relative pose; all four seats look over the same shoulder toward the table. */
export function oneCardCameraPose(anchor: TableAnchor, seatIndex: number, aspect = 16 / 9) {
  const seat = tableSeats(anchor)[seatIndex] ?? tableSeats(anchor)[0]!
  const radius = Math.hypot(seat.x, seat.z), scale = tableScale(anchor)
  const x = seat.x / radius, z = seat.z / radius
  const framing = Math.max(1, Math.min(1.7, 1 / Math.max(.1, aspect)))
  return {
    position: [anchor.position[0] + seat.x + (x * ONECARD_CAMERA.behind + z * ONECARD_CAMERA.shoulder) * scale * framing,
      anchor.position[1] + (ONECARD_CAMERA.height + .25 * (framing - 1)) * scale,
      anchor.position[2] + seat.z + (z * ONECARD_CAMERA.behind - x * ONECARD_CAMERA.shoulder) * scale * framing] as const,
    target: [anchor.position[0], anchor.position[1] + ONECARD_CAMERA.targetHeight * scale, anchor.position[2]] as const,
  }
}
