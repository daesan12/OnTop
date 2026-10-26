import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { useTableLobby } from '../../src/features/tableLobby/state'
import { ParkRuntime } from '../../src/park/runtime/SpringParkRuntime'

const table = { tableId: 'server-table', version: 1, capacity: 2, minimumPlayers: 2,
  seats: [{ seatNumber: 1, userId: null, ready: false }, { seatNumber: 2, userId: '102', ready: false }],
  allReady: false, selectorUserId: '102', gameCode: null, targetScore: null }
let socket: ContractSocket, runtime: ParkRuntime
class ContractSocket implements SocketLike {
  readyState = 0; onopen: SocketLike['onopen'] = null; onclose: SocketLike['onclose'] = null
  onmessage: SocketLike['onmessage'] = null; onerror: SocketLike['onerror'] = null
  mode: 'success' | 'error' | 'hold' = 'success'
  requests: { requestId: string; type: string; payload: Record<string, unknown> }[] = []
  constructor() { socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(new Event('open')); this.emit('CONNECTED', { userId: '101' }) }) }
  emit(type: string, payload: object, requestId: string | null = null) { this.onmessage?.({ data: JSON.stringify({ type, payload, requestId }) } as MessageEvent) }
  send(data: string) {
    const r = JSON.parse(data); this.requests.push(r)
    queueMicrotask(() => {
      if (r.type === 'CHANNEL_JOIN') this.emit('CHANNEL_STATE', { channelId: 'c', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'] }, r.requestId)
      if (r.type === 'TABLE_WATCH' && this.mode === 'success') this.emit('TABLE_WATCH_STATE', table, r.requestId)
      if (r.type === 'TABLE_WATCH' && this.mode === 'error') this.emit('ERROR', { code: 'TABLE_OUT_OF_RANGE', message: '관전 범위 오류' }, r.requestId)
      if (r.type === 'TABLE_UNWATCH') this.emit('TABLE_WATCH_LEFT', { tableId: table.tableId }, r.requestId)
      if (r.type === 'GAME_SELECT') this.emit('TABLE_STATE', { ...table, version: 5, seats: table.seats.map((s, i) => ({ ...s, userId: i === 0 ? '101' : '102' })), selectorUserId: '101', gameCode: r.payload.gameCode, targetScore: r.payload.targetScore ?? null }, r.requestId)
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
  expect(await runtime.selectGame('DICE', 4000)).toBe(false)
  useSession.setState({ tableStates: { [table.tableId]: { ...table, selectorUserId: '101' } } })
  expect(await runtime.selectGame('DICE', 3000)).toBe(false)
  expect(await runtime.selectGame('DICE', 4000)).toBe(true)
  expect(socket.requests.find(r => r.type === 'GAME_SELECT')?.payload).toEqual({ gameCode: 'DICE', targetScore: 4000 })
})
it('ordinary mode never guesses a public game ID or sends GAME_WATCH', async () => {
  expect(await runtime.watchGame('guess')).toBe(false)
  expect(socket.requests.some(r => r.type === 'GAME_WATCH')).toBe(false)
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
