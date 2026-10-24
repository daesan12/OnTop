import type { SurrenderService } from '../surrender'

/** M10_SURRENDER_MOCK_ONLY: confirms UI intent; never changes a real board/result/seat/wallet. */
export function createMockSurrenderService(): SurrenderService {
  return { mode: 'mock', preview(context) {
    if (!context.gameId.trim() || !context.userId.trim() || !Number.isSafeInteger(context.version) || context.version < 0)
      throw new Error('M10_SURRENDER_MOCK_ONLY: 기권 미리보기의 경기 정보를 확인해주세요.')
    return { previewOnly: true, outcome: 'FORFEIT', gameId: context.gameId }
  } }
}
