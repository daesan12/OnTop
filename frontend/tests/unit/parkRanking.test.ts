import { describe, expect, it } from 'vitest'
import { parseParkRanking, rankingColumns } from '../../src/features/rankingBoard/service'
import { completeRankingRefresh, failRankingRefresh, resetRankingBoardFeed, useRankingBoardFeed } from '../../src/features/rankingBoard/state'

const response = {
  balance: [
    { rank: 1, userId: '11', nickname: '고양이', coinBalance: 300 },
    { rank: 1, userId: '12', nickname: '호랑이', coinBalance: 300 },
    { rank: 3, userId: '13', nickname: '곰', coinBalance: 200 },
  ],
  singleGameProfit: [{ rank: 1, userId: '14', nickname: '승부사', profit: 25 }],
  wins: [{ rank: 1, userId: '15', nickname: '고수', winCount: 7 }],
  updatedAt: '2026-11-02T05:32:00Z',
}

describe('park ranking contract', () => {
  it('keeps API order and shared 1, 1, 3 ranks', () => {
    const parsed = parseParkRanking(response)
    expect(parsed.balance.map(item => item.rank)).toEqual([1, 1, 3])
    expect(parsed.balance.map(item => item.userId)).toEqual(['11', '12', '13'])
    expect(rankingColumns(parsed).map(column => column.rows[0]?.value)).toEqual(['300냥', '25냥', '7승'])
  })

  it('accepts an empty board', () => {
    expect(parseParkRanking({ ...response, balance: [], singleGameProfit: [], wins: [] }).balance).toEqual([])
  })

  it('rejects over ten rows, duplicate users, malformed values and reordered ranks', () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({ rank: index + 1, userId: String(index + 1), nickname: '사용자', coinBalance: 1 }))
    expect(() => parseParkRanking({ ...response, balance: rows })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, balance: [response.balance[0], response.balance[0]] })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, wins: [{ rank: 1, userId: '15', nickname: '', winCount: 7 }] })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, balance: [response.balance[2], response.balance[0]] })).toThrow('랭킹 응답')
  })

  it('keeps the previous snapshot and marks it stale when a refresh fails', () => {
    resetRankingBoardFeed()
    const parsed = parseParkRanking(response)
    completeRankingRefresh(parsed)
    failRankingRefresh('네트워크 오류')
    expect(useRankingBoardFeed.getState()).toMatchObject({ snapshot: parsed, error: '네트워크 오류', stale: true, loading: false })
    resetRankingBoardFeed()
  })
})
