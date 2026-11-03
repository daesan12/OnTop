import type { Game } from '../protocol'

/** Original participant framing; the public spectator camera retains its existing bounds. */
export const DICE_CAMERA = { fov: 48, tableHeight: 1.06, height: 2.09, seatOffset: 1.15 } as const
export function diceFocusActive(game: Game | null, ownId: string, fixed = false) {
  return game?.role === 'PLAYER' && !!game.dice && game.dice.status === 'PLAYING'
    && game.dice.players.includes(ownId) && (game.dice.turnUserId === ownId || fixed)
}
