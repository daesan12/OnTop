import { expect, it, vi } from 'vitest'
import { PublicGameWatcher, type WatchTarget } from '../../src/features/tableLobby/PublicGameWatcher'
import { createServerPublicMatchService } from '../../src/features/tableLobby/publicMatch'
import { tableState, tableSummary } from '../../src/network/protocol'
import type { Session } from '../../src/network/worldClient'

const a = { scope: 'owner/channel/table/bench', gameId: 'public-a' }, b = { ...a, gameId: 'public-b' }
const deferred = <T>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function setup() {
  const start = vi.fn<(t: WatchTarget) => Promise<void>>().mockResolvedValue(undefined)
  const stop = vi.fn<(t: WatchTarget) => Promise<void>>().mockResolvedValue(undefined)
  const hide = vi.fn(), status = vi.fn()
  return { start, stop, hide, status, watcher: new PublicGameWatcher({ start, stop, hide, status }) }
}
it('starts only once for identical pushes and unsubscribes before the next public ID', async () => {
  const s = setup(); expect(await s.watcher.set(a)).toBe(true)
  expect(await s.watcher.set(a)).toBe(true); expect(s.start).toHaveBeenCalledTimes(1)
  const release = deferred<void>(); s.stop.mockReturnValueOnce(release.promise)
  const changing = s.watcher.set(b)
  expect(s.hide).toHaveBeenCalledOnce(); expect(s.watcher.accepts(a.gameId)).toBe(false)
  expect(s.start).toHaveBeenCalledTimes(1); release.resolve(); expect(await changing).toBe(true)
  expect(s.stop).toHaveBeenCalledWith(a); expect(s.start).toHaveBeenLastCalledWith(b)
})
it('cancels a pending watch immediately and ignores its late approval', async () => {
  const s = setup(), pending = deferred<void>(); s.start.mockReturnValueOnce(pending.promise)
  const first = s.watcher.set(a), next = s.watcher.set(b)
  expect(s.stop).toHaveBeenCalledWith(a); expect(s.watcher.accepts(a.gameId)).toBe(false)
  expect(await next).toBe(true); pending.resolve(); expect(await first).toBe(false)
  expect(s.watcher.accepts(b.gameId)).toBe(true)
})
it('coalesces multiple public ID changes during cleanup to the newest ID', async () => {
  const s = setup(); await s.watcher.set(a)
  const release = deferred<void>(); s.stop.mockReturnValueOnce(release.promise)
  const first = s.watcher.set(b), last = s.watcher.set({ ...b, gameId: 'public-c' })
  release.resolve(); await Promise.all([first, last])
  expect(s.stop).toHaveBeenCalledTimes(1); expect(s.start.mock.calls.map(args => args[0].gameId)).toEqual(['public-a', 'public-c'])
})
it('null ends the subscription and does not resubscribe until another confirmed ID', async () => {
  const s = setup(); await s.watcher.set(a); await s.watcher.set(null); await s.watcher.set(null)
  expect(s.watcher.accepts(a.gameId)).toBe(false); expect(s.stop).toHaveBeenCalledTimes(1); expect(s.start).toHaveBeenCalledTimes(1)
  await s.watcher.set(b); expect(s.start).toHaveBeenCalledTimes(2)
})
it('does not retry a denied or timed out target on repeated pushes; explicit retry cleans up first', async () => {
  const s = setup(); s.start.mockRejectedValueOnce(new Error('denied'))
  expect(await s.watcher.set(a)).toBe(false); expect(await s.watcher.set(a)).toBe(false)
  expect(s.start).toHaveBeenCalledTimes(1); expect(s.watcher.accepts(a.gameId)).toBe(false)
  expect(await s.watcher.set(a, true)).toBe(true); expect(s.stop).toHaveBeenCalledOnce(); expect(s.start).toHaveBeenCalledTimes(2)
})
it('keeps cleanup failures blocked instead of starting a second server subscription', async () => {
  const s = setup(); await s.watcher.set(a); s.stop.mockRejectedValueOnce(new Error('timeout'))
  expect(await s.watcher.set(b)).toBe(false); expect(await s.watcher.set(b)).toBe(false)
  expect(s.start).toHaveBeenCalledTimes(1); expect(s.stop).toHaveBeenCalledTimes(1)
  expect(await s.watcher.set(b, true)).toBe(true); expect(s.start).toHaveBeenCalledTimes(2)
})
it('accepts explicit GAME_NOT_WATCHING cleanup confirmation', async () => {
  const s = setup(); await s.watcher.set(a); s.stop.mockRejectedValueOnce({ code: 'GAME_NOT_WATCHING' })
  expect(await s.watcher.set(b)).toBe(true)
})
it('revocation hides data and blocks repeated snapshots until the user retries', async () => {
  const s = setup(); await s.watcher.set(a); s.watcher.revoked('revoked')
  expect(await s.watcher.set(a)).toBe(false); expect(s.watcher.accepts(a.gameId)).toBe(false)
  expect(s.start).toHaveBeenCalledTimes(1); expect(await s.watcher.set(a, true)).toBe(true)
})
it('discarded connections cannot publish late status or suppress the next owner', async () => {
  const s = setup(), pending = deferred<void>(); s.start.mockReturnValueOnce(pending.promise)
  const first = s.watcher.set(a); s.watcher.reset(); s.status.mockClear()
  pending.reject(new Error('old connection')); expect(await first).toBe(false); expect(s.status).not.toHaveBeenCalled()
  expect(await s.watcher.set({ ...a, scope: 'new-owner/channel' })).toBe(true)
})
const table = { tableId: 't', version: 3, capacity: 2, minimumPlayers: 2, seats: [{ seatNumber: 1, userId: '101', ready: false }, { seatNumber: 2, userId: '102', ready: false }], allReady: false, selectorUserId: '101', gameCode: 'OMOK', targetScore: null, betAmountPerPlayer: 1 }
it('preserves approved table and list IDs, while missing/null are not playable references', () => {
  expect(tableState(table).gameId).toBeNull(); expect(tableState({ ...table, gameId: null }).gameId).toBeNull()
  expect(tableState({ ...table, gameId: a.gameId }).gameId).toBe(a.gameId)
  expect(tableSummary({ tableId: 't', capacity: 2, occupiedSeats: 2, availableSeats: 0, joinable: false, gameCode: 'OMOK', status: 'PLAYING', gameId: a.gameId }).gameId).toBe(a.gameId)
})
it.each(['', ' ', 'x'.repeat(121), 12, {}, []])('rejects malformed public IDs: %j', gameId => expect(() => tableState({ ...table, gameId })).toThrow())
it('uses the latest subscribed WS state, never a stale HTTP list or foreign table/channel', () => {
  const state: Pick<Session, 'status' | 'roomId' | 'watchedTableId' | 'tableStates'> = { status: 'connected', roomId: 'c', watchedTableId: 't', tableStates: { t: { ...table, gameId: a.gameId } } }
  const service = createServerPublicMatchService(() => state)
  expect(service.find({ channelId: 'c', tableId: 't' })?.gameId).toBe(a.gameId)
  expect(service.find({ channelId: 'other', tableId: 't' })).toBeNull()
  expect(service.find({ channelId: 'c', tableId: 'other' })).toBeNull()
  state.tableStates.t = { ...table, gameId: null }; expect(service.find({ channelId: 'c', tableId: 't' })).toBeNull()
  state.tableStates.t = { ...table, gameId: b.gameId }; state.watchedTableId = ''
  expect(service.find({ channelId: 'c', tableId: 't' })).toBeNull()
})
