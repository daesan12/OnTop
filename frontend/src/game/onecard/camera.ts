import { tableScale, tableSeats, type TableAnchor } from '../../config'
import type { Game } from '../protocol'

// A slightly higher eye and lower focus leave the deck exposed above the private hand.
export const ONECARD_CAMERA = { fov: 68, seatOffset: .55, eyeHeight: 2.25, targetHeight: .92 } as const
export function oneCardSpectatorCameraPose(anchor: TableAnchor, yaw: number, aspect: number, ceiling: number) {
  const radius = (Math.max(...tableSeats(anchor).map(seat => Math.hypot(seat.x, seat.z))) + 1.45)
    * Math.max(1, Math.sqrt(1.15 / Math.max(.35, aspect)))
  return { position: [anchor.position[0] + Math.sin(yaw) * radius, Math.min(anchor.position[1] + 3.65, ceiling),
    anchor.position[2] + Math.cos(yaw) * radius] as const,
    target: [anchor.position[0], anchor.position[1] + 1.15, anchor.position[2]] as const }
}
export function oneCardPlayerViewActive(game: Game | null) {
  return game?.role === 'PLAYER' && game.onecard?.status === 'PLAYING'
}
/** First-person table view. Private cards remain in the screen-space DOM overlay. */
export function oneCardCameraPose(anchor: TableAnchor, seatIndex: number) {
  const seat = tableSeats(anchor)[seatIndex] ?? tableSeats(anchor)[0]!
  const radius = Math.hypot(seat.x, seat.z), scale = tableScale(anchor)
  const x = seat.x / radius, z = seat.z / radius
  return {
    position: [anchor.position[0] + seat.x + x * ONECARD_CAMERA.seatOffset * scale,
      anchor.position[1] + ONECARD_CAMERA.eyeHeight,
      anchor.position[2] + seat.z + z * ONECARD_CAMERA.seatOffset * scale] as const,
    target: [anchor.position[0], anchor.position[1] + ONECARD_CAMERA.targetHeight, anchor.position[2]] as const,
  }
}
