import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  session: { status: 'AUTHENTICATED', accessToken: 'test-access' } as
    | { status: 'AUTHENTICATED'; accessToken: string } | null,
  refresh: vi.fn<() => Promise<boolean>>(),
}))
vi.mock('../../src/auth/authFlow', () => ({
  getAuthSession: () => auth.session, restoreAuthSession: auth.refresh,
}))

import {
  groupGames, isStaleSnapshot, kstDate, loadAdminAnalytics, parseAdminAnalytics, periodRows,
  selectAnalyticsPeriod, shiftDate,
} from '../../src/features/admin/adminAnalytics'

const snapshot = {
  schemaVersion: 1, dataAsOf: '2026-10-27T18:00:00Z', generatedAt: '2026-10-27T18:05:00Z',
  daily: [
    { date: '2026-10-27', activeUsers: 3, newUsers: 2, connections: 4, players: 1, userId: 99 },
    { date: '2026-10-28', activeUsers: 2, newUsers: 0, connections: 3, players: 2 },
  ],
  funnel: [{ date: '2026-10-27', onboarded: 2, channelJoined: 2, tableJoined: 1,
    gameStarted: 1, gameCompleted: 0 }],
  games: [
    { date: '2026-10-27', gameCode: 'OMOK', started: 2, ended: 1, completed: 1,
      forfeits: 1, participants: 2, durationSeconds: 600, timedGames: 1 },
    { date: '2026-10-28', gameCode: 'OMOK', started: 1, ended: 1, completed: 1,
      forfeits: 0, participants: 2, durationSeconds: 300, timedGames: 1 },
  ],
}

beforeEach(() => {
  auth.session = { status: 'AUTHENTICATED', accessToken: 'test-access' }
  auth.refresh.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

it('accepts aggregate fields while discarding unexpected member data', () => {
  const parsed = parseAdminAnalytics(snapshot)
  expect(parsed.daily).toHaveLength(2)
  expect(parsed.daily[0]).toEqual({ date: '2026-10-27', activeUsers: 3, newUsers: 2, connections: 4, players: 1 })
  expect(JSON.stringify(parsed)).not.toContain('userId')
})

it.each([
  { ...snapshot, schemaVersion: 2 },
  { ...snapshot, dataAsOf: 'invalid' },
  { ...snapshot, daily: [{ ...snapshot.daily[0], date: '2026-02-30' }] },
  { ...snapshot, daily: [{ ...snapshot.daily[0], activeUsers: -1 }] },
  { ...snapshot, daily: [{ ...snapshot.daily[0], activeUsers: Number.MAX_SAFE_INTEGER + 1 }] },
  { ...snapshot, games: [snapshot.games[0], snapshot.games[0]] },
])('rejects malformed aggregate snapshots: %j', value => {
  expect(() => parseAdminAnalytics(value)).toThrow()
})

it('filters by Korean date and adds game counts across selected days without merging daily unique users', () => {
  const parsed = parseAdminAnalytics(snapshot)
  expect(periodRows(parsed.daily, '2026-10-28', '2026-10-28').map(row => row.activeUsers)).toEqual([2])
  expect(periodRows(parsed.daily, '2026-10-29', '2026-10-27')).toEqual([])
  expect(groupGames(periodRows(parsed.games, '2026-10-27', '2026-10-28'))).toEqual([
    { gameCode: 'OMOK', started: 3, ended: 2, completed: 2, forfeits: 1,
      participants: 4, durationSeconds: 900, timedGames: 2 },
  ])
  const firstDay = selectAnalyticsPeriod(parsed, '2026-10-27', '2026-10-27')
  expect(firstDay).toMatchObject({ newUsers: 2, connections: 4, gameStarts: 2,
    funnel: { onboarded: 2, channelJoined: 2, tableJoined: 1, gameStarted: 1, gameCompleted: 0 } })
  expect(firstDay.daily.map(row => row.activeUsers)).toEqual([3])
  const bothDays = selectAnalyticsPeriod(parsed, '2026-10-27', '2026-10-28')
  expect(bothDays.newUsers).toBe(2)
  expect(bothDays.connections).toBe(7)
  expect(bothDays.gameStarts).toBe(3)
  expect(bothDays.daily.map(row => row.activeUsers)).toEqual([3, 2])
  expect(kstDate(snapshot.dataAsOf)).toBe('2026-10-28')
  expect(shiftDate('2026-10-28', -6)).toBe('2026-10-22')
  expect(isStaleSnapshot(snapshot.dataAsOf, Date.parse(snapshot.dataAsOf) + 36 * 60 * 60 * 1000)).toBe(false)
  expect(isStaleSnapshot(snapshot.dataAsOf, Date.parse(snapshot.dataAsOf) + 36 * 60 * 60 * 1000 + 1)).toBe(true)
})

it('uses the admin GET with an Access token, without cookies or a request body', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(snapshot))
  vi.stubGlobal('fetch', fetcher)
  expect((await loadAdminAnalytics(new AbortController().signal)).daily).toHaveLength(2)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/analytics/summary', expect.objectContaining({
    method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer test-access' },
  }))
  expect(fetcher.mock.calls[0]![1].body).toBeUndefined()
})

it('retries one expired Access token after refresh', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json(snapshot))
  vi.stubGlobal('fetch', fetcher)
  auth.refresh.mockImplementation(async () => {
    auth.session = { status: 'AUTHENTICATED', accessToken: 'new-access' }
    return true
  })
  await loadAdminAnalytics(new AbortController().signal)
  expect(auth.refresh).toHaveBeenCalledWith(true)
  expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer new-access')
})

it.each([[403, 'forbidden'], [503, 'not_ready'], [404, 'not_ready'], [500, 'failed']] as const)(
  'distinguishes HTTP %i as %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status })))
    await expect(loadAdminAnalytics(new AbortController().signal)).rejects.toMatchObject({ kind })
    expect(auth.refresh).not.toHaveBeenCalled()
  },
)

it('rejects a response from an authentication session that changed while loading', async () => {
  let release!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
  const pending = loadAdminAnalytics(new AbortController().signal)
  auth.session = null
  release(Response.json(snapshot))
  await expect(pending).rejects.toThrow('취소')
})
