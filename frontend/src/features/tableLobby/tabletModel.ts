import type { TableState } from '../../network/protocol'
import type { TableGameCode } from './model'
import { useGame } from '../../game/store'
import { useSession } from '../../network/worldClient'
import { create } from 'zustand'
import { TABLET_ENABLED } from './tabletFeature'

export interface PreparationContext { userId: string; channelId: string; tableId: string; expectedVersion: number }
export interface PreparationSelection { gameCode: TableGameCode; playerCount: number; betAmountPerPlayer: number; targetScore?: number }
/** FE extension port. No guessed WS message is sent. Bind only after the BE contract is agreed.
 * A manual-start adapter must ensure READY_SET never starts a match automatically. */
export interface TablePreparationPort {
  manualStart: true
  selectedPlayers(table: TableState): number | null
  configure(context: PreparationContext, selection: PreparationSelection): Promise<boolean>
  start(context: PreparationContext): Promise<boolean>
  recoverStart?(context: PreparationContext): Promise<boolean>
}
export const usePreparationPort = create<{ port: TablePreparationPort | null }>(() => ({ port: null }))
export function bindTablePreparation(port: TablePreparationPort) {
  usePreparationPort.setState({ port })
  return () => { if (usePreparationPort.getState().port === port) usePreparationPort.setState({ port: null }) }
}
export const preparationContext = (table: TableState): PreparationContext => {
  const s = useSession.getState()
  return { userId: s.sessionId, channelId: s.roomId, tableId: table.tableId, expectedVersion: table.version }
}
export function readyWouldAutoStart(table: TableState, ownId: string) {
  const occupied = table.seats.filter(seat => seat.userId)
  return occupied.length >= table.minimumPlayers && occupied.every(seat => seat.userId === ownId || seat.ready)
}
export function manualStartAllowed(table: TableState, ownId: string, count: number | null) {
  return count !== null && count >= table.minimumPlayers && count <= table.capacity
    && table.selectorUserId === ownId && !!table.gameCode && !!table.betAmountPerPlayer
    && table.seats.filter(s => s.userId).length === count && table.allReady
    && table.seats.filter(s => s.userId).every(s => s.ready)
}
export function tabletLobbyActive() {
  const s = useSession.getState(), g = useGame.getState(), table = s.tableStates[s.tableId]
  return TABLET_ENABLED && s.status === 'connected' && !!table && table.seats.some(seat => seat.userId === s.sessionId)
    && !g.watchedGameId && !g.lastResult && !g.game && !['PLAYING', 'SETTLING'].includes(g.start?.phase ?? '')
}
export function approvedChairCount(table: TableState | undefined, selected: number | null) {
  if (!table) return 2
  const occupiedLast = table.seats.reduce((max, seat) => seat.userId ? Math.max(max, seat.seatNumber) : max, 0)
  // Never hide an approved occupant even if a stale/malformed selected count arrives.
  return Math.min(4, Math.max(2, occupiedLast, selected ?? (table.gameCode ? table.capacity : 2)))
}
