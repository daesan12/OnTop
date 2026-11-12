import { describe, expect, it } from 'vitest'
import { parseCoopResult, parseCoopRanking } from '../../src/features/skewer/coop/contracts'
import { endReasonText, rankingReasonText } from '../../src/features/skewer/coop/CoopResultPanel'

const gameId = 'skewer-coop-00000000-0000-4000-8000-000000000001'
const receipt = () => ({ gameId, status: 'SETTLED', teamScore: 2400, served: 3, endReason: 'SKEWER_TIME_UP', rankingStatus: 'REGISTERED', rankingReason: 'ELIGIBLE', coinsCalculated: 120, coinsGranted: 10, todayEarned: 1000, dailyCap: 1000, remainingToday: 0, balance: 600, rewardDate: '2026-11-02', settledAt: '2026-11-02T12:00:00Z' })

describe('꼬치왕 개인 정산 응답', () => {
  it('진행 오류 종료를 정상 완료나 참가자 기권으로 안내하지 않는다', () => {
    const result = parseCoopResult({ ...receipt(), endReason: 'SKEWER_RUNTIME_ERROR', rankingStatus: 'EXCLUDED', rankingReason: 'EARLY_END' }, gameId)
    expect(endReasonText(result.endReason)).toContain('진행 중 문제가 생겨')
    expect(endReasonText('SKEWER_TIME_UP')).toBe('둘이 함께 만든 오늘의 기록')
    expect(rankingReasonText(result.rankingReason)).toContain('랭킹에 등록하지 않아요')
  })
  it('환산액과 일일 한도로 줄어든 실제 지급액을 구분한다', () => {
    const result = parseCoopResult(receipt(), gameId)
    expect(result.coinsCalculated).toBe(120)
    expect(result.coinsGranted).toBe(10)
    expect(result.remainingToday).toBe(0)
  })
  it('다른 경기 영수증과 한도 위반·음수 지급을 거절한다', () => {
    expect(() => parseCoopResult(receipt(), `${gameId}x`)).toThrow()
    for (const changes of [{ coinsGranted: 121 }, { coinsGranted: -1 }, { remainingToday: 1 }, { dailyCap: 500 }]) {
      expect(() => parseCoopResult({ ...receipt(), ...changes }, gameId)).toThrow()
    }
  })
  it('미확정 결과에 지급액이나 지갑 잔액이 섞이면 거절한다', () => {
    const pending = { ...receipt(), status: 'PENDING', rankingStatus: 'PENDING', coinsGranted: null, todayEarned: null, remainingToday: null, balance: null, rewardDate: null, settledAt: null }
    expect(parseCoopResult(pending, gameId).coinsGranted).toBeNull()
    expect(() => parseCoopResult({ ...pending, coinsGranted: 120 }, gameId)).toThrow()
    expect(() => parseCoopResult({ ...pending, balance: 100 }, gameId)).toThrow()
  })
  it('다음 날 결과를 다시 열어도 과거 지급액과 오늘 남은 한도를 구분한다', () => {
    expect(parseCoopResult({ ...receipt(), todayEarned: 0, remainingToday: 1000 }, gameId).coinsGranted).toBe(10)
  })
  it('팀 랭킹은 정해진 규칙·전체 기간·최고기록과 최대 20개 응답만 받는다', () => {
    const ranking = { rulesVersion: 'coop-v1', period: 'ALL_TIME', aggregation: 'TEAM_BEST', asOf: '2026-11-02T12:00:00Z', items: [], myBest: null }
    expect(parseCoopRanking(ranking).items).toEqual([])
    expect(() => parseCoopRanking({ ...ranking, aggregation: 'SUM' })).toThrow()
    expect(() => parseCoopRanking({ ...ranking, myBest: { rank: 1 } })).toThrow()
  })
})
