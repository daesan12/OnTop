import type { Game } from '../protocol'

/** Original participant framing. */
export const DICE_CAMERA = { fov: 48, tableHeight: 1.06, height: 2.09, seatOffset: 1.15 } as const
export function diceFocusActive(game: Game | null, ownId: string, fixed = false) {
  return game?.role === 'PLAYER' && !!game.dice && game.dice.status === 'PLAYING'
    && game.dice.players.includes(ownId) && (game.dice.turnUserId === ownId || fixed)
}

export const DICE_SPECTATOR_CAMERA = { fov: 42, minHeight: 1.9 } as const

/** Fit the public tabletop into the space beside the observer HUD, retaining a true top view. */
export function diceSpectatorCameraPose(center: readonly [number, number, number], scale: number, width: number, height: number) {
  const narrow = width < 700, compact = width < 1100, short = !narrow && height <= 600
  const left = short ? Math.min(460, width * .55) : compact ? 16 : 264, right = short || narrow ? 16 : compact ? 292 : 356
  const top = narrow ? 184 : compact ? 128 : 164, bottom = short ? 16 : narrow ? 180 : 24
  const areaWidth = Math.max(160, width - left - right), areaHeight = Math.max(120, height - top - bottom)
  const span = Math.max(1.35 * height / areaHeight, 1.85 * height / areaWidth)
  const distance = Math.max(DICE_SPECTATOR_CAMERA.minHeight, span / (2 * Math.tan(DICE_SPECTATOR_CAMERA.fov * Math.PI / 360))) * scale
  const visibleHeight = distance * 2 * Math.tan(DICE_SPECTATOR_CAMERA.fov * Math.PI / 360)
  const target: [number, number, number] = [
    center[0] + .25 * scale + (right - left) / (2 * height) * visibleHeight,
    center[1] + 1.1,
    center[2] + (bottom - top) / (2 * height) * visibleHeight,
  ]
  const position: [number, number, number] = [target[0], target[1] + distance, target[2] + .001]
  return { position, target }
}
