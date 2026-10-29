import { expect, it, vi } from 'vitest'
import { appendRanking, compareRanking, fetchRanking, parseRanking, rankingDurationMs } from '../../src/features/bungeoppang/ranking'
import { BUNGEOPPANG_V4, BUNGEOPPANG_V5, BUNGEOPPANG_V5_LEGACY } from '../../src/features/bungeoppang/config'
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
const v5 = (durationMs: number | null | undefined, patch: Record<string, unknown> = {}) => body({ rulesVersion: 'v5', durationMs, ...patch })
it('asks for the board of the round just played: 2-minute and legacy 3-minute v5 rounds by stored length, v4 unchanged', async () => {
  expect(rankingDurationMs('v5', BUNGEOPPANG_V5)).toBe(120000)
  expect(rankingDurationMs('v5', BUNGEOPPANG_V5_LEGACY)).toBe(180000)
  expect(rankingDurationMs('v4', BUNGEOPPANG_V4)).toBeUndefined()
  const signal = new AbortController().signal
  for (const durationMs of [120000, 180000]) {
    const request = vi.fn(async () => v5(durationMs))
    const page = await fetchRanking(request, 'v5', '101', signal, undefined, durationMs)
    expect(page.durationMs).toBe(durationMs)
    expect(request).toHaveBeenCalledWith(`/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=v5&limit=20&durationMs=${durationMs}`, { signal, cache: 'no-store' })
    const next = vi.fn(async () => v5(durationMs, { items: [me], nextCursor: null }))
    await fetchRanking(next, 'v5', '101', signal, 'page2', durationMs)
    expect(next).toHaveBeenCalledWith(`/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=v5&limit=20&durationMs=${durationMs}&cursor=page2`, { signal, cache: 'no-store' })
  }
  const v4 = vi.fn(async () => body({ durationMs: null }))
  expect((await fetchRanking(v4, 'v4', '101', signal)).durationMs).toBeNull()
  expect(v4).toHaveBeenCalledWith('/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=v4&limit=20', { signal, cache: 'no-store' })
})
it('rejects a page from another play length and never appends 2-minute and 3-minute pages together', () => {
  expect(parseRanking(v5(180000), 'v5', '101', 180000).durationMs).toBe(180000)
  for (const durationMs of [120000, null, undefined, '180000'])
    expect(() => parseRanking(v5(durationMs as number), 'v5', '101', 180000)).toThrow()
  expect(() => parseRanking(v5(120000), 'v5', '101')).toThrow()
  expect(() => parseRanking(body({ durationMs: 120000 }), 'v4', '101')).toThrow()
  const two = parseRanking(v5(120000), 'v5', '101', 120000)
  const three = parseRanking(v5(180000, { items: [me], nextCursor: null }), 'v5', '101', 180000)
  expect(() => appendRanking(two, three)).toThrow()
  expect(appendRanking(two, { ...three, durationMs: 120000 }).items).toHaveLength(3)
})
