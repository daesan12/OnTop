import { describe, expect, it } from 'vitest'
import { formatJumpmapFinish, formatRankingUpdatedAt, parseParkRanking, rankingColumns } from '../../src/features/rankingBoard/service'
import { canPollParkRanking } from '../../src/features/rankingBoard/RankingBoardHost'
import { completeRankingRefresh, failRankingRefresh, resetRankingBoardFeed, useRankingBoardFeed } from '../../src/features/rankingBoard/state'

const response = {
  balance: [
    { rank: 1, userId: '11', nickname: '고양이', coinBalance: 300 },
    { rank: 1, userId: '12', nickname: '호랑이', coinBalance: 300 },
    { rank: 3, userId: '13', nickname: '곰', coinBalance: 200 },
  ],
  bungeoppangChampion: { userId: '14', nickname: '붕어빵 장인', score: 2_981, maxCombo: 14, completedAt: '2026-11-02T05:30:00Z' },
  jumpmapChampion: { userId: '15', nickname: '점프 고수', finishMs: 62_543, completedAt: '2026-11-02T05:31:00Z' },
  updatedAt: '2026-11-02T05:32:00Z',
}

describe('park ranking contract', () => {
  it('keeps API order and shared 1, 1, 3 ranks', () => {
    const parsed = parseParkRanking(response)
    expect(parsed.balance.map(item => item.rank)).toEqual([1, 1, 3])
    expect(parsed.balance.map(item => item.userId)).toEqual(['11', '12', '13'])
    expect(rankingColumns(parsed).map(column => column.rows[0]?.value)).toEqual(['300냥', '2,981점', '1분 02.543초'])
  })

  it('accepts an empty board', () => {
    const empty = parseParkRanking({ ...response, balance: [], bungeoppangChampion: null, jumpmapChampion: null })
    expect(rankingColumns(empty).map(column => column.rows)).toEqual([[], [], []])
  })

  it('formats jumpmap records with minutes, seconds and milliseconds', () => {
    expect(formatJumpmapFinish(8_500)).toBe('0분 08.500초')
    expect(formatJumpmapFinish(125_006)).toBe('2분 05.006초')
  })

  it('keeps a space between the Korean date and time', () => {
    expect(formatRankingUpdatedAt('2026-11-02T05:32:00Z')).toBe('2026.11.02 14:32')
  })

  it('polls only while the document is visible', () => {
    expect(canPollParkRanking('visible')).toBe(true)
    expect(canPollParkRanking('hidden')).toBe(false)
  })

  it('rejects over ten rows, duplicate users, malformed values and reordered ranks', () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({ rank: index + 1, userId: String(index + 1), nickname: '사용자', coinBalance: 1 }))
    expect(() => parseParkRanking({ ...response, balance: rows })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, balance: [response.balance[0], response.balance[0]] })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, bungeoppangChampion: 'invalid' })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, jumpmapChampion: 123 })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, bungeoppangChampion: { ...response.bungeoppangChampion, nickname: '' } })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, jumpmapChampion: { ...response.jumpmapChampion, finishMs: 0 } })).toThrow('랭킹 응답')
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
