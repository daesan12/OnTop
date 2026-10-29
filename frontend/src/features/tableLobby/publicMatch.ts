/** GET is a selection hint. Only the currently subscribed TABLE_WATCH_STATE can authorize a target selection. */
export interface PublicMatchContext { channelId: string; tableId: string }
export interface PublicMatchReference extends PublicMatchContext { gameId: string }
export interface PublicMatchService {
  mode: 'server' | 'mock'
  find(context: PublicMatchContext): PublicMatchReference | null
  clear(): void
}
import { createMockPublicMatchService } from './mock/MockPublicMatchService'
import { useSession, type Session } from '../../network/worldClient'
export function createServerPublicMatchService(read: () => Pick<Session, 'roomId' | 'status' | 'watchedTableId' | 'tableStates'>): PublicMatchService {
  return { mode: 'server', clear() {}, find(context) {
    const s = read()
    if (s.status !== 'connected' || context.channelId !== s.roomId || !context.tableId || context.tableId !== s.watchedTableId) return null
    const gameId = s.tableStates[context.tableId]?.gameId
    return typeof gameId === 'string' && !!gameId.trim() && gameId.length <= 120 ? { ...context, gameId } : null
  } }
}
export const publicMatchService: PublicMatchService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? createMockPublicMatchService() : createServerPublicMatchService(() => useSession.getState())
