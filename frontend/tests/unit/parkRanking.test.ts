import { describe, expect, it } from 'vitest'
import { formatRankingUpdatedAt, parseParkRanking, rankingColumns } from '../../src/features/rankingBoard/service'
import { canPollParkRanking } from '../../src/features/rankingBoard/RankingBoardHost'
import { completeRankingRefresh, failRankingRefresh, resetRankingBoardFeed, useRankingBoardFeed } from '../../src/features/rankingBoard/state'
import { displayNickname } from '../../src/features/gameMaster/displayName'
import { advanceRankingPage, rankingPage, selectDetailPage, useRankingPages } from '../../src/features/rankingBoard/pages'

const response = {
  balance: [
    { rank: 1, userId: '11', nickname: '고양이', coinBalance: 300 },
    { rank: 1, userId: '12', nickname: '호랑이', coinBalance: 300 },
    { rank: 3, userId: '13', nickname: '곰', coinBalance: 200 },
  ],
  mole: [
    { rank: 1, userId: '14', nickname: '두더지 장인', score: 2_981, maxCombo: 14, completedAt: '2026-11-02T05:30:00Z' },
    { rank: 2, userId: '16', nickname: '두더지 도전자', score: 2_500, maxCombo: 12, completedAt: '2026-11-02T05:31:00Z' },
  ],
  speedMole: [
    { rank: 1, userId: '15', nickname: '스피드 고수', score: 132, misses: 3, completedAt: '2026-11-02T05:31:00Z' },
    { rank: 1, userId: '17', nickname: '공동 고수', score: 132, misses: 3, completedAt: '2026-11-02T05:32:00Z' },
  ],
  jumpRope: [
    { rank: 1, userId: '18', nickname: '줄넘기 고수', score: 1_250, misses: 1, completedAt: '2026-11-02T05:31:30Z' },
    { rank: 2, userId: '19', nickname: '줄넘기 도전자', score: 980, misses: 2, completedAt: '2026-11-02T05:31:40Z', gameMaster: true },
    { rank: 2, userId: '20', nickname: '공동 도전자', score: 980, misses: 2, completedAt: '2026-11-02T05:31:50Z' },
  ],
  jumpRopeStartsAt: '2026-11-16T05:00:00Z', jumpRopeEndsAtExclusive: '2026-11-18T15:00:00Z',
  updatedAt: '2026-11-02T05:32:00Z',
}

