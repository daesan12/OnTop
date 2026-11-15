import {residentsEnabled} from '../ai/serviceFeatures'
import type { TableState, TableSummary } from '../../network/protocol'
import { isTableGamePlayable, type TableGameCode } from './model'
import { useGame } from '../../game/store'
import { useSession } from '../../network/worldClient'
import { create } from 'zustand'
import { TABLET_ENABLED } from './tabletFeature'
import { useCompanions } from '../ai/companions'
import { STONE_RUMBLE_ANCHOR_ID } from '../../game/stone-rumble/entrance'

export interface PreparationContext { userId: string; channelId: string; tableId: string; expectedVersion: number }
export interface PreparationSelection { gameCode: TableGameCode; playerCount: number; betAmountPerPlayer: number; targetScore?: number }
/** FE extension port, bound by TabletLobbyClient whenever the seated tablet UI is enabled.
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
    && table.selectorUserId === ownId && isTableGamePlayable(table.gameCode) && table.betAmountPerPlayer != null
    && table.seats.filter(s => s.userId).length === count && table.allReady
    && table.seats.filter(s => s.userId).every(s => s.ready)
}
export function tabletLobbyActive() {
  const s = useSession.getState(), g = useGame.getState(), table = s.tableStates[s.tableId]
  if(residentsEnabled() && useCompanions.getState().practice?.snapshot.tableId===s.tableId)return false
  if (table?.gameCode === 'STONE_RUMBLE' || s.bindings.some(b => b.tableId === s.tableId
    && b.channelId === s.roomId && b.anchorId === STONE_RUMBLE_ANCHOR_ID)) return false
  return TABLET_ENABLED && s.status === 'connected' && !!table && table.seats.some(seat => seat.userId === s.sessionId)
    && !g.watchedGameId && !g.lastResult && !g.game && !['PLAYING', 'SETTLING'].includes(g.start?.phase ?? '')
}
export function approvedChairCount(table: TableState | undefined, selected: number | null) {
  if (!table) return 2
  const occupiedLast = table.seats.reduce((max, seat) => seat.userId ? Math.max(max, seat.seatNumber) : max, 0)
  // Never hide an approved occupant even if a stale/malformed selected count arrives.
  return Math.min(table.gameCode === 'STONE_RUMBLE' ? 8 : 4, Math.max(2, occupiedLast, selected ?? (table.gameCode ? table.capacity : 2)))
}

/** A passerby has a public summary, not a private TABLE_STATE subscription.
 * Prefer detailed approved seats when available; never expand from a local draft. */
export function presentedChairCount(table: TableState | undefined, summary: TableSummary | undefined, selected: number | null) {
  if (table) return approvedChairCount(table, selected ?? (table.startMode === 'MANUAL' ? table.selectedPlayers ?? null : null))
  if (!summary) return 2
  if (summary.chairCount !== undefined) return summary.chairCount
  const count = summary.startMode === 'MANUAL' ? summary.selectedPlayers : null
  return Math.min(summary.gameCode === 'STONE_RUMBLE' ? 8 : 4, Math.max(2, summary.occupiedSeats, count ?? (summary.gameCode ? summary.capacity : 2)))
}
