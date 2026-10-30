import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { clearChannel, resetWorld, useSession } from '../../src/network/worldClient'
import { ParkRuntime } from '../../src/park/runtime/runtime'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { inputState } from '../../src/world/inputOwnership'
import { createBungeoppangV4Service } from '../../src/features/bungeoppang/serviceV4'
import { createBungeoppangV5Service } from '../../src/features/bungeoppang/serviceV5'

const sockets: MovementSocket[] = []
class MovementSocket implements SocketLike {
  holdMoves = false
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
    if (request.type === 'WORLD_MOVE' && !this.holdMoves) queueMicrotask(() => this.replyMove(request))
  }
  replyMove(request: MovementSocket['requests'][number]) {
    this.emit('WORLD_STATE', { channelId: 'channel-1', version: ++version, mapVersion: EXPECTED_MAP_VERSION,
      avatars: [{ userId: '101', position: { ...position, lastInputSeq: request.payload.seq } }] }, request.requestId)
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
  inputState.minigameOpen = false
  await runtime.stop()
  vi.useRealTimers()
  clearAuthSession()
  vi.unstubAllGlobals()
})

describe('M14 authenticated REST and movement ownership boundary', () => {
  it.each(['v4', 'v5'] as const)('sends the %s lobby through the authenticated runtime', async rulesVersion => {
    const original = vi.mocked(fetch).getMockImplementation()!
    const path = `/api/v1/minigames/sessions?rulesVersion=${rulesVersion}`
    const lobby = { rulesVersion, todayEarned: 0, dailyCap: 100, isFirstGame: true, seenTips: [] }
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      input === path ? json(lobby) : original(input, init))
    const create = rulesVersion === 'v5' ? createBungeoppangV5Service : createBungeoppangV4Service
    const service = create((url, init) => runtime.requestJSON(url, init))
    expect(service.mock).toBe(false)
    expect(await service.getStatus()).toEqual(lobby)
    expect(fetch).toHaveBeenCalledWith(path, expect.objectContaining({
      credentials: 'omit', headers: { Authorization: 'Bearer fixture-access' },
    }))
  })
  it.each(['v6', 'v50', 'v5&unexpected=true'])('blocks unsupported lobby query %s before sending it', async version => {
    vi.mocked(fetch).mockClear()
    await expect(runtime.requestJSON(`/api/v1/minigames/sessions?rulesVersion=${version}`))
      .rejects.toThrow('사용할 수 없는 요청')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('reuses the same start body and key through the existing 401 refresh flow', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!
    const attempts: RequestInit[] = []
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (input === '/api/v1/minigames/sessions') {
        attempts.push(init!)
        return attempts.length === 1 ? new Response('{}', { status: 401 }) : json({ minigameSessionId: '901' })
      }
      return original(input, init)
    })
    const body = JSON.stringify({ minigameType: 'BUNGEOPPANG' })
    expect(await runtime.requestJSON('/api/v1/minigames/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'same-round' }, body,
    })).toEqual({ minigameSessionId: '901' })
    expect(attempts).toHaveLength(2)
    for (const attempt of attempts) {
      expect(attempt.body).toBe(body)
      expect(attempt.credentials).toBe('omit')
      expect(attempt.headers).toMatchObject({ Authorization: 'Bearer fixture-access', 'Idempotency-Key': 'same-round' })
    }
    await expect(runtime.requestJSON('/api/v1/users/other')).rejects.toThrow('사용할 수 없는 요청')
  })
  it('preserves BE error codes without returning local success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 'TOO_EARLY' }), { status: 422 }))
    await expect(runtime.requestJSON('/api/v1/minigames/sessions/901/complete', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 422, code: 'TOO_EARLY' })
  })
  it('blocks movement during cooking while retaining stop delivery and subsequent roaming', async () => {
    inputState.minigameOpen = true
    runtime.move(0, -1, true, true)
    expect(moves()).toHaveLength(0)
    runtime.move(0, 0, false)
    expect(moves()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60)
    inputState.minigameOpen = false
    runtime.move(1, 0, false)
    expect(moves()).toHaveLength(2)
  })
})

