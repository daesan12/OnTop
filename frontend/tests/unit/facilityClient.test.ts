import { afterEach, expect, it, vi } from 'vitest'
import { FacilityClient } from '../../src/network/facilityClient'
import { parseFacilitySnapshot } from '../../src/features/facilities/protocol'
import { facilityMovementBlocked, resetFacilities, useFacilityState } from '../../src/features/facilities/state'
import type { FacilityLease } from '../../src/features/facilities/protocol'
import type { Envelope } from '../../src/network/protocol'
import { parseEnvelope } from '../../src/network/protocol'
import { facilityCatalog, facilityPage } from '../fixtures/facilityCatalog'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

function harness() {
  let client: FacilityClient, scope = { generation: 1, channelId: 'a', userId: '101', connected: true }
  let version = 0, worldVersion = 0, id = 0
  let leases: FacilityLease[] = []
  let reject = '', omitWorld = false, timeoutUse = false, timeoutRelease = false
  const applied = vi.fn(), blocked = vi.fn(), sent: { type: string; payload: Record<string, unknown>; id: string }[] = []
  const snapshot = (requestId: string | null = null, changes = {}): Envelope => ({ type: 'WORLD_FACILITY_STATE', requestId,
    payload: { channelId: scope.channelId, version, mapVersion: EXPECTED_MAP_VERSION, occupancies: structuredClone(leases), ...changes } })
  const world = () => client.world({ channelId: scope.channelId, version: ++worldVersion,
    mapVersion: EXPECTED_MAP_VERSION, avatars: [{ userId: scope.userId, position: {} }] })
  client = new FacilityClient({ scope: () => scope, apply: applied, blockMovement: blocked,
    async request(type, payload, _expected, onId) {
      const requestId = 'facility-' + ++id; onId(requestId); sent.push({ type, payload, id: requestId })
      if (type === 'WORLD_FACILITY_CATALOG') return { type, requestId, payload: facilityPage(Number(payload.offset ?? 0)) }
      if (type === 'WORLD_FACILITY_CHECK') return snapshot(requestId)
      if (reject) { const code = reject; reject = ''; throw Object.assign(new Error(code), { code }) }
      if (type === 'WORLD_FACILITY_USE') {
        const d = facilityCatalog.facilities.find(d => d.facilityId === payload.facilityId)!
        const lease: FacilityLease = { leaseId: 'lease-' + id, channelId: scope.channelId, userId: scope.userId,
          facilityId: d.facilityId, kind: d.kind, seatIndex: Number(payload.seatIndex),
          startedAt: '2026-10-25T00:00:00Z', pose: d.seats[Number(payload.seatIndex)]!, exit: d.exit,
          yaw: d.seats[Number(payload.seatIndex)]!.yaw, pitch: d.kind === 'TELESCOPE' ? facilityCatalog.initialPitch : 0, lastAimSeq: 0 }
        leases = [lease]; version++
      }
      if (type === 'WORLD_FACILITY_RELEASE') { leases = []; version++ }
      if (type === 'WORLD_FACILITY_AIM') { leases = leases.map(l => ({ ...l, yaw: Number(payload.yaw), pitch: Number(payload.pitch), lastAimSeq: Number(payload.seq) })); version++ }
      const response = snapshot(requestId)
      const timeout = (timeoutUse && type === 'WORLD_FACILITY_USE') || (timeoutRelease && type === 'WORLD_FACILITY_RELEASE')
      if (!timeout) client.accept(response) // Like SharedSocket: state handler runs before the request promise resolves.
      if (!omitWorld && type !== 'WORLD_FACILITY_AIM') world()
      if (timeout) throw new Error('응답 시간이 초과되었습니다.')
      return response
    },
  })
  return { client, sent, applied, blocked, world, snapshot, signal: new AbortController().signal,
    reject: (code: string) => { reject = code }, omitWorld: (value = true) => { omitWorld = value },
    timeoutUse: () => { timeoutUse = true }, timeoutRelease: () => { timeoutRelease = true },
    scope: (next: Partial<typeof scope>) => { scope = { ...scope, ...next } },
    leases: () => leases, remote: (next: FacilityLease[], v = ++version) => { leases = next; version = v; client.accept(snapshot()) },
  }
}
afterEach(() => { resetFacilities(); vi.useRealTimers() })

