import { appendFileSync, readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../../../../frontend/src/auth/authFlow'
import { ParkRuntime } from '../../../../../frontend/src/park/runtime/SpringParkRuntime'
import { SharedSocket } from '../../../../../frontend/src/network/socketClient'
import { avatars, receive, resetWorld, useSession } from '../../../../../frontend/src/network/worldClient'
import { type Envelope } from '../../../../../frontend/src/network/protocol'
import { benchService } from '../../../../../frontend/src/features/interactions/benchService'
import { fitnessService } from '../../../../../frontend/src/features/fitness/service'
import { telescopeService } from '../../../../../frontend/src/features/telescopes/service'
import { useFacilityState } from '../../../../../frontend/src/features/facilities/state'

// Select the built-app branch before importing facility services, rather than Vitest's DEV default.
vi.hoisted(() => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('PROD', true)
  vi.stubEnv('MODE', 'production')
})
afterAll(() => vi.unstubAllEnvs())

const base = process.env.TEST_WORLD_API_BASE_URL ?? ''
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('A loopback test server is required')
const realFetch = globalThis.fetch
const NativeWebSocket = globalThis.WebSocket
const connections: SharedSocket[] = []
const incoming: Envelope[] = []
const sent: string[] = []
let runtime: ParkRuntime | undefined
let cookie = `ONTOP_REFRESH=${process.env.TEST_WORLD_REFRESH_TOKEN}`

// Browser APIs are adapted to Node; HTTP/WS responses and tokens come from the real Spring server.
beforeEach(() => {
  clearAuthSession()
  resetWorld()
  incoming.length = sent.length = 0
  vi.stubGlobal('window', { location: new URL(base + '/park') })
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    if (path === '/park-bindings.json') {
      return new Response(readFileSync(new URL('../../../../../frontend/public/park-bindings.json', import.meta.url)))
    }
    if (!path.startsWith('/api/v1/')) throw new Error('Unexpected request path')
    const headers = new Headers(init.headers)
    // Node's native WebSocket has no browser Origin header. Bind tickets consistently to null here.
    // Browser-origin/CORS compatibility is outside this Node adapter test, not disabled on the server.
    if (path !== '/api/v1/auth/websocket-ticket') headers.set('Origin', 'https://dev.on-top.world')
    if (path === '/api/v1/auth/refresh') headers.set('Cookie', cookie)
    const response = await realFetch(base + path, { ...init, headers, redirect: 'error' })
    const renewed = response.headers.getSetCookie().find(c => c.startsWith('ONTOP_REFRESH='))
    if (renewed) cookie = renewed.split(';')[0]!
    return response
  })
  vi.stubGlobal('WebSocket', class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      this.addEventListener('message', event => incoming.push(JSON.parse(String(event.data))))
    }
    override send(data: string) { sent.push(JSON.parse(data).type); super.send(data) }
  })
})

afterEach(async () => {
  await runtime?.stop()
  runtime = undefined
  await Promise.all(connections.splice(0).map(c => c.disconnect()))
  clearAuthSession()
  resetWorld()
  vi.unstubAllGlobals()
})

