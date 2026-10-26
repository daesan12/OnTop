import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { ParkRuntime } from '../../src/park/runtime/runtime'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

import { useFitnessState } from '../../src/features/fitness/state'
import { FITNESS_STATIONS } from '../../src/config'
import { fitnessAnchors } from '../../src/features/fitness/anchors'

const sockets: MovementSocket[] = []
class MovementSocket implements SocketLike {
  requests: { requestId: string; type: string; payload: Record<string, unknown> }[] = []
  readyState = 0
  onopen: SocketLike['onopen'] = null
  onclose: SocketLike['onclose'] = null
  onmessage: SocketLike['onmessage'] = null
  onerror: SocketLike['onerror'] = null
  constructor() {
    sockets.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.(new Event('open'))
      this.emit('CONNECTED', { userId: '101' })
    })
  }
  emit(type: string, payload: object, requestId: string | null = null) {
    this.onmessage?.({ data: JSON.stringify({ type, payload, requestId }) } as MessageEvent)
  }
  send(data: string) {
    const request = JSON.parse(data)
    this.requests.push(request)
    if (request.type === 'CHANNEL_JOIN') queueMicrotask(() => this.emit('CHANNEL_STATE', {
      channelId: 'channel-1', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'],
    }, request.requestId))
    if (request.type === 'WORLD_MOVE') queueMicrotask(() => this.emit('WORLD_STATE', {
      channelId: 'channel-1', version: ++version, mapVersion: EXPECTED_MAP_VERSION,
      avatars: [{ userId: '101', position: { ...position, lastInputSeq: request.payload.seq } }],
    }, request.requestId))
  }
  close(code = 1000) {
    this.readyState = 3
    queueMicrotask(() => this.onclose?.({ code } as CloseEvent))
  }
}

let runtime: ParkRuntime
let socket: MovementSocket
let version: number
const position = { x: 0, y: 0.8, z: 34, yaw: 0, moving: false, running: false, swimming: false, lastInputSeq: 0 }
const json = (body: unknown) => new Response(JSON.stringify(body))
const moves = () => socket.requests.filter(request => request.type === 'WORLD_MOVE')
function world(mapVersion = EXPECTED_MAP_VERSION, present = true) {
  socket.emit('WORLD_STATE', { channelId: 'channel-1', version: ++version, mapVersion,
    avatars: present ? [{ userId: '101', position }] : [] })
}

beforeEach(async () => {
  clearAuthSession()
  resetWorld()
  sockets.length = version = 0
  vi.stubGlobal('window', { location: { href: 'http://localhost:5198/park' } })
  vi.stubGlobal('WebSocket', MovementSocket)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/v1/auth/refresh') return json({ accessToken: 'fixture-access' })
    if (url === '/park-bindings.json') return json({ bindings: [] })
    if (url === '/api/v1/channels') return json({ items: [{ channelId: 'channel-1', name: '공원', currentUsers: 0, capacity: 4, joinable: true }] })
    if (url === '/api/v1/users/me') return json({ userId: 101, nickname: '회원', characterGender: 'MALE' })
    if (url === '/api/v1/auth/websocket-ticket') return json({ ticket: 'fixture-ticket', expiresIn: 30 })
    if (url.startsWith('/api/v1/tables?')) return json({ tables: [] })
    throw new Error('Unexpected request: ' + url)
  }))
  runtime = new ParkRuntime()
  await restoreAuthSession(true)
  runtime.start()
  await vi.waitFor(() => expect(useSession.getState().roomId).toBe('channel-1'))
  socket = sockets.at(-1)!
  world()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
})

afterEach(async () => {
  await runtime.stop()
  vi.useRealTimers()
  clearAuthSession()
  vi.unstubAllGlobals()
})

describe('M05 fitness guards at the real Spring transport boundary', () => {
  it.each(['pending', 'occupied'] as const)('blocks other facilities and nonzero movement while %s, but preserves stop and post-release input', async mode => {
    const station = FITNESS_STATIONS[0]!, anchors = fitnessAnchors(station.id)
    runtime.move(0, 0, false)
    runtime.move(1, 0, false, true) // queued before the fitness restriction
    if (mode === 'pending') useFitnessState.setState({ pending: true, operation: 'enter' })
    else useFitnessState.setState({ placements: { '101': { userId: '101', channelId: 'channel-1', stationId: station.id,
      pose: anchors.use, exit: anchors.exit, startedAt: Date.now() } } })
    await vi.advanceTimersByTimeAsync(60)
    const count = moves().length
    runtime.move(1, 0, true, true)
    await vi.advanceTimersByTimeAsync(60)
    expect(moves()).toHaveLength(count)
    runtime.move(0, 0, false)
    expect(moves().at(-1)!.payload).toMatchObject({ dx: 0, dz: 0, run: false, jump: false })
    const sent = socket.requests.length
    expect(await runtime.selectChannel('channel-1')).toBe(false)
    runtime.inspectTable('table-1')
    expect(useSession.getState().focusedAnchorId).toBe('')
    expect(await runtime.joinTable()).toBe(false)
    expect(useSession.getState().error).toContain('운동기구')
    expect(socket.requests).toHaveLength(sent)
    useFitnessState.setState({ pending: false, operation: '', placements: {} })
    await vi.advanceTimersByTimeAsync(60)
    expect(moves()).toHaveLength(count + 1) // stale input was not replayed
    runtime.move(0, -1, false)
    expect(moves().at(-1)!.payload).toMatchObject({ dx: 0, dz: -1, run: false, jump: false })
    expect(socket.requests.some(r => /FITNESS/.test(r.type))).toBe(false)
  })
})