it('accepts a full 174-seat wire snapshot without raising limits for existing messages', () => {
  let userId = 100
  const occupancies = facilityCatalog.facilities.flatMap(d => d.seats.map((pose, seatIndex) => ({
    leaseId: `1cc2849b-1556-41c7-b44e-${String(++userId).padStart(12, '0')}`, userId: String(userId),
    channelId: 'channel-1', facilityId: d.facilityId, kind: d.kind, seatIndex,
    startedAt: '2026-10-25T00:00:00.123456789Z', pose, exit: d.exit, yaw: pose.yaw, pitch: 0, lastAimSeq: 0,
  })))
  const encoded = JSON.stringify({ type: 'WORLD_FACILITY_STATE', requestId: null,
    payload: { channelId: 'channel-1', version: 174, mapVersion: EXPECTED_MAP_VERSION, occupancies } })
  expect(encoded.length).toBeGreaterThan(65_536)
  expect(parseFacilitySnapshot(parseEnvelope(encoded).payload).occupancies).toHaveLength(174)
  expect(() => parseEnvelope(encoded.replace('WORLD_FACILITY_STATE', 'WORLD_STATE'))).toThrow()
  expect(() => parseEnvelope(JSON.stringify({ type: 'WORLD_FACILITY_STATE', requestId: null, payload: { padding: 'x'.repeat(262_144) } }))).toThrow()
})

it('loads every real catalog page before CHECK and sends only the documented fields', async () => {
  const h = harness(); await h.client.begin()
  expect(Object.keys(useFacilityState.getState().catalog)).toHaveLength(94)
  expect(h.sent.map(s => s.type)).toEqual([...Array(10).fill('WORLD_FACILITY_CATALOG'), 'WORLD_FACILITY_CHECK'])
  expect(h.sent.slice(0, 10).map(s => s.payload)).toEqual([{}, ...Array.from({ length: 9 }, (_, i) => ({ offset: (i + 1) * 10 }))])
  const lease = await h.client.use('bench-0', 1, h.signal)
  expect(h.sent.at(-1)?.payload).toEqual({ facilityId: 'bench-0', seatIndex: 1 })
  expect(lease.startedAt).toBe('2026-10-25T00:00:00Z')
  await h.client.release(lease.leaseId, h.signal)
  expect(h.sent.at(-1)?.payload).toEqual({ leaseId: lease.leaseId })
  expect(useFacilityState.getState()).toMatchObject({ ready: true, pending: false, awaitingWorld: false, occupancies: {} })
})

it('routes facility errors away from global chat/table errors even after the old scope retires', async () => {
  const h = harness(); await h.client.begin()
  const requestId = h.sent.at(-1)!.id
  h.client.reset()
  expect(h.client.ownsError({ type: 'ERROR', requestId, payload: { code: 'NOT_IN_CHANNEL' } })).toBe(true)
  expect(h.client.ownsError({ type: 'ERROR', requestId: 'other-command', payload: {} })).toBe(false)
  expect(h.client.ownsError({ type: 'ERROR', requestId: null, payload: {} })).toBe(false)
})

it('does not finish release or permit movement until the following authoritative WORLD_STATE', async () => {
  const h = harness(); await h.client.begin()
  const lease = await h.client.use('bench-0', 0, h.signal)
  h.omitWorld()
  let finished = false
  const release = h.client.release(lease.leaseId, h.signal).then(() => { finished = true })
  await vi.waitFor(() => expect(useFacilityState.getState().awaitingWorld).toBe(true))
  expect(useFacilityState.getState().occupancies).toEqual({})
  expect(facilityMovementBlocked('101')).toBe(true); expect(finished).toBe(false)
  h.client.world({ channelId: 'other', version: 500, mapVersion: EXPECTED_MAP_VERSION, avatars: [{ userId: '101' }] })
  expect(finished).toBe(false)
  h.world(); await release
  expect(facilityMovementBlocked('101')).toBe(false)
})

it('keeps the current lease on EXIT_BLOCKED and permits an explicit retry', async () => {
  const h = harness(); await h.client.begin(); const lease = await h.client.use('bench-0', 0, h.signal)
  h.reject('FACILITY_EXIT_BLOCKED')
  await expect(h.client.release(lease.leaseId, h.signal)).rejects.toMatchObject({ code: 'FACILITY_EXIT_BLOCKED' })
  expect(useFacilityState.getState().occupancies['101']?.leaseId).toBe(lease.leaseId)
  expect(facilityMovementBlocked('101')).toBe(true)
  await h.client.release(lease.leaseId, h.signal)
  expect(facilityMovementBlocked('101')).toBe(false)
})

it('rechecks rejected competing USE and never creates a local lease or replays the request', async () => {
  const h = harness(); await h.client.begin(); h.reject('FACILITY_OCCUPIED')
  await expect(h.client.use('bench-0', 0, h.signal)).rejects.toMatchObject({ code: 'FACILITY_OCCUPIED' })
  expect(h.sent.at(-1)?.type).toBe('WORLD_FACILITY_CHECK')
  expect(h.sent.filter(s => s.type === 'WORLD_FACILITY_USE')).toHaveLength(1)
  expect(useFacilityState.getState().occupancies).toEqual({})
  expect(facilityMovementBlocked('101')).toBe(false)
})

it('reconciles a timed-out USE without inventing success or losing the actual server lease', async () => {
  const h = harness(); await h.client.begin(); h.timeoutUse()
  await expect(h.client.use('bench-0', 0, h.signal)).rejects.toThrow('초과')
  expect(h.sent.at(-1)?.type).toBe('WORLD_FACILITY_CHECK')
  expect(useFacilityState.getState().occupancies['101']?.facilityId).toBe('bench-0')
  expect(facilityMovementBlocked('101')).toBe(true)
})

