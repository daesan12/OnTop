import { gameState, type Game } from '../../game/protocol'

/** Shared by the launcher, keyboard shortcut and imperative map entry point, for every game. */
export function gameBlocksParkMap(game: Game | null, phase?: string) {
  return !!game && gameState(game).status === 'PLAYING'
    || ['STARTING', 'CONFIRMED', 'PLAYING'].includes(phase ?? '')
}
