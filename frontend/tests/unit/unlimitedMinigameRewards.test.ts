import { describe, expect, it } from 'vitest'
import { createBungeoppangService } from '../../src/features/bungeoppang/service'
import { SpeedMoleService } from '../../src/features/speedMole/service'
import { parseCoopResult } from '../../src/features/skewer/coop/contracts'
import { parseJumpStatus } from '../../src/features/jumpmap/protocol'
import { COURSE_VERSION, MAP_VERSION, RULES_VERSION, kstDate } from '../../src/features/jumpmap/course'

describe('일일 미니게임 보상 제한 해제', () => {
  it('붕어빵 누계가 기존 한도를 넘어도 서버의 무제한 상태를 받는다', async () => {
    const service = createBungeoppangService(async () => ({ todayEarned: 100_017, dailyCap: 0,
      rulesVersion: 'v2', isFirstGame: false, seenTips: [] }))
    expect(await service.getStatus()).toMatchObject({ todayEarned: 100_017, dailyCap: 0 })
  })

  it('스피드 두더지의 무제한 지급 영수증을 받는다', async () => {
    const receipt = { id: '7', rulesVersion: 1, score: 120, hits: 120, misses: 0,
      completedAt: '2026-11-24T01:00:00Z', calculatedReward: 24, reward: 24, todayEarned: 100_024, dailyCap: 0 }
    expect(await new SpeedMoleService(async () => receipt).complete('7', [])).toEqual(receipt)
  })

  it('꼬치왕의 무제한 영수증은 남은 일일 한도를 요구하지 않는다', () => {
    const gameId = 'skewer-coop-123'
    const receipt = { gameId, status: 'SETTLED', teamScore: 2400, served: 3, endReason: 'SKEWER_TIME_UP',
      rankingStatus: 'REGISTERED', rankingReason: 'ELIGIBLE', coinsCalculated: 120, coinsGranted: 120,
      todayEarned: 10_120, dailyCap: 0, remainingToday: null, balance: 120, rewardDate: '2026-11-24',
      settledAt: '2026-11-24T01:00:00Z' }
    expect(parseCoopResult(receipt, gameId)).toEqual(receipt)
    expect(() => parseCoopResult({ ...receipt, remainingToday: 0 }, gameId)).toThrow()
    expect(() => parseCoopResult({ ...receipt, dailyCap: null }, gameId)).toThrow()
  })

  it('점프맵은 큰 누계를 허용하고 잘못된 재화 값은 계속 거절한다', () => {
    const status = { channelId: 'channel-1', mapVersion: MAP_VERSION, rulesVersion: RULES_VERSION,
      courseVersion: COURSE_VERSION, revision: 1, enabled: true, todayEarned: 100_250, dailyCap: 0,
      earningsDate: kstDate(), isFirstRun: false, seenTips: [], activeRunId: null, bestFinishMs: null }
    expect(parseJumpStatus(status).todayEarned).toBe(100_250)
    for (const invalid of [-1, 1.5, null, Number.POSITIVE_INFINITY]) {
      expect(() => parseJumpStatus({ ...status, todayEarned: invalid })).toThrow()
    }
  })
})