async function peer(token: string, apply = false) {
  const messages: Envelope[] = []
  const client = new SharedSocket({
    ticket: async signal => {
      const response = await fetch('/api/v1/auth/websocket-ticket', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Actual ticket issuance failed: ' + response.status)
      return (await response.json()).ticket
    },
    socket: ticket => {
      const url = new URL(base.replace('http:', 'ws:') + '/ws/tables')
      url.searchParams.set('ticket', ticket)
      return new WebSocket(url)
    },
    message: message => { messages.push(message); if (apply) receive(message) },
    closed: () => {}, error: message => { throw new Error(message) },
  })
  connections.push(client)
  await client.connect()
  await vi.waitFor(() => expect(messages.some(m => m.type === 'CONNECTED')).toBe(true), { timeout: 5000 })
  await client.request('CHANNEL_JOIN', { channelId: 'channel-1' }, ['CHANNEL_STATE'])
  return { client, messages }
}
const request = (client: SharedSocket, type: string, payload = {}) => client.request(type, payload, [
  type === 'WORLD_FACILITY_CATALOG' ? type : 'WORLD_FACILITY_STATE',
])
const leases = (message: Envelope) => message.payload.occupancies as { leaseId: string; userId: string; facilityId: string; lastAimSeq: number }[]
async function check(client: SharedSocket) { return leases(await request(client, 'WORLD_FACILITY_CHECK')) }
function diagnostic(name: string, data: object) {
  // Vitest reporters can suppress successful-test console output; keep only sanitized observations.
  appendFileSync(process.env.TEST_WORLD_DIAGNOSTICS_FILE!, JSON.stringify({ name, ...data }) + '\n')
}

if (process.env.TEST_WORLD_PHASE === 'profile-bench') {
  it('runs the actual ParkRuntime login/profile/socket path and diagnoses remote display reception', async () => {
    await peer(process.env.TEST_WORLD_OTHER_TOKEN!)
    expect(await restoreAuthSession(true)).toBe(true)
    runtime = new ParkRuntime()
    runtime.start()
    await vi.waitFor(() => expect(useSession.getState().roomId).toBe('channel-1'), { timeout: 8000 })
    await vi.waitFor(() => expect(incoming.some(m => m.type === 'WORLD_STATE'
      && (m.payload.avatars as { userId: string; nickname?: string; characterGender?: string }[])
        .some(a => a.userId === '202' && a.nickname === '검증회원202' && a.characterGender === 'FEMALE'))).toBe(true), { timeout: 8000 })
    expect(useSession.getState().account?.nickname).toBe('검증회원101')
    expect(avatars.get('101')?.nickname).toBe('검증회원101')
    expect(avatars.get('101')?.character).toBe('man')
    const display = avatars.get('202')
    diagnostic('remote-profile', {
      serverProfileReceived: true,
      serverCharacterGender: 'FEMALE',
      frontendDisplayMatched: display?.nickname === '검증회원202' && display?.character === 'girl',
      frontendNickname: display?.nickname, frontendCharacter: display?.character,
    })
    await vi.waitFor(() => expect(useFacilityState.getState().ready).toBe(true), { timeout: 5000 })
    const lease = await runtime.useFacility('bench-0', 0, new AbortController().signal)
    expect(useSession.getState().benchId).toBe('bench-0')
    expect(avatars.get('101')?.benchId).toBe('bench-0')
    diagnostic('facility-runtime', { catalogReady: true, frontendBenchApplied: true,
      facilityCheckSentOnJoin: sent.includes('WORLD_FACILITY_CHECK'),
      services: { bench: benchService.mode, fitness: fitnessService.mode, telescope: telescopeService.mode } })
    await runtime.releaseFacility(lease.leaseId, new AbortController().signal)
    expect(useSession.getState().benchId).toBe('')
    // Profile reception remains diagnostic; facility application above is asserted through real ParkRuntime.
  })

  it('uses actual FE SharedSocket for bench occupancy, conflict, release and reconnect', async () => {
    const observer = await peer(process.env.TEST_WORLD_OTHER_TOKEN!)
    const owner = await peer(process.env.TEST_WORLD_ACCESS_TOKEN!, true)
    let total = 0, offset = 0
    do {
      const catalog = await request(owner.client, 'WORLD_FACILITY_CATALOG', { offset })
      const rows = catalog.payload.facilities as object[]
      total += rows.length
      offset = Number(catalog.payload.nextOffset)
    } while (offset >= 0)
    expect(total).toBe(94)
    expect(await check(owner.client)).toHaveLength(0)
    const used = await request(owner.client, 'WORLD_FACILITY_USE', { facilityId: 'bench-0', seatIndex: 0 })
    const firstLease = leases(used)[0]!.leaseId
    expect(leases(used)[0]).toMatchObject({ userId: '101', facilityId: 'bench-0' })
    await vi.waitFor(() => expect(observer.messages.some(m => m.type === 'WORLD_FACILITY_STATE' && leases(m).some(l => l.leaseId === firstLease))).toBe(true))
    await expect(request(observer.client, 'WORLD_FACILITY_USE', { facilityId: 'bench-0', seatIndex: 0 })).rejects.toMatchObject({ code: 'FACILITY_OCCUPIED' })
    expect(leases(await request(observer.client, 'WORLD_FACILITY_USE', { facilityId: 'bench-0', seatIndex: 1 }))).toHaveLength(2)
    diagnostic('shared-socket-facility', { serverOccupancyReceived: true,
      developmentMode: import.meta.env.DEV,
      services: { bench: benchService.mode, fitness: fitnessService.mode, telescope: telescopeService.mode } })
    await request(owner.client, 'WORLD_FACILITY_RELEASE', { leaseId: firstLease })
    const observerLease = (await check(observer.client))[0]!.leaseId
    await request(observer.client, 'WORLD_FACILITY_RELEASE', { leaseId: observerLease })
    const occupiedAgain = await request(owner.client, 'WORLD_FACILITY_USE', { facilityId: 'bench-0', seatIndex: 0 })
    const stale = leases(occupiedAgain)[0]!.leaseId
    await owner.client.disconnect()
    await vi.waitFor(async () => expect(await check(observer.client)).toHaveLength(0), { timeout: 5000 })
    resetWorld()
    const restored = await peer(process.env.TEST_WORLD_ACCESS_TOKEN!, true)
    expect(await check(restored.client)).toHaveLength(0)
    await expect(request(restored.client, 'WORLD_FACILITY_RELEASE', { leaseId: stale })).rejects.toMatchObject({ code: 'FACILITY_LEASE_MISMATCH' })
    const next = await request(restored.client, 'WORLD_FACILITY_USE', { facilityId: 'bench-0', seatIndex: 0 })
    expect(leases(next)[0]!.leaseId).not.toBe(stale)
    await request(restored.client, 'WORLD_FACILITY_RELEASE', { leaseId: leases(next)[0]!.leaseId })
  })
} else if (process.env.TEST_WORLD_PHASE === 'fitness' || process.env.TEST_WORLD_PHASE === 'telescope') {
  const telescope = process.env.TEST_WORLD_PHASE === 'telescope'
  it(`uses actual FE SharedSocket for ${telescope ? 'telescope aim' : 'fitness'} ownership and cleanup`, async () => {
    const observer = await peer(process.env.TEST_WORLD_OTHER_TOKEN!)
    const owner = await peer(process.env.TEST_WORLD_ACCESS_TOKEN!)
    const facilityId = telescope ? 'telescope-1' : 'walker-1'
    const used = await request(owner.client, 'WORLD_FACILITY_USE', { facilityId, seatIndex: 0 })
    const leaseId = leases(used)[0]!.leaseId
    expect(leases(used)[0]!.facilityId).toBe(facilityId)
    await expect(request(observer.client, 'WORLD_FACILITY_USE', { facilityId, seatIndex: 0 })).rejects.toMatchObject({ code: 'FACILITY_OCCUPIED' })
    if (telescope) {
      const aimed = await request(owner.client, 'WORLD_FACILITY_AIM', { leaseId, seq: 1, yaw: .5, pitch: -.2 })
      expect(leases(aimed)[0]).toMatchObject({ lastAimSeq: 1, yaw: .5, pitch: -.2 })
      await expect(request(observer.client, 'WORLD_FACILITY_AIM', { leaseId, seq: 2, yaw: 0, pitch: 0 })).rejects.toMatchObject({ code: 'FACILITY_LEASE_MISMATCH' })
    }
    await owner.client.disconnect()
    await vi.waitFor(async () => expect(await check(observer.client)).toHaveLength(0), { timeout: 5000 })
  })
} else { throw new Error('Unknown world integration phase') }
