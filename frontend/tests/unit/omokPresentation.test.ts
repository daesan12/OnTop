import { describe, expect, it } from 'vitest'
import { lastMoveText, omokCell, omokEndReason, omokOutcome, stonePoint, OMOK_HALF, OMOK_SPACING, omokCoordinate } from '../../src/game/omokPresentation'
import { createMockSurrenderService } from '../../src/game/mock/MockSurrenderService'
import { surrenderService } from '../../src/game/surrender'
import { useGame } from '../../src/game/store'
import type { Omok } from '../../src/game/protocol'

describe('M10 presentation follows public server fields', () => {
  it('maps every intersection including corners to the same row/column used in server input', () => {
    expect(omokCoordinate(0, 0)).toBe('A1')
    expect(omokCoordinate(7, 7)).toBe('H8')
    expect(omokCoordinate(14, 14)).toBe('O15')
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const [localX, , localZ] = stonePoint(x, y)
      expect(omokCell(localX, localZ)).toEqual({ x, y })
    }
    expect(omokCell(OMOK_HALF + OMOK_SPACING, 0)).toBeNull()
    expect(omokCell(0, -OMOK_HALF - OMOK_SPACING)).toBeNull()
    expect(omokCell(NaN, 0)).toBeNull()
  })
  it('uses server last move, winner and end reason without detecting wins locally', () => {
    expect(lastMoveText(null)).toBe('아직 놓인 돌이 없습니다.')
    expect(lastMoveText({ x: 14, y: 0, stone: 'WHITE' })).toBe('마지막 수: 백 · O1 (1행 15열)')
    const result = { winnerUserId: '102', blackUserId: '101' } as Omok
    expect(omokOutcome(result, '101', false)).toBe('패배')
    expect(omokOutcome(result, '102', false)).toBe('승리')
    expect(omokOutcome(result, '505', true)).toBe('경기 종료 · 백 승리')
    expect(omokOutcome({ ...result, winnerUserId: null }, '101', false)).toContain('무승부')
    expect(omokEndReason('TURN_TIMEOUT')).toBe('착수 시간 초과')
    expect(omokEndReason('BOARD_FULL')).toBe('빈 교차점 없음')
    expect(omokEndReason('NEW_SERVER_REASON')).toBe('NEW_SERVER_REASON')
  })
  it('only previews missing surrender intent and never writes game state or grants a result', () => {
    const before = useGame.getState()
    const preview = createMockSurrenderService().preview({ gameId: 'g', userId: '101', version: 7 })
    expect(preview).toEqual({ previewOnly: true, gameId: 'g', outcome: 'FORFEIT' })
    expect(useGame.getState()).toBe(before)
    expect(surrenderService.mode).toBe('unavailable')
    expect(() => surrenderService.preview({ gameId: 'g', userId: '101', version: 7 })).toThrow('API')
  })
})
