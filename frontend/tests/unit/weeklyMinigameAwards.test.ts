import { expect, it } from 'vitest'
import { parseWeeklyGames, parseWeeklyRanking } from '../../src/features/admin/weeklyMinigameAwards'

const week = '2026-11-09'
const game = { gameCode: 'BUNGEOPPANG', displayName: '붕어빵', rankingRuleVersion: 'v5-120000ms',
  weekStartDate: week, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-15T15:00:00Z',
  announcesAt: '2026-11-16T00:00:00Z', prizeName: '기프티콘', enabled: true, finalizedAt: null }
const rank = { place: 1, userId: 7, nickname: '우승자', sourceRecordId: '42', sourceValue: 616,
  secondaryValue: 3, achievedAt: '2026-11-12T00:00:00Z' }

it('uses the registered active game list without a hard-coded game tab', () => {
  const other = { ...game, gameCode: 'MG_NEW', displayName: '새 게임' }
  expect(parseWeeklyGames([game, { ...game, gameCode: 'JUMPMAP', enabled: false }, other], week)
    .map(item => item.gameCode)).toEqual(['BUNGEOPPANG', 'MG_NEW'])
  expect(() => parseWeeklyGames([{ ...game, weekStartDate: '2026-11-02' }], week)).toThrow()
  expect(() => parseWeeklyGames([game, game], week)).toThrow()
})

it('accepts provisional, ready and finalized rankings while rejecting inconsistent results', () => {
  const ready = { game, status: 'READY', candidateCount: 2, excludedGmCount: 1,
    ranks: [rank], winner: null }
  expect(parseWeeklyRanking(ready, week, 'BUNGEOPPANG').ranks[0]?.sourceRecordId).toBe('42')
  expect(parseWeeklyRanking({ ...ready, status: 'PROVISIONAL' }, week, 'BUNGEOPPANG').status).toBe('PROVISIONAL')
  const { winner: _unused, ...withoutWinner } = ready
  expect(parseWeeklyRanking(withoutWinner, week, 'BUNGEOPPANG').winner).toBeNull()
  const finalized = { ...ready, game: { ...game, finalizedAt: '2026-11-16T00:05:00Z' },
    status: 'FINALIZED', ranks: [], winner: { userId: 7, nickname: '우승자', sourceRecordId: '42',
      sourceValue: 616, sourceAchievedAt: rank.achievedAt, prizeName: '기프티콘' } }
  expect(parseWeeklyRanking(finalized, week, 'BUNGEOPPANG').winner?.nickname).toBe('우승자')
  const { winner: _vacant, ...vacant } = finalized
  expect(parseWeeklyRanking(vacant, week, 'BUNGEOPPANG').winner).toBeNull()
  expect(() => parseWeeklyRanking({ ...ready, excludedGmCount: 3 }, week, 'BUNGEOPPANG')).toThrow()
  expect(() => parseWeeklyRanking(ready, week, 'JUMPMAP')).toThrow()
  expect(() => parseWeeklyRanking({ ...finalized, ranks: [rank] }, week, 'BUNGEOPPANG')).toThrow()
})