describe('M02 real runtime delivery through the existing SharedSocket', () => {
  const movementMessage = '이동 입력 전송 간격을 확인해주세요.'
  function rejectMove(index: number) {
    socket.emit('ERROR', { code: 'MOVE_TOO_FREQUENT', message: movementMessage }, moves()[index]!.requestId)
  }
  it('expires movement rate notices three seconds after the latest rejection', async () => {
    socket.holdMoves = true
    runtime.move(0, -1, false)
    rejectMove(0)
    await vi.advanceTimersByTimeAsync(2999)
    expect(useSession.getState().movementNotice?.message).toBe(movementMessage)
    expect(useSession.getState().error).toBe('')
    runtime.move(1, 0, false)
    rejectMove(1)
    await vi.advanceTimersByTimeAsync(2999)
    expect(useSession.getState().movementNotice?.message).toBe(movementMessage)
    await vi.advanceTimersByTimeAsync(1)
    expect(useSession.getState().movementNotice).toBeNull()
    expect(moves()).toHaveLength(2)
  })
  it('dismisses a notice on a newer movement reply, but not a broadcast or old reply', async () => {
    socket.holdMoves = true
    runtime.move(0, -1, false)
    await vi.advanceTimersByTimeAsync(60)
    runtime.move(1, 0, false)
    rejectMove(1)
    await vi.advanceTimersByTimeAsync(0)
    world()
    socket.replyMove(moves()[0]!)
    await vi.advanceTimersByTimeAsync(0)
    expect(useSession.getState().movementNotice?.message).toBe(movementMessage)
    await vi.advanceTimersByTimeAsync(60)
    runtime.move(0, 0, false)
    socket.replyMove(moves()[2]!)
    await vi.advanceTimersByTimeAsync(0)
    expect(useSession.getState().movementNotice).toBeNull()
  })
  it.each(['expiry', 'success'])('preserves other server errors on notice %s', async mode => {
    socket.holdMoves = true
    runtime.move(0, -1, false)
    rejectMove(0)
    await vi.advanceTimersByTimeAsync(60)
    socket.emit('ERROR', { code: 'OTHER_ERROR', message: '다른 작업 오류' })
    if (mode === 'success') {
      runtime.move(0, 0, false)
      socket.replyMove(moves()[1]!)
      await vi.advanceTimersByTimeAsync(0)
    } else await vi.advanceTimersByTimeAsync(3000)
    expect(useSession.getState().movementNotice).toBeNull()
    expect(useSession.getState().error).toBe('다른 작업 오류')
  })
  it.each(['channel', 'stop'])('clears the notice and its timer on %s exit', async boundary => {
    socket.holdMoves = true
    runtime.move(0, -1, false)
    rejectMove(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(useSession.getState().movementNotice).not.toBeNull()
    if (boundary === 'channel') clearChannel()
    else await runtime.stop()
    expect(useSession.getState().movementNotice).toBeNull()
    const timers = vi.getTimerCount()
    await vi.advanceTimersByTimeAsync(3000)
    expect(vi.getTimerCount()).toBe(timers)
  })
  it('sends queued Space once after a direction release, but cancels it on an explicit activity stop', async () => {
    socket.holdMoves = true
    runtime.move(0, -1, false)
    await vi.advanceTimersByTimeAsync(10)
    runtime.move(0, -1, false, true)
    runtime.move(0, 0, false)
    await vi.advanceTimersByTimeAsync(50)
    expect(moves()[1]!.payload).toEqual({ seq: 2, dx: 0, dz: 0, run: false, jump: true })
    runtime.move(0, 0, false, true)
    runtime.stopMovement()
    await vi.advanceTimersByTimeAsync(59)
    expect(moves()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(moves()[2]!.payload).toEqual({ seq: 3, dx: 0, dz: 0, run: false, jump: false })
    await vi.advanceTimersByTimeAsync(600)
    expect(moves()).toHaveLength(3)
  })
  it('keeps the 250ms input lease alive while replies are delayed and sends stop promptly', async () => {
    socket.holdMoves = true
    for (let i = 0; i < 10; i++) {
      runtime.move(0, -1, false)
      await vi.advanceTimersByTimeAsync(60)
      if (i === 3) world()
    }
    expect(moves()).toHaveLength(10)
    expect(moves().map(m => m.payload.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    runtime.move(0, 0, false)
    expect(moves()[10]!.payload).toEqual({ seq: 11, dx: 0, dz: 0, run: false, jump: false })
    socket.replyMove(moves()[0]!)
    await vi.advanceTimersByTimeAsync(120)
    expect(moves()).toHaveLength(11)
  })
  it.each(['rejection', 'timeout'])('preserves a newer queued jump after an older movement %s', async mode => {
    socket.holdMoves = true
    runtime.move(0, -1, false)
    runtime.move(1, 0, false, true)
    if (mode === 'rejection') socket.emit('ERROR', { code: 'MOVE_TOO_FREQUENT', message: '이동 간격 오류' }, moves()[0]!.requestId)
    else await vi.advanceTimersByTimeAsync(8100)
    await vi.advanceTimersByTimeAsync(120)
    const delivered = 2
    expect(moves()).toHaveLength(delivered)
    expect(moves()[1]!.payload).toMatchObject({ seq: 2, dx: 1, jump: true })
    expect(mode === 'rejection' ? useSession.getState().movementNotice?.message : useSession.getState().error)
      .toContain(mode === 'rejection' ? '이동 간격 오류' : '응답 시간이 초과')
    runtime.move(1, 0, false)
    expect(moves()[delivered]!.payload).toEqual({ seq: delivered + 1, dx: 1, dz: 0, run: false, jump: false })
  })
  it('sends normalized intent with only existing fields and increases seq on actual delivery', async () => {
    runtime.move(NaN, 0, false)
    runtime.move(2, 0, false)
    expect(moves()).toHaveLength(0)
    runtime.move(1, 1, true, true)
    expect(moves()).toHaveLength(1)
    expect(moves()[0]!.payload.seq).toBe(1)
    expect(Math.hypot(Number(moves()[0]!.payload.dx), Number(moves()[0]!.payload.dz))).toBeCloseTo(1)
    runtime.move(1, 0, false)
    runtime.move(0, -1, false)
    expect(moves()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(60)
    expect(moves()).toHaveLength(2)
    expect(moves()[1]!.payload).toEqual({ seq: 2, dx: 0, dz: -1, run: false, jump: false })
    for (const request of moves()) expect(Object.keys(request.payload).sort()).toEqual(['dx', 'dz', 'jump', 'run', 'seq'])
  })

  it.each(['map mismatch', 'server seating', 'avatar removal'])(
    'discards queued movement on %s even if the restriction is removed before the next send', async boundary => {
      runtime.move(0, 0, false)
      runtime.move(0, -1, true, true)
      if (boundary === 'map mismatch') {
        world('different-map')
        world()
      } else if (boundary === 'avatar removal') {
        world(EXPECTED_MAP_VERSION, false)
        runtime.move(1, 0, false)
        world()
      } else {
        useSession.setState({ tables: [{ tableId: 't', capacity: 2, occupiedSeats: 1, availableSeats: 1,
          joinable: true, gameCode: null, betAmountPerPlayer: null, status: 'WAITING' }] })
        socket.emit('TABLE_STATE', { tableId: 't', version: 1, capacity: 2, minimumPlayers: 2,
          seats: [{ seatNumber: 1, userId: '101', ready: false }, { seatNumber: 2, userId: null, ready: false }],
          allReady: false, selectorUserId: '101', gameCode: null, betAmountPerPlayer: null, targetScore: null })
        socket.emit('TABLE_LEFT', { tableId: 't' })
      }
      await vi.advanceTimersByTimeAsync(120)
      expect(moves()).toHaveLength(1)
      runtime.move(1, 0, false)
      expect(moves()[1]!.payload).toEqual({ seq: 2, dx: 1, dz: 0, run: false, jump: false })
    },
  )
})