describe('park ranking contract', () => {
  it('shows one team row with VR on both members and rejects a role-swapped duplicate team', () => {
    const team = { rank: 1, gameId: 'team-record', chefUserId: '21', chefNickname: '요리왕', serverUserId: '22', serverNickname: '서빙왕', score: 900, playMode: 'VR', completedAt: response.updatedAt, chefGameMaster: false, serverGameMaster: false }
    const parsed = parseParkRanking({ ...response, skewer: [team], jumpmap: [{ rank: 1, userId: '21', nickname: '완주왕', finishMs: 60123, completedAt: response.updatedAt }] })
    const second = rankingPage(rankingColumns(parsed), 1)
    expect(second.map(column => column.key)).toEqual(['jumpmap', 'bungeoppang', 'skewer'])
    expect(second[0].rows[0].value).toBe('1:00.123')
    expect(second[2].rows[0].members?.map(member => member.vr)).toEqual([true, true])
    expect(() => parseParkRanking({ ...response, skewer: [team, { ...team, chefUserId: '22', serverUserId: '21' }] })).toThrow()
    expect(() => parseParkRanking({ ...response, skewer: [{ ...team, playMode: 'ALL' }] })).toThrow()
  })

  it('keeps manual and automatic page selection independent without changing the data feed', () => {
    useRankingPages.setState({ boardPage: 0, detailPage: 0, deadline: null })
    const feed = useRankingBoardFeed.getState()
    advanceRankingPage(100)
    selectDetailPage(-1)
    expect(useRankingPages.getState()).toEqual({ boardPage: 1, detailPage: 1, deadline: 8100 })
    advanceRankingPage(8100)
    expect(useRankingPages.getState().boardPage).toBe(0)
    expect(useRankingBoardFeed.getState()).toBe(feed)
  })

  it('does not relabel legacy all-time pigeon records as event records', () => {
    const { jumpRopeStartsAt: _start, jumpRopeEndsAtExclusive: _end, ...legacy } = response
    expect(rankingColumns(parseParkRanking(legacy))[3]).toMatchObject({ rows: [], description: '기간 집계 준비 중' })
  })
  it('keeps API order and shared 1, 1, 3 ranks', () => {
    const parsed = parseParkRanking(response)
    expect(parsed.balance.map(item => item.rank)).toEqual([1, 1, 3])
    expect(parsed.balance.map(item => item.userId)).toEqual(['11', '12', '13'])
    expect(parsed.mole.map(item => item.rank)).toEqual([1, 2])
    expect(parsed.speedMole.map(item => item.rank)).toEqual([1, 1])
    expect(parsed.jumpRope.map(item => item.rank)).toEqual([1, 2, 2])
    expect(parsed.jumpRope.map(item => item.gameMaster)).toEqual([false, true, false])
    expect(rankingColumns(parsed).map(column => column.key)).toEqual(['balance', 'mole', 'speedMole', 'jumpRope', 'jumpmap', 'bungeoppang', 'skewer'])
    expect(rankingColumns(parsed).map(column => column.title)).toEqual(['총자산', '두더지 잡기', '스피드 두더지 잡기', '구구구 줄넘기', '점프맵', '붕어빵 굽기', '온탑 꼬치왕'])
    expect(rankingColumns(parsed).map(column => column.rows[0]?.value)).toEqual(['300냥', '2,981점', '132점', '1,250점', undefined, undefined, undefined])
    expect(rankingColumns(parsed).map(column => column.rows.length)).toEqual([3, 2, 2, 3, 0, 0, 0])
  })

  it('shows an empty jump-rope column when an older server omits it', () => {
    const { jumpRope: _omitted, ...older } = response
    const parsed = parseParkRanking(older)
    expect(parsed.jumpRope).toEqual([])
    expect(rankingColumns(parsed)).toHaveLength(7)
    expect(rankingColumns(parsed)[3]).toMatchObject({ title: '구구구 줄넘기', rows: [] })
  })

  it('accepts an empty board', () => {
    const empty = parseParkRanking({ ...response, balance: [], mole: [], speedMole: [], jumpRope: [] })
    expect(rankingColumns(empty).map(column => column.rows)).toEqual([[], [], [], [], [], [], []])
  })

  it('shows the server-approved GM prefix without changing the stored nickname', () => {
    const parsed = parseParkRanking({
      ...response,
      balance: [{ ...response.balance[0], gameMaster: true }],
      mole: [], speedMole: [],
    })
    expect(parsed.balance[0]).toMatchObject({ nickname: '고양이', gameMaster: true })
    expect(displayNickname(parsed.balance[0], '')).toBe('GM 고양이')
    expect(displayNickname(parseParkRanking(response).balance[0], '')).toBe('고양이')
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
    expect(() => parseParkRanking({ ...response, mole: 'invalid' })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, speedMole: 123 })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, mole: [{ ...response.mole[0], nickname: '' }] })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, speedMole: [{ ...response.speedMole[0], misses: -1 }] })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, mole: undefined })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, jumpRope: null })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, jumpRope: [{ ...response.jumpRope[0], misses: -1 }] })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, jumpRope: [response.jumpRope[0], response.jumpRope[0]] })).toThrow('랭킹 응답')
    expect(() => parseParkRanking({ ...response, jumpRope: [{ ...response.jumpRope[0], completedAt: 'invalid' }] })).toThrow('랭킹 응답')
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
