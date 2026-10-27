import { beforeEach, expect, it, vi } from 'vitest'
import { activeHostWait, bindHostStartWait, formatHostWait, hostWaitSeconds, resetHostStartWait, useHostStartWait } from '../../src/features/tableLobby/hostStartWait'
import type { TableState } from '../../src/network/protocol'

const scope = { userId: 'a', channelId: 'park', tableId: 't' }
const table: TableState = { tableId: 't', version: 5, gameCode: 'ONE_CARD', targetScore: null, betAmountPerPlayer: 20,
  capacity: 4, minimumPlayers: 2, selectorUserId: 'a', allReady: true,
  seats: [{ seatNumber: 1, userId: 'a', ready: true }, { seatNumber: 2, userId: 'b', ready: true }] }
const snapshot = { revision: 1, tableVersion: 5, hostUserId: 'a', serverNow: 1900000000000, expiresAt: 1900000120000 }
beforeEach(() => { resetHostStartWait(); vi.spyOn(performance, 'now').mockReturnValue(1000) })
it('uses the server clock plus monotonic elapsed time, independent of the client wall clock', () => {
  const feed = bindHostStartWait(scope); feed.update(snapshot)
  const accepted = useHostStartWait.getState().snapshot
  expect(hostWaitSeconds(accepted, 1000)).toBe(120)
  expect(hostWaitSeconds(accepted, 1210)).toBe(120)
  expect(hostWaitSeconds(accepted, 61500)).toBe(60)
  expect(hostWaitSeconds(accepted, 121000)).toBe(0)
  expect(hostWaitSeconds(accepted, 300000)).toBe(0)
  expect(formatHostWait(120)).toBe('2:00'); expect(formatHostWait(9)).toBe('0:09')
})
it('ignores duplicate and older snapshots rather than restarting the countdown', () => {
  const feed = bindHostStartWait(scope); expect(feed.update(snapshot)).toBe(true)
  vi.spyOn(performance, 'now').mockReturnValue(31000)
  expect(feed.update(snapshot)).toBe(false)
  expect(feed.update({ ...snapshot, revision: 0 })).toBe(false)
  expect(hostWaitSeconds(useHostStartWait.getState().snapshot)).toBe(90)
  expect(feed.update({ ...snapshot, revision: 2, expiresAt: null })).toBe(true)
  expect(hostWaitSeconds(useHostStartWait.getState().snapshot)).toBeNull()
  expect(feed.update(snapshot)).toBe(false)
})
it('rejects malformed timestamps and stale bindings, including after world reset', () => {
  const first = bindHostStartWait(scope)
  expect(first.update({ ...snapshot, serverNow: Number.NaN })).toBe(false)
  expect(first.update({ ...snapshot, expiresAt: -1 })).toBe(false)
  const second = bindHostStartWait({ ...scope, tableId: 'other' })
  expect(first.update(snapshot)).toBe(false); first.dispose()
  expect(second.update(snapshot)).toBe(true)
  resetHostStartWait(); expect(second.update({ ...snapshot, revision: 2 })).toBe(false)
})
it('only displays a matching waiting table with the exact selected attendance and all ready', () => {
  bindHostStartWait(scope).update(snapshot)
  const active = (t = table, own = 'a', channel = 'park', count: number | null = 2, connected = true, phase = 'WAITING') =>
    activeHostWait(useHostStartWait.getState(), t, own, channel, count, connected, phase)
  expect(active()).not.toBeNull()
  expect(active({ ...table, version: 6 })).toBeNull()
  expect(active({ ...table, selectorUserId: 'b' })).toBeNull()
  expect(active({ ...table, allReady: false })).toBeNull()
  expect(active({ ...table, seats: table.seats.map(s => ({ ...s, ready: false })) })).toBeNull()
  expect(active(table, 'other')).toBeNull(); expect(active(table, 'a', 'other')).toBeNull()
  expect(active(table, 'a', 'park', 3)).toBeNull(); expect(active(table, 'a', 'park', null)).toBeNull()
  expect(active(table, 'a', 'park', 2, false)).toBeNull()
  for (const phase of ['STARTING', 'CONFIRMED', 'PLAYING', 'SETTLING']) expect(active(table, 'a', 'park', 2, true, phase)).toBeNull()
})
it('deduplicates timeout receipts and never chooses a new host or mutates seats locally', () => {
  const feed = bindHostStartWait(scope)
  const receipt = { eventId: 'timeout-1', revision: 2, tableVersion: 6, previousHostUserId: 'a', nextHostUserId: 'b' }
  expect(feed.timeout(receipt)).toBe(true)
  useHostStartWait.setState({ dismissedEventId: receipt.eventId })
  expect(feed.timeout(receipt)).toBe(false)
  expect(feed.timeout({ ...receipt, revision: 1, eventId: 'late' })).toBe(false)
  expect(feed.timeout({ ...receipt, revision: 3, eventId: 'invalid', nextHostUserId: 'a' })).toBe(false)
  expect(table.selectorUserId).toBe('a'); expect(table.seats).toHaveLength(2)
  expect(useHostStartWait.getState().dismissedEventId).toBe('timeout-1')
  expect(feed.update(snapshot)).toBe(false)
  expect(feed.update({ ...snapshot, revision: 3 })).toBe(true)
  expect(feed.timeout({ ...receipt, eventId: 'late-other', revision: 2 })).toBe(false)
})
