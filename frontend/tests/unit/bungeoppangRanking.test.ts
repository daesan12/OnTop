import { expect, it, vi } from 'vitest'
import { appendRanking, compareRanking, fetchRanking, parseRanking } from '../../src/features/bungeoppang/ranking'
const first = { rank: 1, userId: '102', nickname: '먼저 완성', made: 12, failed: 1, completedAt: '2026-10-28T08:00:00Z' }
const second = { ...first, userId: '103', nickname: '나중 완성', completedAt: '2026-10-28T09:00:00Z' }
const me = { rank: 3, userId: '101', nickname: '나', made: 10, failed: 0, completedAt: '2026-10-28T09:30:00Z' }
const body = (patch: Record<string, unknown> = {}) => ({ rulesVersion: 'v4', period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: 's1', updatedAt: '2026-10-28T10:00:00Z', totalParticipants: 3, items: [first, second], me, nextCursor: 'page2', ...patch })
it('keeps equal scores at the same rank, ordered by first completion; made outranks mistakes', () => {
  const page = parseRanking(body(), 'v4', '101')
  expect(page.items.map(row => row.rank)).toEqual([1, 1])
  expect(compareRanking(first, second)).toBeLessThan(0)
  expect(compareRanking(second, me)).toBeLessThan(0)
  expect(compareRanking({ ...first, failed: 0 }, first)).toBeLessThan(0)
})
it('rejects a weekly/mixed-rule response, private-user mismatch, duplicate users or broken tie ordering', () => {
  for (const patch of [{ period: 'WEEKLY' }, { rulesVersion: 'v5' }, { me: first }, { items: [first, first] },
    { items: [second, first] }, { items: [first, { ...second, rank: 2 }] }, { items: [first, { ...second, completedAt: 'invalid' }] }])
    expect(() => parseRanking(body(patch), 'v4', '101')).toThrow()
})
it('appends only a stable snapshot and rejects duplicate/looped or out-of-order pages', () => {
  const page = parseRanking(body(), 'v4', '101'), next = parseRanking(body({ items: [me], nextCursor: null }), 'v4', '101')
  expect(appendRanking(page, next).items.map(row => row.rank)).toEqual([1, 1, 3])
  expect(() => appendRanking(page, { ...next, snapshotId: 's2' })).toThrow()
  expect(() => appendRanking(page, { ...next, nextCursor: 'page2' })).toThrow()
  expect(() => appendRanking(page, { ...next, items: [first] })).toThrow()
})
it('uses a read-only no-store request and passes its cancellation signal without posting a client score', async () => {
  const request = vi.fn(async () => body()), signal = new AbortController().signal
  await fetchRanking(request, 'v4', '101', signal)
  expect(request).toHaveBeenCalledWith('/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=v4&limit=20', { signal, cache: 'no-store' })
  expect(request.mock.calls[0]).not.toContainEqual(expect.objectContaining({ method: 'POST' }))
})
