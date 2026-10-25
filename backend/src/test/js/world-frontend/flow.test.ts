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
const socketMessages: Envelope[][] = []
const sent: string[] = []
let runtime: ParkRuntime | undefined
let cookie = `ONTOP_REFRESH=${process.env.TEST_WORLD_REFRESH_TOKEN}`
let ticketRequests = 0

// Browser APIs are adapted to Node; HTTP/WS responses and tokens come from the real Spring server.
beforeEach(() => {
  clearAuthSession()
  resetWorld()
  incoming.length = sent.length = 0
  socketMessages.length = 0
  ticketRequests = 0
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
    if (path === '/api/v1/auth/websocket-ticket' && response.ok) ticketRequests++
    const renewed = response.headers.getSetCookie().find(c => c.startsWith('ONTOP_REFRESH='))
    if (renewed) cookie = renewed.split(';')[0]!
    return response
  })
  vi.stubGlobal('WebSocket', class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      const messages: Envelope[] = []
      socketMessages.push(messages)
      this.addEventListener('message', event => {
        const message = JSON.parse(String(event.data)) as Envelope
        messages.push(message)
        incoming.push(message)
      })
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
  it('projects actual server public profiles and bench leases through ParkRuntime', async () => {
    await peer(process.env.TEST_WORLD_OTHER_TOKEN!)
    expect(await restoreAuthSession(true)).toBe(true)
    const park = await enterPark()
    await vi.waitFor(() => expect(useSession.getState().roomId).toBe('channel-1'), { timeout: 8000 })
    await vi.waitFor(() => expect(incoming.some(m => m.type === 'WORLD_STATE'
      && (m.payload.avatars as { userId: string; nickname?: string; characterGender?: string }[])
        .some(a => a.userId === '202' && a.nickname === '검증회원202' && a.characterGender === 'FEMALE'))).toBe(true), { timeout: 8000 })
    expect(useSession.getState().account?.nickname).toBe('검증회원101')
    expect(avatars.get('101')?.nickname).toBe('검증회원101')
    expect(avatars.get('101')?.character).toBe('man')
    await vi.waitFor(() => {
      expect(avatars.get('202')).toMatchObject({ nickname: '검증회원202', character: 'girl' })
      expect(useSession.getState().profiles['202']).toEqual({ nickname: '검증회원202', character: 'girl' })
    }, { timeout: 8000 })
    const display = avatars.get('202')
    diagnostic('remote-profile', {
      serverProfileReceived: true,
      serverCharacterGender: 'FEMALE',
      frontendDisplayMatched: display?.nickname === '검증회원202' && display?.character === 'girl',
      frontendNickname: display?.nickname, frontendCharacter: display?.character,
    })
    await vi.waitFor(() => expect(useFacilityState.getState().ready).toBe(true), { timeout: 5000 })
    const lease = await park.useFacility('bench-0', 0, new AbortController().signal)
    expect(useSession.getState().benchId).toBe('bench-0')
    expect(avatars.get('101')?.benchId).toBe('bench-0')
    diagnostic('facility-runtime', { catalogReady: true, frontendBenchApplied: true,
      facilityCheckSentOnJoin: sent.includes('WORLD_FACILITY_CHECK'),
      services: { bench: benchService.mode, fitness: fitnessService.mode, telescope: telescopeService.mode } })
    await park.releaseFacility(lease.leaseId, new AbortController().signal)
    expect(useSession.getState().benchId).toBe('')
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
} else if (process.env.TEST_WORLD_PHASE === 'profile-refresh') {
  it('propagates committed nickname updates without movement, isolates channels and restores fresh profiles on reconnect', async () => {
    const observer = await peer(process.env.TEST_WORLD_OTHER_TOKEN!)
    expect(await restoreAuthSession(true)).toBe(true)
    const park = await enterPark()
    await vi.waitFor(() => {
      expect(useSession.getState().roomId).toBe('channel-1')
      expect(avatars.get('202')).toMatchObject({ nickname: '검증회원202', character: 'girl' })
    }, { timeout: 8000 })
    const originalBalance = useSession.getState().account?.balance
    // M14 조회 컴포넌트는 마운트하지 않는다. 미조회 null을 프로필 갱신이 덮지 않는지만 검사한다.
    expect(originalBalance).toBeNull()
    const ownMessages = socketMessages.find(messages => messages.some(m =>
      m.type === 'CONNECTED' && m.payload.userId === '101'))!
    expect(ownMessages).toBeDefined()

    await updateNickname(process.env.TEST_WORLD_ACCESS_TOKEN!, '새주인101')
    await updateNickname(process.env.TEST_WORLD_OTHER_TOKEN!, '새친구202')
    await vi.waitFor(() => {
      expect(avatars.get('101')?.nickname).toBe('새주인101')
      expect(avatars.get('202')).toMatchObject({ nickname: '새친구202', character: 'girl' })
      expect(useSession.getState().account).toEqual({ nickname: '새주인101', balance: originalBalance })
      expect(useSession.getState().profiles['202']).toEqual({ nickname: '새친구202', character: 'girl' })
    }, { timeout: 10000 })
    expect(sent).not.toContain('WORLD_MOVE')
    for (const message of incoming.filter(m => m.type === 'WORLD_STATE')) {
      for (const avatar of message.payload.avatars as Record<string, unknown>[]) {
        expect(Object.keys(avatar)).not.toContain('accessToken')
        expect(Object.keys(avatar)).not.toContain('providerUserId')
        expect(Object.keys(avatar)).not.toContain('loginProvider')
        expect(Object.keys(avatar)).not.toContain('refreshToken')
        expect(Object.keys(avatar)).not.toContain('email')
      }
    }

    await observer.client.request('CHANNEL_LEAVE', {}, ['CHANNEL_LEFT'])
    await vi.waitFor(() => {
      expect(avatars.has('202')).toBe(false)
      expect(useSession.getState().profiles['202']).toBeUndefined()
    })
    await observer.client.request('CHANNEL_JOIN', { channelId: 'channel-2' }, ['CHANNEL_STATE'])
    const beforeForeignUpdate = observer.messages.length
    const beforeForeignDelivery = ownMessages.length
    await updateNickname(process.env.TEST_WORLD_OTHER_TOKEN!, '다른채널202')
    await vi.waitFor(() => expect(observer.messages.slice(beforeForeignUpdate).some(m =>
      hasProfile(m, 'channel-2', '202', '다른채널202'))).toBe(true), { timeout: 10000 })
    // 같은 연결의 ACK까지 받아 앞서 큐에 들어간 메시지도 수신한 뒤 송신 격리를 검사한다.
    expect(await park.sendChat('격리확인')).toBe(true)
    const ownWorldUpdates = ownMessages.slice(beforeForeignDelivery).filter(m => m.type === 'WORLD_STATE')
    expect(ownWorldUpdates.every(m => m.payload.channelId === 'channel-1')).toBe(true)
    expect(ownWorldUpdates.some(m => (m.payload.avatars as { userId: string }[])
      .some(avatar => avatar.userId === '202'))).toBe(false)
    expect(useSession.getState().roomId).toBe('channel-1')
    expect(avatars.has('202')).toBe(false)
    expect(useSession.getState().profiles['202']).toBeUndefined()

    await observer.client.request('CHANNEL_LEAVE', {}, ['CHANNEL_LEFT'])
    await observer.client.request('CHANNEL_JOIN', { channelId: 'channel-1' }, ['CHANNEL_STATE'])
    await vi.waitFor(() => expect(avatars.get('202')).toMatchObject({
      nickname: '다른채널202', character: 'girl',
    }), { timeout: 8000 })

    const beforeDisconnect = observer.messages.length
    const beforeReconnectTickets = ticketRequests
    await park.stop()
    expect(useSession.getState().profiles).toEqual({})
    expect(avatars.size).toBe(0)
    await vi.waitFor(() => expect(observer.messages.slice(beforeDisconnect).some(m =>
      m.type === 'WORLD_STATE' && m.payload.channelId === 'channel-1'
        && !(m.payload.avatars as { userId: string }[]).some(a => a.userId === '101'))).toBe(true))
    await enterPark()
    await vi.waitFor(() => {
      expect(useSession.getState().status).toBe('connected')
      expect(useSession.getState().sessionId).toBe('101')
      expect(useSession.getState().roomId).toBe('channel-1')
      expect(avatars.get('101')?.nickname).toBe('새주인101')
      expect(avatars.get('202')).toMatchObject({ nickname: '다른채널202', character: 'girl' })
      expect(useSession.getState().account?.balance).toBe(originalBalance)
    }, { timeout: 8000 })
    expect(ticketRequests).toBe(beforeReconnectTickets + 1)
    diagnostic('public-profile-refresh', {
      initialDisplayMatched: true, committedRenameMappedWithoutMovement: true,
      unloadedWalletDisplayPreserved: true, foreignChannelTransportIsolated: true, departedProfileRemoved: true,
      channelReentryMapped: true, freshTicketReconnectMapped: true, publicFieldsOnly: true,
    })
  }, 45000)
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

async function updateNickname(token: string, nickname: string) {
  const response = await fetch('/api/v1/users/me', {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  })
  expect(response.status).toBe(200)
  expect((await response.json()).nickname).toBe(nickname)
}

async function enterPark() {
  const park = new ParkRuntime()
  runtime = park
  park.start()
  await vi.waitFor(() => expect(useSession.getState().sessionId).toBe('101'), { timeout: 8000 })
  expect(await park.selectChannel('channel-1')).toBe(true)
  return park
}

function hasProfile(message: Envelope, channelId: string, userId: string, nickname: string) {
  return message.type === 'WORLD_STATE' && message.payload.channelId === channelId
    && (message.payload.avatars as { userId: string; nickname: string }[])
      .some(avatar => avatar.userId === userId && avatar.nickname === nickname)
}
