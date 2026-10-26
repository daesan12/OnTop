import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { useTableLobby } from '../../src/features/tableLobby/state'
import { ParkRuntime } from '../../src/park/runtime/SpringParkRuntime'
import { useGame } from '../../src/game/store'
import { bridgeState } from '../fixtures/bridge'

const table = { tableId: 'server-table', version: 1, capacity: 2, minimumPlayers: 2,
  seats: [{ seatNumber: 1, userId: null, ready: false }, { seatNumber: 2, userId: '102', ready: false }],
  allReady: false, selectorUserId: '102', gameCode: null, targetScore: null, betAmountPerPlayer: null }
let socket: ContractSocket, runtime: ParkRuntime
const storedResult = { version: 2, gameSessionId: '7', gameCode: 'OMOK', status: 'INVALID', endReason: 'ENGINE_LOST',
  settlementStatus: 'SETTLED', betAmountPerPlayer: 5, myCoinDelta: 0, endedAt: '2026-10-26T00:00:00Z',
  participants: [{ userId: '101', result: null }, { userId: '102', result: null }] }
class ContractSocket implements SocketLike {
  readyState = 0; onopen: SocketLike['onopen'] = null; onclose: SocketLike['onclose'] = null
  onmessage: SocketLike['onmessage'] = null; onerror: SocketLike['onerror'] = null
  mode: 'success' | 'error' | 'hold' = 'success'
  requests: { requestId: string; type: string; payload: Record<string, unknown> }[] = []
  lastTable: object = table
  constructor() { socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(new Event('open')); this.emit('CONNECTED', { userId: '101' }) }) }
  emit(type: string, payload: object, requestId: string | null = null) { this.onmessage?.({ data: JSON.stringify({ type, payload, requestId }) } as MessageEvent) }
  send(data: string) {
    const r = JSON.parse(data); this.requests.push(r)
    queueMicrotask(() => {
      if (r.type === 'CHANNEL_JOIN') this.emit('CHANNEL_STATE', { channelId: 'c', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'] }, r.requestId)
      if (r.type === 'TABLE_WATCH' && this.mode === 'success') this.emit('TABLE_WATCH_STATE', table, r.requestId)
      if (r.type === 'TABLE_WATCH' && this.mode === 'error') this.emit('ERROR', { code: 'TABLE_OUT_OF_RANGE', message: '관전 범위 오류' }, r.requestId)
      if (r.type === 'TABLE_UNWATCH') this.emit('TABLE_WATCH_LEFT', { tableId: table.tableId }, r.requestId)
      if (r.type === 'GAME_RESULT_CHECK') this.emit('GAME_RESULT', storedResult, r.requestId)
      if (r.type === 'GAME_SELECT') {
        this.lastTable = { ...table, version: 5, seats: table.seats.map((s, i) => ({ ...s, userId: i === 0 ? '101' : '102' })), selectorUserId: '101', gameCode: r.payload.gameCode, targetScore: r.payload.targetScore ?? null, betAmountPerPlayer: r.payload.betAmountPerPlayer }
        this.emit('TABLE_STATE', this.lastTable, r.requestId)
      }
      if (r.type === 'READY_SET') {
        this.lastTable = { ...this.lastTable, version: r.payload.ready ? 6 : 7,
          seats: table.seats.map((s, i) => ({ ...s, userId: i === 0 ? '101' : '102', ready: i === 0 && r.payload.ready })) }
        this.emit('TABLE_STATE', this.lastTable, r.requestId)
      }
    })
  }
  close(code = 1000) { this.readyState = 3; queueMicrotask(() => this.onclose?.({ code } as CloseEvent)) }
}
beforeEach(async () => {
  clearAuthSession(); resetWorld()
  vi.stubGlobal('window', { location: { href: 'http://localhost:5198/park' } })
  vi.stubGlobal('WebSocket', ContractSocket)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.endsWith('/auth/refresh') ? { accessToken: 'fixture' }
      : url === '/park-bindings.json' ? { bindings: [{ channelId: 'c', tableId: table.tableId, anchorId: 'table-1' }] }
      : url.endsWith('/users/me') ? { userId: 101, nickname: '회원', characterGender: 'MALE' }
      : url.endsWith('/channels') ? { items: [{ channelId: 'c', name: '공원', currentUsers: 0, capacity: 4, joinable: true }] }
      : url.endsWith('/websocket-ticket') ? { ticket: 'fixture', expiresIn: 30 }
      : url.startsWith('/api/v1/tables?') ? { tables: [{ tableId: table.tableId, capacity: 2, occupiedSeats: 1, availableSeats: 1, joinable: true, gameCode: null, status: 'WAITING' }] }
      : null
    if (!body) throw new Error('Unexpected HTTP: ' + url)
    return new Response(JSON.stringify(body))
  }))
  runtime = new ParkRuntime(); await restoreAuthSession(true); runtime.start()
  await vi.waitFor(() => expect(useSession.getState().tables).toHaveLength(1))
})
afterEach(async () => { await runtime.stop(); vi.useRealTimers(); clearAuthSession(); vi.unstubAllGlobals() })
it('a rejection stays an error with no fake table; retry uses the same TABLE_WATCH API', async () => {
  socket.mode = 'error'; runtime.inspectTable('table-1')
  await vi.waitFor(() => expect(useTableLobby.getState().status).toBe('error'))
  expect(useSession.getState().tableStates).toEqual({})
  socket.mode = 'success'; runtime.inspectTable('table-1')
  await vi.waitFor(() => expect(useTableLobby.getState().status).toBe('ready'))
  expect(socket.requests.filter(r => r.type === 'TABLE_WATCH').map(r => r.payload)).toEqual([{ tableId: 'server-table' }, { tableId: 'server-table' }])
  expect(useSession.getState().tableId).toBe('')
})
it('a successful late query after closing is discarded and its subscription released', async () => {
  socket.mode = 'hold'; runtime.inspectTable('table-1')
  await vi.waitFor(() => expect(socket.requests.some(r => r.type === 'TABLE_WATCH')).toBe(true))
  const r = socket.requests.find(r => r.type === 'TABLE_WATCH')!
  runtime.closeTable(); socket.emit('TABLE_WATCH_STATE', table, r.requestId)
  await vi.waitFor(() => expect(socket.requests.some(r => r.type === 'TABLE_UNWATCH')).toBe(true))
  expect(useSession.getState().focusedAnchorId).toBe('')
  expect(useSession.getState().tableStates).toEqual({})
})
it('only server selector can select a game; forwards target without adding table/user authority', async () => {
  useSession.setState({ tableId: table.tableId, tableStates: { [table.tableId]: table } })
  expect(await runtime.selectGame('DICE', 5, 4000)).toBe(false)
  useSession.setState({ tableStates: { [table.tableId]: { ...table, selectorUserId: '101' } } })
  expect(await runtime.selectGame('DICE', 5, 3000)).toBe(false)
  expect(await runtime.selectGame('DICE', 5, 4000)).toBe(true)
  expect(socket.requests.find(r => r.type === 'GAME_SELECT')?.payload).toEqual({ gameCode: 'DICE', targetScore: 4000, betAmountPerPlayer: 5 })
})
it('ordinary mode never guesses a public game ID or sends GAME_WATCH', async () => {
  expect(await runtime.watchGame('guess')).toBe(false)
  expect(socket.requests.some(r => r.type === 'GAME_WATCH')).toBe(false)
})
it('ready confirms the displayed server fee and version; cancellation keeps its original contract', async () => {
  useSession.setState({ tableId: table.tableId, tableStates: { [table.tableId]: { ...table, selectorUserId: '101' } } })
  expect(await runtime.setReady(true)).toBe(false)
  expect(socket.requests.some(r => r.type === 'READY_SET')).toBe(false)
  expect(await runtime.selectGame('DICE', 5, 4000)).toBe(true)
  expect(await runtime.setReady(true)).toBe(true)
  expect(socket.requests.filter(r => r.type === 'READY_SET').at(-1)?.payload).toEqual({ ready: true, betAmountPerPlayer: 5, expectedVersion: 5 })
  expect(await runtime.setReady(false)).toBe(true)
  expect(socket.requests.filter(r => r.type === 'READY_SET').at(-1)?.payload).toEqual({ ready: false })
})
it('timeout ends pending state and a late approval cannot create a public table view', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  socket.mode = 'hold'; runtime.inspectTable('table-1')
  await vi.waitFor(() => expect(socket.requests.some(r => r.type === 'TABLE_WATCH')).toBe(true))
  const r = socket.requests.find(r => r.type === 'TABLE_WATCH')!
  await vi.advanceTimersByTimeAsync(8100)
  expect(useTableLobby.getState().status).toBe('error')
  expect(useSession.getState().pending).toBe(false)
  socket.emit('TABLE_WATCH_STATE', table, r.requestId)
  expect(useSession.getState().tableStates).toEqual({})
})
function participant() {
  useSession.setState({ tableId: table.tableId, seatIndex: 0, tableStates: { [table.tableId]: { ...table,
    seats: [{ seatNumber: 1, userId: '101', ready: false }, { seatNumber: 2, userId: '102', ready: false }] } } })
  useGame.setState({ start: { tableId: table.tableId, revision: 1, phase: 'SETTLING', startAttemptId: 'attempt',
    gameCode: 'OMOK', gameSessionId: '7', code: null, simulation: false }, permittedGameId: '7' })
}
it('queries its server-granted current game without an engine and consumes the normal response path', async () => {
  participant()
  expect(useGame.getState().game).toBeNull()
  expect(await runtime.checkResult()).toBe(true)
  expect(socket.requests.filter(r => r.type === 'GAME_RESULT_CHECK').at(-1)?.payload).toEqual({ gameSessionId: '7' })
  expect(useGame.getState().lastResult).toEqual(storedResult)
  socket.emit('GAME_RESULT', { ...storedResult, version: 1, settlementStatus: 'PENDING', myCoinDelta: null })
  expect(useGame.getState().lastResult).toEqual(storedResult)
})
it('queries its completed game after WAITING cleared the engine and receives a duplicate safely', async () => {
  participant()
  socket.emit('GAME_START_STATE', { ...useGame.getState().start, revision: 2, phase: 'WAITING', startAttemptId: null, gameSessionId: null })
  expect(useGame.getState().permittedGameId).toBe('')
  expect(await runtime.checkResult()).toBe(true)
  expect(await runtime.checkResult()).toBe(true)
  expect(useGame.getState().lastResult).toEqual(storedResult)
  expect(useGame.getState().game).toBeNull()
})
it('cannot query an ungranted result, spectator game or a game from another table', async () => {
  participant(); useGame.setState({ permittedGameId: '', lastResult: { ...storedResult, status: 'INVALID', settlementStatus: 'SETTLED' } })
  expect(await runtime.checkResult()).toBe(false)
  participant(); useGame.setState({ watchedGameId: 'spectator-game' })
  expect(await runtime.checkResult()).toBe(false)
  useGame.setState({ watchedGameId: '', game: { gameId: 'spectator-game', version: 0, role: 'SPECTATOR', bridge: bridgeState(), secret: null } })
  expect(await runtime.checkResult()).toBe(false)
  useGame.setState({ game: null, start: { ...useGame.getState().start!, tableId: 'other-table' } })
  expect(await runtime.checkResult()).toBe(false)
  expect(socket.requests.some(r => r.type === 'GAME_RESULT_CHECK')).toBe(false)
})
