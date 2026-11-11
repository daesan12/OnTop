import { useGame } from '../../game/store'
import { gameState } from '../../game/protocol'
import {useCompanions} from '../ai/companions'

/** A nonempty scope never falls back to a public world message, even while approval is pending. */
function productGameChatScope(state = useGame.getState()) {
  if (state.game && (state.game.role === 'SPECTATOR' || gameState(state.game).status === 'PLAYING')) return state.game.gameId
  if (state.watchedGameId) return state.watchedGameId
  return ['STARTING', 'CONFIRMED', 'PLAYING', 'SETTLING'].includes(state.start?.phase ?? '') ? 'pending' : ''
}
export function gameChatScope(state=useGame.getState()) {
  const c=useCompanions.getState()
  return c.practice?.snapshot.gameId||c.practiceChat?.gameId||productGameChatScope(state)
}
export function useChatScope(){
  const practice=useCompanions(s=>s.practice?.snapshot.gameId||s.practiceChat?.gameId||'')
  const game=useGame(productGameChatScope)
  return practice||game
}
