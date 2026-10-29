import { expect, it, vi } from 'vitest'
import { appendRanking, compareRanking, fetchRanking, parseRanking, RankingScoreUnavailableError } from '../../src/features/bungeoppang/ranking'
const first = { rank: 1, userId: '102', nickname: '먼저 완성', score: 1200, maxCombo: 12, made: 18, failed: 3, completedAt: '2026-10-28T08:00:00Z' }
const second = { ...first, userId: '103', nickname: '나중 완성', made: 22, failed: 0, completedAt: '2026-10-28T09:00:00Z' }
const me = { rank: 3, userId: '101', nickname: '나', score: 1200, maxCombo: 8, made: 20, failed: 0, completedAt: '2026-10-28T07:00:00Z' }
const lower = { ...me, rank: 4, userId: '104', score: 1000, maxCombo: 30, made: 40 }
const body = (patch: Record<string, unknown> = {}) => ({ rulesVersion: 'v4', period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: 's1', updatedAt: '2026-10-28T10:00:00Z', totalParticipants: 4, items: [first, second], me, nextCursor: 'page2', ...patch })
it('orders by score, then max combo, then completion time with shared score/combo ranks', () => {
  const page = parseRanking(body(), 'v4', '101')
  expect(page.items.map(row => row.rank)).toEqual([1, 1])
  expect(compareRanking(first, second)).toBeLessThan(0)
  expect(compareRanking(second, me)).toBeLessThan(0)
  expect(compareRanking(me, lower)).toBeLessThan(0)
  expect(compareRanking({ ...first, score: 1201 }, first)).toBeLessThan(0)
  const changedCounts = { ...first, made: 100, failed: 0 }
  expect(compareRanking(first, changedCounts)).toBe(0)
})
it('requires both verified ranking values without substituting counts or a missing combo', () => {
  const { score, ...legacy } = first
  expect(() => parseRanking(body({ items: [legacy] }), 'v4', '101')).toThrow(RankingScoreUnavailableError)
  const { maxCombo, ...scoreOnly } = first
  expect(() => parseRanking(body({ items: [scoreOnly] }), 'v4', '101')).toThrow(RankingScoreUnavailableError)
  expect(() => parseRanking(body({ me: { ...me, maxCombo: undefined } }), 'v4', '101')).toThrow(RankingScoreUnavailableError)
  for (const key of ['score', 'maxCombo']) for (const value of [-1, 1.5, NaN, Infinity, '1200', null, Number.MAX_SAFE_INTEGER + 1])
    expect(() => parseRanking(body({ items: [{ ...first, [key]: value }] }), 'v4', '101')).toThrow()
  expect(parseRanking(body({ totalParticipants: 1, items: [{ ...first, score: 0, maxCombo: 0 }], me: null, nextCursor: null }), 'v4', '101').items[0]).toMatchObject({ score: 0, maxCombo: 0 })
})
it('rejects a weekly/mixed-rule response, private-user mismatch, duplicate users or broken tie ordering', () => {
  for (const patch of [{ period: 'WEEKLY' }, { rulesVersion: 'v5' }, { me: first }, { items: [first, first] },
    { items: [second, first] }, { items: [first, { ...second, rank: 2 }] },
    { items: [first, { ...second, maxCombo: 13, rank: 2 }] }, { items: [first, { ...second, maxCombo: 11 }] },
    { items: [{ ...first, score: 999 }, { ...second, rank: 2 }] }, { items: [first, { ...second, completedAt: 'invalid' }] }])
    expect(() => parseRanking(body(patch), 'v4', '101')).toThrow()
})
it('appends only a stable snapshot and rejects duplicate/looped or out-of-order pages', () => {
  const page = parseRanking(body(), 'v4', '101'), next = parseRanking(body({ items: [me, lower], nextCursor: null }), 'v4', '101')
  expect(appendRanking(page, next).items.map(row => row.rank)).toEqual([1, 1, 3, 4])
  expect(() => appendRanking(page, { ...next, snapshotId: 's2' })).toThrow()
  expect(() => appendRanking(page, { ...next, nextCursor: 'page2' })).toThrow()
  expect(() => appendRanking(page, { ...next, items: [first] })).toThrow()
  expect(() => appendRanking(page, { ...next, items: [{ ...me, maxCombo: 13 }] })).toThrow()
  const boundary = parseRanking(body({ items: [first] }), 'v4', '101')
  expect(appendRanking(boundary, parseRanking(body({ items: [second, me, lower], nextCursor: null }), 'v4', '101')).items.map(row => row.rank)).toEqual([1, 1, 3, 4])
})
it('uses a read-only no-store request and passes its cancellation signal without posting a client score', async () => {
  const request = vi.fn(async () => body()), signal = new AbortController().signal
  await fetchRanking(request, 'v4', '101', signal)
  expect(request).toHaveBeenCalledWith('/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=v4&limit=20', { signal, cache: 'no-store' })
  expect(request.mock.calls[0]).not.toContainEqual(expect.objectContaining({ method: 'POST' }))
})
