import { describe, expect, it } from 'vitest'
import { fitnessRewardDate, fitnessRewardSeconds, parseFitnessRewardStatus } from '../../src/features/fitness/rewards'

const status = { enabled: true, earningsDate: '2026-11-03', todayEarned: 12, dailyCap: 300,
  rewardIntervalSeconds: 60, serverNow: 100_000, nextRewardAt: 137_000, activeLeaseId: 'own-lease' }
describe('운동 수입 서버 상태', () => {
  it('서버 시각을 기준으로 남은 시간을 표시하고 확정 경계 뒤에는 지급 확인을 기다린다', () => {
    const parsed = parseFitnessRewardStatus(status)
    expect(fitnessRewardSeconds(parsed, 1000)).toBe(36)
    expect(fitnessRewardSeconds(parsed, 40000)).toBe(0)
    expect(parsed.todayEarned).toBe(12)
  })
  it('운동 미이용과 한도 도달 응답에는 다음 지급 시각이 없다', () => {
    expect(fitnessRewardSeconds(parseFitnessRewardStatus({ ...status, todayEarned: 300, nextRewardAt: null }), 0)).toBeNull()
    expect(() => parseFitnessRewardStatus({ ...status, todayEarned: 300 })).toThrow()
    expect(() => parseFitnessRewardStatus({ ...status, activeLeaseId: null })).toThrow()
    expect(() => parseFitnessRewardStatus({ ...status, dailyCap: 500 })).toThrow()
    expect(() => parseFitnessRewardStatus({ ...status, todayEarned: -1 })).toThrow()
  })
  it('한국 자정을 기준으로 수입 날짜를 구분한다', () => {
    expect(fitnessRewardDate(Date.parse('2026-11-03T14:59:59.999Z'))).toBe('2026-11-03')
    expect(fitnessRewardDate(Date.parse('2026-11-03T15:00:00Z'))).toBe('2026-11-04')
  })
})
