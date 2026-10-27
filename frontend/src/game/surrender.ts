import { createMockSurrenderService } from './mock/MockSurrenderService'

// Preview-only port. Production GAME_FORFEIT uses the shared ParkRuntime transport.
export interface SurrenderContext { gameId: string; userId: string; version: number }
export interface SurrenderPreview { previewOnly: true; outcome: 'FORFEIT'; gameId: string }
export interface SurrenderService {
  mode: 'unavailable' | 'mock'
  preview(context: SurrenderContext): SurrenderPreview
}
export const surrenderService: SurrenderService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? createMockSurrenderService()
  : { mode: 'unavailable', preview: () => { throw new Error('수동 기권 API가 아직 연결되지 않았습니다.') } }
