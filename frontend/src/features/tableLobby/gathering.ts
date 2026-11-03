import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { gameState } from '../../game/protocol'
import { useGame } from '../../game/store'
import { useTableLobby, seatScope } from './state'
import { gatheringModel } from './gatheringModel'
import { displayNickname } from '../gameMaster/displayName'

/** Results use the edge HUD and shared camera; preparation uses the table panel. */
export function getGathering() {
  const s = useSession.getState(), g = useGame.getState(), t = s.tableStates[s.tableId]
  if (s.status !== 'connected' || !s.tableId || s.seatIndex < 0
    || !t?.seats.some(seat => seat.userId === s.sessionId) || g.watchedGameId || g.game?.role === 'SPECTATOR'
    || (g.start?.tableId && g.start.tableId !== s.tableId)) return null
  const game = g.game?.role === 'PLAYER' && g.game.gameId === g.permittedGameId ? g.game : null
  const gameId = g.permittedGameId || g.completedGameId
  const result = g.result?.gameSessionId === gameId ? g.result
    : g.lastResult?.gameSessionId === gameId ? g.lastResult : null
  // A stored terminal result is authoritative even when the engine snapshot is missing or still PLAYING.
  if (!result && (!game || gameState(game).status !== 'FINISHED')) return null
  return gatheringModel({ table: t, ownId: s.sessionId, game, result, start: g.start,
    nickname: id => displayNickname(s.profiles[id], id === s.sessionId ? '나' : '산책자 ' + id.slice(-6)) })
}
export function useGathering() {
  useSession(useShallow(s => [s.tableId, s.sessionId, s.tableStates, s.profiles, s.status, s.pending]))
  useGame(useShallow(s => [s.game, s.result, s.lastResult, s.start, s.permittedGameId, s.completedGameId, s.watchedGameId, s.uncertain]))
  return getGathering()
}
export function gatheringCameraActive() {
  const s = useSession.getState(), g = useGame.getState()
  if (s.status !== 'connected' || !s.tableId || s.seatIndex < 0 || g.watchedGameId
    || useTableLobby.getState().lookScope === seatScope(s)) return false
  return !!getGathering()?.finished
}
export function returnToWaiting() {
  const m = getGathering(), state = useGame.getState(), result = state.lastResult ?? state.result
  if (!m?.canReturn || !result || state.pending || result.gameSessionId !== (state.permittedGameId || state.completedGameId)) return
  useGame.setState({ game: null, result: null, lastResult: null, permittedGameId: '', resultCandidateGameId: '', recovery: 'LOBBY',
    completedGameId: result.gameSessionId, awaitingVersion: -1, uncertain: false, error: '',
    dismissedResult: { gameId: result.gameSessionId, version: result.version } })
}
