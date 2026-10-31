import type { Game } from '../protocol'

/**
 * Seated framing for any of the 2~4 seats. panOffset slides the view toward screen-right so the
 * tray sits left of the docked 2D ledger instead of under it.
 */
export const LEDGER_CAMERA = { fov: 48, tableHeight: 1.06, height: 1.95, seatOffset: 1.2, panOffset: .32 } as const
export function ledgerFocusActive(game: Game | null, ownId: string, looking: boolean) {
  return !looking && game?.role === 'PLAYER' && !!game.ledger && game.ledger.status === 'PLAYING'
    && game.ledger.players.some(p => p.userId === ownId && !p.forfeited)
}
/** Camera position/target for a seat at (seatX, seatZ) relative to the table center, already scaled. */
export function ledgerCameraPose(center: readonly [number, number, number], seatX: number, seatZ: number, scale: number) {
  const yaw = Math.atan2(seatX, seatZ), rightX = Math.cos(yaw), rightZ = -Math.sin(yaw)
  const pan = LEDGER_CAMERA.panOffset * scale
  const target: [number, number, number] = [center[0] + rightX * pan, center[1] + 1.1, center[2] + rightZ * pan]
  const position: [number, number, number] = [
    center[0] + Math.sin(yaw) * LEDGER_CAMERA.seatOffset * scale + rightX * pan,
    center[1] + LEDGER_CAMERA.tableHeight + LEDGER_CAMERA.height * scale,
    center[2] + Math.cos(yaw) * LEDGER_CAMERA.seatOffset * scale + rightZ * pan,
  ]
  return { position, target }
}
