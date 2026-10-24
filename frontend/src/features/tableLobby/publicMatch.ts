/** FE-only port. TABLE_STATE/REST table summaries currently contain no public game ID.
 * Replace this provider after a BE public-reference contract is approved.
 * Existing GAME_WATCH and its real authorization are never mocked by this port. */
export interface PublicMatchContext { channelId: string; tableId: string }
export interface PublicMatchReference extends PublicMatchContext { gameId: string }
export interface PublicMatchService {
  mode: 'unavailable' | 'mock'
  find(context: PublicMatchContext): PublicMatchReference | null
  clear(): void
}
import { createMockPublicMatchService } from './mock/MockPublicMatchService'
export const publicMatchService: PublicMatchService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? createMockPublicMatchService() : { mode: 'unavailable', find: () => null, clear: () => {} }
