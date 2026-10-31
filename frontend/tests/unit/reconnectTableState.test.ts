import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { ParkRuntime } from '../../src/park/runtime/SpringParkRuntime'
import { canPlace, tableBusy, useGame } from '../../src/game/store'
import { useHostStartWait } from '../../src/features/tableLobby/hostStartWait'
import { EXPECTED_MAP } from '../../src/config/mapVersion'

// Mirrors TableHub.register/activateConnection: every seat state precedes CHANNEL_JOIN and the REST table list.
const table = { tableId: 'server-table', version: 4, capacity: 2, minimumPlayers: 2,
  seats: [{ seatNumber: 1, userId: '101', ready: false }, { seatNumber: 2, userId: '102', ready: false }],
  allReady: false, selectorUserId: '101', gameCode: 'OMOK', targetScore: null, betAmountPerPlayer: 5 }
const notSeated = { tableId: null, revision: 0, phase: 'NOT_SEATED', startAttemptId: null, gameCode: null,
  gameSessionId: null, code: null, simulation: false }
const start = (phase: string, revision = 6, gameSessionId: string | null = phase === 'WAITING' ? null : '7') => ({
  tableId: 'server-table', revision, phase, startAttemptId: phase === 'WAITING' ? null : 'a', gameCode: 'OMOK',
  gameSessionId, code: null, simulation: false })
const omok = (status = 'PLAYING') => ({ gameCode: 'OMOK', status, boardSize: 15,
  board: Array.from({ length: 15 }, () => Array(15).fill(0)), blackUserId: '101', whiteUserId: '102',
  turnUserId: status === 'PLAYING' ? '101' : null, turnDeadline: status === 'PLAYING' ? '2099-01-01T00:00:30Z' : null,
  moveCount: 0, lastMove: null, winnerUserId: status === 'PLAYING' ? null : '101',
  endReason: status === 'PLAYING' ? null : 'FIVE_IN_ROW', endedAt: status === 'PLAYING' ? null : '2026-10-29T00:00:00Z' })
const hostWait = { tableId: 'server-table', tableVersion: 4, epoch: 'e', revision: 3, hostUserId: '101',
  expiresAt: Date.parse('2026-10-29T00:02:00Z'), serverNow: Date.parse('2026-10-29T00:00:00Z'), cancelReason: null }

type Sent = [type: string, payload: object]
let socket: ContractSocket, runtime: ParkRuntime, activation: Sent[] = [], channelTables = [table.tableId]
let tablesGate: Promise<void> | null = null
class ContractSocket implements SocketLike {
  readyState = 0; onopen: SocketLike['onopen'] = null; onclose: SocketLike['onclose'] = null
  onmessage: SocketLike['onmessage'] = null; onerror: SocketLike['onerror'] = null
  requests: { requestId: string; type: string; payload: Record<string, unknown> }[] = []
  constructor() {
    socket = this
    const sequence = activation
    queueMicrotask(() => {
      this.readyState = 1; this.onopen?.(new Event('open'))
      this.emit('CONNECTED', { userId: '101' })
      this.emit('GAME_START_STATE', notSeated)
      for (const [type, payload] of sequence) this.emit(type, payload)
    })
  }
  emit(type: string, payload: object, requestId: string | null = null) { this.onmessage?.({ data: JSON.stringify({ type, payload, requestId }) } as MessageEvent) }
  send(data: string) {
    const r = JSON.parse(data); this.requests.push(r)
    queueMicrotask(() => {
      if (r.type === 'CHANNEL_JOIN') this.emit('CHANNEL_STATE', { channelId: 'c', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] }, r.requestId)
    })
  }
  close(code = 1000) { this.readyState = 3; queueMicrotask(() => this.onclose?.({ code } as CloseEvent)) }
}
async function boot(sequence: Sent[]) {
  activation = sequence
  runtime = new ParkRuntime(); await restoreAuthSession(true); runtime.start()
  await vi.waitFor(() => expect(useSession.getState().tables).toHaveLength(channelTables.length))
  await vi.waitFor(() => expect(useSession.getState().status).toBe('connected'))
  await new Promise(done => setTimeout(done, 0))
}
async function reconnect(sequence: Sent[]) {
  activation = sequence
  const previous = socket
  runtime.reconnect()
  await vi.waitFor(() => expect(socket).not.toBe(previous))
  await vi.waitFor(() => expect(useSession.getState().status).toBe('connected'))
  await new Promise(done => setTimeout(done, 0))
}
beforeEach(() => {
  clearAuthSession(); resetWorld(); activation = []; channelTables = [table.tableId]; tablesGate = null
  socket = undefined as unknown as ContractSocket
  vi.stubGlobal('window', { location: { href: 'http://localhost:5198/park' } })
  vi.stubGlobal('WebSocket', ContractSocket)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/v1/tables?')) await tablesGate
    const body = url.endsWith('/auth/refresh') ? { accessToken: 'fixture' }
      : url === '/park-bindings.json' ? { bindings: [{ channelId: 'c', tableId: table.tableId, anchorId: 'table-1' }] }
      : url.endsWith('/users/me') ? { userId: 101, nickname: '회원', characterGender: 'MALE' }
      : url.endsWith('/channels') ? { items: [{ channelId: 'c', name: '공원', currentUsers: 0, capacity: 4, joinable: true }] }
      : url.endsWith('/websocket-ticket') ? { ticket: 'fixture', expiresIn: 30 }
      : url.startsWith('/api/v1/tables?') ? { tables: channelTables.map(tableId => ({ tableId, capacity: 2, occupiedSeats: 2,
        availableSeats: 0, joinable: false, gameCode: 'OMOK', status: 'WAITING' })) }
      : url.startsWith('/api/v1/users/me/games') ? { items: [], nextCursor: null, hasNext: false }
      : null
    if (!body) throw new Error('Unexpected HTTP: ' + url)
    return new Response(JSON.stringify(body))
  }))
})
afterEach(async () => { await runtime.stop(); clearAuthSession(); vi.unstubAllGlobals() })

