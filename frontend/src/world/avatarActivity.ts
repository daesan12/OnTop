import { gamePlayers, gameState, type Game, type Recovery, type StartState } from '../game/protocol'

/** Only a live approved participant gets the local game label; seating, readiness,
 * spectating and results are separate states. Remote users require public activity. */
export function ownGameActivity(userId: string, state: {
  game: Game | null; permittedGameId: string; watchedGameId: string; recovery: Recovery; start: StartState | null
}) {
  const game = state.game
  return !!userId && !!game && game.role === 'PLAYER' && !state.watchedGameId
    && state.recovery === 'RESTORED' && game.gameId === state.permittedGameId
    && !['WAITING', 'STARTING', 'CONFIRMED', 'SETTLING', 'NOT_SEATED'].includes(state.start?.phase ?? '')
    && gameState(game).status === 'PLAYING' && gamePlayers(game).includes(userId)
    && game.onecard?.players.find(player => player.userId === userId)?.active !== false
    && game.bridge?.players.find(player => player.userId === userId)?.forfeited !== true
}
