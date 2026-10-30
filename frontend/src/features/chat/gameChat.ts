import { useGame } from '../../game/store'
import { gameState } from '../../game/protocol'

/** A nonempty scope never falls back to a public world message, even while approval is pending. */
export function gameChatScope(state = useGame.getState()) {
  if (state.game && (state.game.role === 'SPECTATOR' || gameState(state.game).status === 'PLAYING')) return state.game.gameId
  if (state.watchedGameId) return state.watchedGameId
  return ['STARTING', 'CONFIRMED', 'PLAYING', 'SETTLING'].includes(state.start?.phase ?? '') ? 'pending' : ''
}