it('reconciles a lost release reply and remains locked if the approved position was also lost', async () => {
  const h = harness(); await h.client.begin(); const lease = await h.client.use('bench-0', 0, h.signal)
  h.timeoutRelease(); h.omitWorld()
  await expect(h.client.release(lease.leaseId, h.signal)).rejects.toThrow('초과')
  expect(useFacilityState.getState().occupancies).toEqual({})
  expect(facilityMovementBlocked('101')).toBe(true)
  h.world(); expect(facilityMovementBlocked('101')).toBe(false)
})

it('applies full occupancy broadcasts, ignores stale versions, foreign channels and unknown response ids', async () => {
  const h = harness(); await h.client.begin(); const own = await h.client.use('bench-0', 0, h.signal)
  const remote = { ...own, leaseId: 'remote', userId: '102', seatIndex: 1 }
  h.remote([own, remote], 10)
  expect(Object.keys(useFacilityState.getState().occupancies)).toEqual(['101', '102'])
  for (const message of [h.snapshot(null, { version: 9, occupancies: [] }), h.snapshot(null, { channelId: 'other', version: 100, occupancies: [] }), h.snapshot('old-connection-id', { version: 100, occupancies: [] })]) h.client.accept(message)
  expect(Object.keys(useFacilityState.getState().occupancies)).toHaveLength(2)
  h.remote([], 11); expect(useFacilityState.getState().occupancies).toEqual({})
})

it('clears ownership on reconnect and re-queries instead of replaying USE', async () => {
  const h = harness(); await h.client.begin(); await h.client.use('bench-0', 0, h.signal)
  h.client.reset(); h.scope({ generation: 2 }); h.remote([])
  const before = h.sent.length; await h.client.begin()
  expect(h.sent.slice(before).some(s => s.type === 'WORLD_FACILITY_USE')).toBe(false)
  expect(h.sent.at(-1)?.type).toBe('WORLD_FACILITY_CHECK')
  expect(useFacilityState.getState().occupancies).toEqual({})
})

it('rejects a delayed previous-channel catalog before touching the new channel', async () => {
  const h = harness()
  const pending = h.client.begin()
  h.scope({ channelId: 'b' }); h.client.reset()
  await expect(pending).rejects.toThrow('채널')
  await h.client.begin()
  expect(useFacilityState.getState()).toMatchObject({ channelId: 'b', ready: true })
})

it('normalizes telescope directions, enforces the catalog interval, increments seq and resets per lease', async () => {
  vi.useFakeTimers()
  const h = harness(); await h.client.begin(); const lease = await h.client.use('telescope-1', 0, h.signal)
  expect(await h.client.aim(lease.leaseId, { yaw: 5 * Math.PI, pitch: 20 }, h.signal)).toMatchObject({ pitch: facilityCatalog.maxPitch })
  expect(h.sent.at(-1)?.payload).toMatchObject({ leaseId: lease.leaseId, seq: 1, pitch: facilityCatalog.maxPitch })
  expect(h.sent.at(-1)?.payload.yaw).toBeCloseTo(Math.PI)
  const count = h.sent.filter(s => s.type === 'WORLD_FACILITY_AIM').length
  await expect(h.client.aim(lease.leaseId, { yaw: .4, pitch: .1 }, h.signal)).rejects.toThrow('간격')
  expect(h.sent.filter(s => s.type === 'WORLD_FACILITY_AIM')).toHaveLength(count)
  await vi.advanceTimersByTimeAsync(100)
  await h.client.aim(lease.leaseId, { yaw: .4, pitch: .1 }, h.signal)
  expect(h.sent.at(-1)?.payload.seq).toBe(2)
  await h.client.release(lease.leaseId, h.signal)
  const next = await h.client.use('telescope-1', 0, h.signal)
  await h.client.aim(next.leaseId, { yaw: .4, pitch: .1 }, h.signal)
  expect(h.sent.at(-1)?.payload.seq).toBe(1)
})

it('fails closed on a mismatched map, duplicate seats or malformed server timestamps', async () => {
  const h = harness(); await h.client.begin(); const own = await h.client.use('bench-0', 0, h.signal)
  const payload = h.snapshot().payload
  for (const changes of [{ mapVersion: 'different' }, { occupancies: [own, { ...own, userId: '102', leaseId: 'second' }] },
    { occupancies: [{ ...own, startedAt: 'invalid' }] }]) expect(() => parseFacilitySnapshot({ ...payload, ...changes })).toThrow()
  expect(h.client.accept(h.snapshot(null, { mapVersion: 'different' }))).toBe(false)
  expect(useFacilityState.getState()).toMatchObject({ ready: false, uncertain: true })
  expect(facilityMovementBlocked('101')).toBe(true)
})
