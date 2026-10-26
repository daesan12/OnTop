import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { gameState } from '../../game/protocol'
import { useGame, tableBusy } from '../../game/store'
import { useTableLobby, seatScope } from './state'
import { gatheringModel } from './gatheringModel'

/** The server's own seat and round remain the sole source of the gathering view. */
export function getGathering() {
  const s = useSession.getState(), g = useGame.getState(), t = s.tableStates[s.tableId]
  if (!s.tableId || !t?.seats.some(seat => seat.userId === s.sessionId) || g.watchedGameId) return null
  const game = g.game?.role === 'PLAYER' && g.game.gameId === g.permittedGameId ? g.game : null
  if (game && gameState(game).status !== 'FINISHED') return null
  if (!game && !g.lastResult && (tableBusy(g) || g.uncertain || g.permittedGameId)) return null
  const result = game ? g.result?.gameSessionId === game.gameId ? g.result : null : g.lastResult
  return gatheringModel({ table: t, ownId: s.sessionId, game, result, start: g.start,
    nickname: id => s.profiles[id]?.nickname ?? (id === s.sessionId ? '나' : '산책자 ' + id.slice(-6)) })
}
export function useGathering() {
  useSession(useShallow(s => [s.tableId, s.sessionId, s.tableStates, s.profiles, s.status, s.pending]))
  useGame(useShallow(s => [s.game, s.result, s.lastResult, s.start, s.permittedGameId, s.watchedGameId, s.uncertain]))
  return getGathering()
}
export function gatheringCameraActive() {
  const s = useSession.getState(), g = useGame.getState()
  if (s.status !== 'connected' || !s.tableId || s.seatIndex < 0 || g.watchedGameId
    || useTableLobby.getState().lookScope === seatScope(s)) return false
  if (!s.tableStates[s.tableId]?.seats.some(seat => seat.userId === s.sessionId)) return false
  return g.game ? g.game.role === 'PLAYER' && g.game.gameId === g.permittedGameId && gameState(g.game).status === 'FINISHED'
    : !g.permittedGameId && !g.uncertain && (!tableBusy(g) || !!g.lastResult)
}
export function returnToWaiting() {
  const m = getGathering(), result = useGame.getState().lastResult
  if (!m?.canReturn || !result) return
  useGame.setState({ lastResult: null, dismissedResult: { gameId: result.gameSessionId, version: result.version } })
}