describe('seat states that precede CHANNEL_JOIN and the table list', () => {
  it('restores a WAITING lease seat, host wait and this table\'s start state', async () => {
    await boot([['TABLE_STATE', table], ['TABLE_HOST_WAIT_STATE', hostWait], ['GAME_START_STATE', start('WAITING')],
      ['GAME_CONNECTION_STATE', { status: 'LOBBY' }]])
    expect(useSession.getState()).toMatchObject({ tableId: 'server-table', seatIndex: 0 })
    expect(useSession.getState().tableStates['server-table']?.version).toBe(4)
    expect(useGame.getState()).toMatchObject({ recovery: 'LOBBY', start: { tableId: 'server-table', phase: 'WAITING' } })
    expect(useHostStartWait.getState()).toMatchObject({ scope: { tableId: 'server-table' }, snapshot: { revision: 3 } })
  })

  it('restores a PLAYING frozen seat with the active game and keeps input permission', async () => {
    await boot([['TABLE_STATE', table], ['GAME_START_STATE', start('PLAYING')],
      ['GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: '7', version: 3, state: omok() }]])
    expect(useSession.getState().tableId).toBe('server-table')
    expect(useGame.getState()).toMatchObject({ recovery: 'RESTORED', permittedGameId: '7', start: { phase: 'PLAYING' } })
    expect(useGame.getState().game?.version).toBe(3)
    expect(canPlace('101', 7, 7)).toBe(true)
  })

  it('restores a SETTLING frozen seat with the FINISHED snapshot instead of settling it as LOBBY', async () => {
    await boot([['TABLE_STATE', table], ['GAME_START_STATE', start('SETTLING')],
      ['GAME_CONNECTION_STATE', { status: 'FINISHED', gameId: '7', version: 9, state: omok('FINISHED') }]])
    expect(useGame.getState()).toMatchObject({ recovery: 'FINISHED', permittedGameId: '7', start: { phase: 'SETTLING' } })
    expect(tableBusy()).toBe(true)
  })

  it('keeps the states held while map confirmation runs clearChannel after they arrived', async () => {
    activation = []
    const original = ContractSocket.prototype.send
    ContractSocket.prototype.send = function (this: ContractSocket, data: string) {
      const r = JSON.parse(data)
      if (r.type === 'WORLD_MAP_CONFIRM') {
        this.requests.push(r)
        queueMicrotask(() => {
          this.emit('WORLD_MAP_STATE', { verified: true, map: r.payload }, r.requestId)
          // TableHub.confirmMap: WORLD_MAP_STATE, then activateConnection in the same call.
          this.emit('TABLE_STATE', table); this.emit('GAME_START_STATE', start('WAITING'))
        })
        return
      }
      original.call(this, data)
    }
    const emit = ContractSocket.prototype.emit
    ContractSocket.prototype.emit = function (this: ContractSocket, type: string, payload: object, requestId: string | null = null) {
      if (type === 'CONNECTED') payload = { ...payload, map: EXPECTED_MAP, mapVerificationRequired: true }
      emit.call(this, type, payload, requestId)
    }
    try {
      await boot([])
      expect(useSession.getState().tableId).toBe('server-table')
      expect(useGame.getState().start).toMatchObject({ tableId: 'server-table', phase: 'WAITING' })
    } finally {
      ContractSocket.prototype.send = original
      ContractSocket.prototype.emit = emit
    }
  })

  it('reads the seat first when the start state arrived before it', async () => {
    await boot([['GAME_START_STATE', start('WAITING')], ['TABLE_STATE', table]])
    expect(useSession.getState().tableId).toBe('server-table')
    expect(useGame.getState().start).toMatchObject({ tableId: 'server-table', phase: 'WAITING' })
  })

  it('keeps version and revision checks among held states', async () => {
    await boot([['TABLE_STATE', { ...table, version: 9 }], ['TABLE_STATE', { ...table, version: 5 }],
      ['GAME_START_STATE', start('WAITING', 8)], ['GAME_START_STATE', start('WAITING', 3)]])
    expect(useSession.getState().tableStates['server-table']?.version).toBe(9)
    expect(useGame.getState().start?.revision).toBe(8)
  })

  it('a connection state that arrives before the seat keeps its active recovery', async () => {
    await boot([['GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: '7', version: 3, state: omok() }],
      ['TABLE_STATE', table], ['GAME_START_STATE', start('PLAYING')]])
    expect(useGame.getState()).toMatchObject({ recovery: 'RESTORED', permittedGameId: '7' })
    expect(useGame.getState().game?.version).toBe(3)
    expect(useSession.getState().tableId).toBe('server-table')
  })

  it('ignores a seat on a table that is not in the joined channel list', async () => {
    channelTables = ['other-table']
    await boot([['TABLE_STATE', table], ['GAME_START_STATE', start('WAITING')]])
    expect(useSession.getState()).toMatchObject({ tableId: '', seatIndex: -1 })
    expect(useSession.getState().tableStates).toEqual({})
    expect(useGame.getState().start).toBeNull()
  })

  it('does not invent a seat when the server released it', async () => {
    await boot([['GAME_CONNECTION_STATE', { status: 'LOBBY' }]])
    expect(useSession.getState().tableId).toBe('')
    expect(useGame.getState()).toMatchObject({ recovery: 'LOBBY', start: null })
  })
})

describe('connection, account and repeat safety', () => {
  it('never applies a previous connection\'s held states after a reconnect', async () => {
    let release!: () => void
    tablesGate = new Promise(done => { release = done })
    activation = [['TABLE_STATE', table], ['GAME_START_STATE', start('WAITING')]]
    runtime = new ParkRuntime(); await restoreAuthSession(true); runtime.start()
    await vi.waitFor(() => expect(socket?.requests.some(r => r.type === 'CHANNEL_JOIN')).toBe(true))
    // The seat was released before this reconnect; the old list request resolves late.
    tablesGate = null
    activation = []
    const previous = socket
    runtime.reconnect()
    await vi.waitFor(() => expect(socket).not.toBe(previous))
    release()
    await vi.waitFor(() => expect(useSession.getState().tables).toHaveLength(1))
    await new Promise(done => setTimeout(done, 0))
    expect(useSession.getState().tableId).toBe('')
    expect(useGame.getState().start).toBeNull()
  })

  it('retries after 1013 (previous connection check) but stops on 1008 (another live tab)', async () => {
    await boot([])
    const checked = socket
    checked.close(1013)
    await vi.waitFor(() => expect(useSession.getState().status).toBe('reconnecting'))
    await vi.waitFor(() => expect(socket).not.toBe(checked), { timeout: 4000 })
    await vi.waitFor(() => expect(useSession.getState().status).toBe('connected'), { timeout: 4000 })
    const live = socket
    live.close(1008)
    await vi.waitFor(() => expect(useSession.getState().status).toBe('error'))
    await new Promise(done => setTimeout(done, 1500))
    expect(socket).toBe(live)
  })

  it('an ended login discards held states', async () => {
    let release!: () => void
    tablesGate = new Promise(done => { release = done })
    activation = [['TABLE_STATE', table]]
    runtime = new ParkRuntime(); await restoreAuthSession(true); runtime.start()
    await vi.waitFor(() => expect(socket?.requests.some(r => r.type === 'CHANNEL_JOIN')).toBe(true))
    socket.close(4401)
    await vi.waitFor(() => expect(useSession.getState().status).toBe('error'))
    release()
    await new Promise(done => setTimeout(done, 0))
    expect(useSession.getState().tableId).toBe('')
  })

  it('repeated reconnects apply each connection once and never restore a stale seat', async () => {
    await boot([['TABLE_STATE', table], ['GAME_START_STATE', start('WAITING')]])
    expect(useSession.getState().tableId).toBe('server-table')
    await reconnect([['TABLE_STATE', { ...table, version: 6 }], ['GAME_START_STATE', start('WAITING', 9)]])
    expect(useSession.getState().tableStates['server-table']?.version).toBe(6)
    expect(useGame.getState().start?.revision).toBe(9)
    await reconnect([])
    expect(useSession.getState().tableId).toBe('')
    expect(useGame.getState().start).toBeNull()
    // Live broadcasts after the list are handled directly, not held.
    socket.emit('TABLE_STATE', { ...table, version: 1 })
    expect(useSession.getState().tableId).toBe('server-table')
  })
})
