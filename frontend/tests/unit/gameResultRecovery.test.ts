import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { ParkRuntime } from '../../src/park/runtime/SpringParkRuntime'
import { canPlace, receiveGame, resetGame, tableBusy, useGame } from '../../src/game/store'
import { forgetTabGames, keepTabGame, latestEndedGame, readTabGame } from '../../src/game/resultRecovery'
import type { Envelope } from '../../src/network/protocol'

const key = 'ontop.game.result-candidate.v1:101'
const table = { tableId: 'server-table', version: 1, capacity: 2, minimumPlayers: 2,
  seats: [{ seatNumber: 1, userId: '101', ready: false }, { seatNumber: 2, userId: '102', ready: false }],
  allReady: false, selectorUserId: '101', gameCode: 'OMOK', targetScore: null, betAmountPerPlayer: 5 }
const waiting = { tableId: 'server-table', revision: 3, phase: 'WAITING', startAttemptId: null, gameCode: 'OMOK',
  gameSessionId: null, code: null, simulation: false }
const result = (gameSessionId = '7', version = 2, settled = true) => ({ version, gameSessionId, gameCode: 'OMOK',
  status: 'FINISHED', endReason: 'FIVE_IN_ROW', settlementStatus: settled ? 'SETTLED' : 'PENDING', betAmountPerPlayer: 5,
  myCoinDelta: settled ? 5 : null, endedAt: '2026-10-29T00:00:00Z',
  participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'LOSE' }] })
const omok = { gameCode: 'OMOK', status: 'PLAYING', boardSize: 15, board: Array.from({ length: 15 }, () => Array(15).fill(0)),
  blackUserId: '101', whiteUserId: '102', turnUserId: '101', turnDeadline: '2099-01-01T00:00:30Z', moveCount: 0,
  lastMove: null, winnerUserId: null, endReason: null, endedAt: null }
const historyOf =(...ids: string[]) => ({ items: ids.map(gameSessionId => ({ gameSessionId, gameCode: 'OMOK',
  status: 'FINISHED', myResult: 'WIN', settlementStatus: 'SETTLED', endedAt: '2026-10-29T00:00:00Z' })),
  nextCursor: null, hasNext: false })

class MemoryStorage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  key(index: number) { return [...this.map.keys()][index] ?? null }
  getItem(name: string) { return this.map.get(name) ?? null }
  setItem(name: string, value: string) { this.map.set(name, String(value)) }
  removeItem(name: string) { this.map.delete(name) }
}
let socket: ContractSocket, runtime: ParkRuntime, storage: MemoryStorage
let history: () => Promise<unknown>, historyCalls: { url: string; auth: string | null }[]
/** Mirrors TableHub.register/activateConnection for a member whose table is still SETTLING. */
let settlingActivation = false
/** TableHub.register sends this before any seat state. */
const notSeated = { ...waiting, tableId: null, revision: 0, phase: 'NOT_SEATED', gameCode: null }
const finishedOmok = { ...omok, status: 'FINISHED', turnUserId: null, turnDeadline: null, winnerUserId: '101',
  endReason: 'FIVE_IN_ROW', endedAt: '2026-10-29T00:00:00Z' }
class ContractSocket implements SocketLike {
  readyState = 0; onopen: SocketLike['onopen'] = null; onclose: SocketLike['onclose'] = null
  onmessage: SocketLike['onmessage'] = null; onerror: SocketLike['onerror'] = null
  resultMode: 'reply' | 'hold' | 'error' | 'busy' = 'reply'
  reply = result()
  requests: { requestId: string; type: string; payload: Record<string, unknown> }[] = []
  constructor() {
    socket = this
    queueMicrotask(() => {
      this.readyState = 1; this.onopen?.(new Event('open')); this.emit('CONNECTED', { userId: '101' })
      if (!settlingActivation) return
      // Sent before CHANNEL_JOIN, so the FE has no table list yet and cannot keep the seat or start state.
      this.emit('GAME_START_STATE', notSeated)
      this.emit('TABLE_STATE', table)
      this.emit('GAME_START_STATE', { ...waiting, revision: 4, phase: 'SETTLING', startAttemptId: 'a', gameSessionId: '7' })
      this.emit('GAME_CONNECTION_STATE', { status: 'FINISHED', gameId: '7', version: 9, state: finishedOmok })
    })
  }
  emit(type: string, payload: object, requestId: string | null = null) { this.onmessage?.({ data: JSON.stringify({ type, payload, requestId }) } as MessageEvent) }
  send(data: string) {
    const r = JSON.parse(data); this.requests.push(r)
    queueMicrotask(() => {
      if (r.type === 'CHANNEL_JOIN') this.emit('CHANNEL_STATE', { channelId: 'c', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'] }, r.requestId)
      if (r.type === 'GAME_RESULT_CHECK' && this.resultMode === 'reply') this.emit('GAME_RESULT', this.reply, r.requestId)
      if (r.type === 'GAME_RESULT_CHECK' && this.resultMode === 'error')
        this.emit('ERROR', { code: 'GAME_RESULT_ACCESS_DENIED', message: '경기 결과를 확인할 수 없습니다.' }, r.requestId)
      if (r.type === 'GAME_RESULT_CHECK' && this.resultMode === 'busy')
        this.emit('ERROR', { code: 'GAME_RESULT_PENDING', message: '경기 결과를 확인할 수 없습니다.' }, r.requestId)
    })
  }
  close(code = 1000) { this.readyState = 3; queueMicrotask(() => this.onclose?.({ code } as CloseEvent)) }
}
const checks = () => socket.requests.filter(r => r.type === 'GAME_RESULT_CHECK')
/** The automatic reconnect sequence for a member still seated at a WAITING table. */
function seatedLobby(status = 'LOBBY') {
  socket.emit('TABLE_STATE', table)
  socket.emit('GAME_START_STATE', waiting)
  socket.emit('GAME_CONNECTION_STATE', { status })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const settle = () => new Promise(done => setTimeout(done, 0))

beforeEach(async () => {
  clearAuthSession(); resetWorld()
  settlingActivation = false
  storage = new MemoryStorage(); historyCalls = []; history = async () => historyOf('7', '6')
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('window', { location: { href: 'http://localhost:5198/park' } })
  vi.stubGlobal('WebSocket', ContractSocket)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/v1/users/me/games')) {
      historyCalls.push({ url, auth: new Headers(init?.headers).get('Authorization') })
      return new Response(JSON.stringify(await history()))
    }
    const body = url.endsWith('/auth/refresh') ? { accessToken: 'fixture' }
      : url === '/park-bindings.json' ? { bindings: [{ channelId: 'c', tableId: table.tableId, anchorId: 'table-1' }] }
      : url.endsWith('/users/me') ? { userId: 101, nickname: '회원', characterGender: 'MALE' }
      : url.endsWith('/channels') ? { items: [{ channelId: 'c', name: '공원', currentUsers: 0, capacity: 4, joinable: true }] }
      : url.endsWith('/websocket-ticket') ? { ticket: 'fixture', expiresIn: 30 }
      : url.startsWith('/api/v1/tables?') ? { tables: [{ tableId: table.tableId, capacity: 2, occupiedSeats: 2, availableSeats: 0, joinable: false, gameCode: 'OMOK', status: 'WAITING' }] }
      : null
    if (!body) throw new Error('Unexpected HTTP: ' + url)
    return new Response(JSON.stringify(body))
  }))
  runtime = new ParkRuntime(); await restoreAuthSession(true); runtime.start()
  await vi.waitFor(() => expect(useSession.getState().tables).toHaveLength(1))
  await vi.waitFor(() => expect(useSession.getState().status).toBe('connected'))
})
afterEach(async () => { await runtime.stop(); clearAuthSession(); vi.unstubAllGlobals() })

describe('result discovery after a refresh', () => {
  it('finds the tab game through history, re-reads it with GAME_RESULT_CHECK and shows it without input permission', async () => {
    storage.setItem(key, '7')
    seatedLobby()
    await vi.waitFor(() => expect(useGame.getState().lastResult).toEqual(result()))
    expect(historyCalls).toEqual([{ url: '/api/v1/users/me/games?size=1', auth: 'Bearer fixture' }])
    expect(checks().map(r => r.payload)).toEqual([{ gameSessionId: '7' }])
    const g = useGame.getState()
    expect(g).toMatchObject({ completedGameId: '7', resultCandidateGameId: '', permittedGameId: '', result: null, recovery: 'LOBBY' })
    expect(canPlace('101', 7, 7)).toBe(false)
    expect(tableBusy()).toBe(false)
  })

  it('keeps the current game first: a RESTORED game never queries history', async () => {
    storage.setItem(key, '7')
    socket.emit('TABLE_STATE', table)
    socket.emit('GAME_START_STATE', { ...waiting, revision: 4, phase: 'PLAYING', startAttemptId: 'a', gameSessionId: '8' })
    socket.emit('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: '8', version: 0, state: omok })
    await settle()
    expect(historyCalls).toHaveLength(0)
    expect(checks()).toHaveLength(0)
    expect(useGame.getState()).toMatchObject({ recovery: 'RESTORED', permittedGameId: '8', lastResult: null })
    expect(canPlace('101', 7, 7)).toBe(true)
    // The new game replaces the tab's hint.
    expect(storage.getItem(key)).toBe('8')
  })

  it.each(['UNAVAILABLE', 'PENDING', 'EXPIRED', 'ELIMINATED'])('holds any old result while recovery is %s', async status => {
    storage.setItem(key, '7')
    socket.emit('TABLE_STATE', table)
    socket.emit('GAME_START_STATE', waiting)
    if (status === 'ELIMINATED') useGame.setState({ recovery: 'ELIMINATED' })
    else socket.emit('GAME_CONNECTION_STATE', { status })
    await settle()
    expect(historyCalls).toHaveLength(0)
    expect(useGame.getState()).toMatchObject({ recovery: status, lastResult: null, completedGameId: '' })
    if (status === 'UNAVAILABLE') expect(tableBusy()).toBe(true)
  })

  it('does not auto-show without this tab\'s own game hint (another tab or device)', async () => {
    seatedLobby()
    await settle()
    expect(historyCalls).toHaveLength(0)
    expect(useGame.getState().lastResult).toBeNull()
  })

  it('does not auto-show when the latest ended game is a different one', async () => {
    storage.setItem(key, '7'); history = async () => historyOf('9', '7')
    seatedLobby()
    await vi.waitFor(() => expect(historyCalls).toHaveLength(1))
    await settle()
    expect(checks()).toHaveLength(0)
    expect(useGame.getState()).toMatchObject({ lastResult: null, resultCandidateGameId: '', completedGameId: '' })
  })

  it('does not query history when the member is no longer seated', async () => {
    storage.setItem(key, '7')
    socket.emit('GAME_CONNECTION_STATE', { status: 'LOBBY' })
    await settle()
    expect(historyCalls).toHaveLength(0)
  })

  it('a closed result is not shown again after the next refresh, and leaving the table forgets it', async () => {
    storage.setItem(key, '7')
    seatedLobby()
    await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
    useGame.setState({ lastResult: null, dismissedResult: { gameId: '7', version: 2 } })
    expect(storage.getItem(key)).toBeNull()
    storage.setItem(key, '7')
    socket.emit('TABLE_LEFT', { tableId: table.tableId })
    expect(storage.getItem(key)).toBeNull()
  })

  it('a silent rejection clears the candidate and shows nothing', async () => {
    storage.setItem(key, '7'); socket.resultMode = 'error'
    seatedLobby()
    await vi.waitFor(() => expect(checks()).toHaveLength(1))
    await settle()
    expect(useGame.getState()).toMatchObject({ lastResult: null, resultCandidateGameId: '', completedGameId: '' })
    expect(useSession.getState().error).toBe('')
  })
})

describe('result versions after discovery', () => {
  it('updates PENDING to SETTLED, keeps SETTLED against a late PENDING and absorbs duplicates', async () => {
    storage.setItem(key, '7'); socket.reply = result('7', 1, false)
    seatedLobby()
    await vi.waitFor(() => expect(useGame.getState().lastResult?.settlementStatus).toBe('PENDING'))
    socket.emit('GAME_RESULT', result('7', 2))
    expect(useGame.getState().lastResult).toEqual(result('7', 2))
    socket.emit('GAME_RESULT', result('7', 1, false))
    socket.emit('GAME_RESULT', result('7', 2))
    expect(useGame.getState().lastResult).toEqual(result('7', 2))
    expect(useGame.getState().completedGameId).toBe('7')
  })

  it('never accepts another game\'s result or a late outbox delivery for an unrelated game', async () => {
    storage.setItem(key, '7')
    seatedLobby()
    await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
    socket.emit('GAME_RESULT', result('9', 5))
    expect(useGame.getState().lastResult?.gameSessionId).toBe('7')
    expect(useGame.getState().completedGameId).toBe('7')
  })
})

describe('races between REST, WebSocket and login', () => {
  it('a history response that arrives after a reconnect is discarded', async () => {
    storage.setItem(key, '7')
    const held = deferred<unknown>(); history = () => held.promise
    seatedLobby()
    await vi.waitFor(() => expect(historyCalls).toHaveLength(1))
    const old = socket
    runtime.reconnect()
    await vi.waitFor(() => expect(socket).not.toBe(old))
    held.resolve(historyOf('7'))
    await settle()
    expect([...old.requests, ...socket.requests].filter(r => r.type === 'GAME_RESULT_CHECK')).toHaveLength(0)
    expect(useGame.getState().resultCandidateGameId).toBe('')
  })

  it('a history response that arrives after a new game started is discarded', async () => {
    storage.setItem(key, '7')
    const held = deferred<unknown>(); history = () => held.promise
    seatedLobby()
    await vi.waitFor(() => expect(historyCalls).toHaveLength(1))
    socket.emit('GAME_START_STATE', { ...waiting, revision: 4, phase: 'PLAYING', startAttemptId: 'a', gameSessionId: '8' })
    held.resolve(historyOf('7'))
    await settle()
    expect(checks()).toHaveLength(0)
    expect(useGame.getState()).toMatchObject({ permittedGameId: '8', lastResult: null, resultCandidateGameId: '' })
  })

  it('a result response after a new game started cannot overwrite it', async () => {
    storage.setItem(key, '7'); socket.resultMode = 'hold'
    seatedLobby()
    await vi.waitFor(() => expect(checks()).toHaveLength(1))
    expect(useGame.getState().resultCandidateGameId).toBe('7')
    socket.emit('GAME_START_STATE', { ...waiting, revision: 4, phase: 'PLAYING', startAttemptId: 'a', gameSessionId: '8' })
    socket.emit('GAME_RESULT', result('7'), checks()[0]!.requestId)
    expect(useGame.getState()).toMatchObject({ permittedGameId: '8', result: null, lastResult: null, completedGameId: '' })
  })

  it('a response that arrives after the login changed is discarded', async () => {
    storage.setItem(key, '7')
    const held = deferred<unknown>(); history = () => held.promise
    seatedLobby()
    await vi.waitFor(() => expect(historyCalls).toHaveLength(1))
    useSession.setState({ sessionId: '202' })
    held.resolve(historyOf('7'))
    await settle()
    expect(checks()).toHaveLength(0)
  })

  it('an ended login forgets every hint in the tab', async () => {
    storage.setItem(key, '7'); storage.setItem('ontop.game.result-candidate.v1:202', '9'); storage.setItem('other', 'kept')
    socket.close(4401)
    await vi.waitFor(() => expect(storage.getItem(key)).toBeNull())
    expect(storage.getItem('ontop.game.result-candidate.v1:202')).toBeNull()
    expect(storage.getItem('other')).toBe('kept')
  })
})

describe('tab game hint storage', () => {
  it('is per account, validates stored IDs as decimal strings and tolerates missing storage', () => {
    keepTabGame('101', '9007199254740993')
    expect(readTabGame('101')).toBe('9007199254740993')
    expect(readTabGame('202')).toBe('')
    storage.setItem(key, '7; drop'); expect(readTabGame('101')).toBe('')
    storage.setItem(key, '0'); expect(readTabGame('101')).toBe('')
    keepTabGame('101', ''); expect(storage.getItem(key)).toBeNull()
    vi.stubGlobal('sessionStorage', undefined)
    expect(readTabGame('101')).toBe('')
    expect(() => { keepTabGame('101', '7'); forgetTabGames() }).not.toThrow()
  })

  it('reads only the newest ended own game from a history page and keeps it a string', () => {
    expect(latestEndedGame(historyOf('9007199254740993', '5'))).toBe('9007199254740993')
    expect(latestEndedGame({ items: [], nextCursor: null, hasNext: false })).toBe('')
    expect(() => latestEndedGame({ items: [{ gameSessionId: 7, status: 'FINISHED' }] })).toThrow()
    expect(() => latestEndedGame({ items: [{ gameSessionId: '7', status: 'RUNNING' }] })).toThrow()
    expect(() => latestEndedGame(null)).toThrow()
  })
})

describe('store candidate rules', () => {
  const send = (type: string, payload: object, tableId = 'table-real') =>
    receiveGame({ type, payload, requestId: null } as Envelope, '101', tableId)
  beforeEach(() => resetGame())
  it('a candidate result is not accepted without a seat, by a spectator or over an active game', () => {
    useGame.setState({ resultCandidateGameId: '7' })
    send('GAME_RESULT', result(), '')
    expect(useGame.getState().lastResult).toBeNull()
    useGame.setState({ permittedGameId: '8' })
    send('GAME_RESULT', result())
    expect(useGame.getState()).toMatchObject({ lastResult: null, completedGameId: '' })
    useGame.setState({ permittedGameId: '', completedGameId: '6' })
    send('GAME_RESULT', result())
    expect(useGame.getState()).toMatchObject({ lastResult: null, completedGameId: '6' })
  })
  it('an active start or restore drops the candidate', () => {
    useGame.setState({ resultCandidateGameId: '7' })
    send('GAME_START_STATE', { ...waiting, tableId: 'table-real', phase: 'PLAYING', startAttemptId: 'a', gameSessionId: '8' })
    expect(useGame.getState().resultCandidateGameId).toBe('')
  })
})

describe('MR QA scenarios', () => {
  it('real server order: a refresh during SETTLING keeps the seat and game, then shows the settled result in WAITING', async () => {
    storage.setItem(key, '7'); settlingActivation = true
    runtime.reconnect()
    await vi.waitFor(() => expect(useSession.getState().tables).toHaveLength(1))
    await vi.waitFor(() => expect(useSession.getState().status).toBe('connected'))
    await settle()
    // The pre-join seat, SETTLING and FINISHED snapshot are read with the table list (Story C).
    expect(useSession.getState().tableId).toBe('server-table')
    expect(useGame.getState()).toMatchObject({ recovery: 'FINISHED', permittedGameId: '7', start: { phase: 'SETTLING' } })
    // The seat-scoped push now reaches the current game.
    socket.emit('GAME_RESULT', result('7', 2))
    expect(useGame.getState().lastResult).toEqual(result('7', 2))
    // TableHub.releaseSettledRound: publish(room) then publishStart(tableId).
    socket.emit('TABLE_STATE', { ...table, version: 2 })
    socket.emit('GAME_START_STATE', { ...waiting, revision: 5 })
    expect(useGame.getState()).toMatchObject({ completedGameId: '7', permittedGameId: '', lastResult: result('7', 2) })
    // The result is already known, so history discovery is not needed.
    await settle()
    expect(historyCalls).toHaveLength(0)
  })

  it('a seat broadcast without this table\'s WAITING start state does not restore an unclosable result', async () => {
    storage.setItem(key, '7')
    socket.emit('GAME_START_STATE', notSeated)
    socket.emit('TABLE_STATE', table)
    socket.emit('GAME_CONNECTION_STATE', { status: 'LOBBY' })
    await settle()
    expect(useSession.getState().tableId).toBe('server-table')
    expect(historyCalls).toHaveLength(0)
    socket.emit('GAME_START_STATE', { ...waiting, revision: 5 })
    await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
  })

  it('a reconnect PENDING is not a settlement PENDING: discovery waits for the recovery to resolve', async () => {
    storage.setItem(key, '7')
    seatedLobby('PENDING')
    await settle()
    expect(historyCalls).toHaveLength(0)
    expect(tableBusy()).toBe(true)
    socket.emit('GAME_CONNECTION_STATE', { status: 'LOBBY' })
    await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
  })

  it('retries on the next start revision when history did not list the tab game yet', async () => {
    storage.setItem(key, '7'); history = async () => historyOf('6')
    seatedLobby()
    await vi.waitFor(() => expect(historyCalls).toHaveLength(1))
    // Unrelated table broadcasts in the same revision do not repeat the request.
    socket.emit('TABLE_STATE', { ...table, version: 2 })
    await settle()
    expect(historyCalls).toHaveLength(1)
    history = async () => historyOf('7', '6')
    socket.emit('GAME_START_STATE', { ...waiting, revision: 4 })
    await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
    expect(historyCalls).toHaveLength(2)
  })

  it('never runs two discoveries at once', async () => {
    storage.setItem(key, '7')
    const held = deferred<unknown>(); history = () => held.promise
    seatedLobby()
    await vi.waitFor(() => expect(historyCalls).toHaveLength(1))
    socket.emit('GAME_START_STATE', { ...waiting, revision: 4 })
    await settle()
    expect(historyCalls).toHaveLength(1)
    held.resolve(historyOf('7'))
    await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
    expect(checks()).toHaveLength(1)
  })

  it('a server GAME_RESULT_PENDING for the automatic check stays silent and is retried on the next revision', async () => {
    storage.setItem(key, '7'); socket.resultMode = 'busy'
    seatedLobby()
    await vi.waitFor(() => expect(checks()).toHaveLength(1))
    await settle()
    expect(useSession.getState().error).toBe('')
    expect(useGame.getState()).toMatchObject({ lastResult: null, resultCandidateGameId: '' })
    socket.resultMode = 'reply'
    socket.emit('GAME_START_STATE', { ...waiting, revision: 4 })
    await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
  })

  it('the manual result button cannot overlap the automatic check: it has no game ID until the check succeeds', async () => {
    storage.setItem(key, '7'); socket.resultMode = 'hold'
    seatedLobby()
    await vi.waitFor(() => expect(checks()).toHaveLength(1))
    expect(await runtime.checkResult()).toBe(false)
    expect(checks()).toHaveLength(1)
    socket.emit('GAME_RESULT', result('7'), checks()[0]!.requestId)
    expect(useGame.getState().lastResult?.gameSessionId).toBe('7')
    // Afterwards the manual button re-reads the same game through completedGameId.
    useSession.setState({ error: '' }); socket.resultMode = 'reply'
    expect(await runtime.checkResult()).toBe(true)
    expect(checks().at(-1)?.payload).toEqual({ gameSessionId: '7' })
  })

  it('repeated reconnects restore an unclosed result each time but never a closed one', async () => {
    storage.setItem(key, '7')
    for (let round = 0; round < 2; round++) {
      if (round) { runtime.reconnect(); await vi.waitFor(() => expect(useSession.getState().status).toBe('connected')) }
      seatedLobby()
      await vi.waitFor(() => expect(useGame.getState().lastResult?.gameSessionId).toBe('7'))
    }
    useGame.setState({ lastResult: null, dismissedResult: { gameId: '7', version: 2 } })
    for (let round = 0; round < 2; round++) {
      const calls = historyCalls.length
      runtime.reconnect()
      await vi.waitFor(() => expect(useSession.getState().status).toBe('connected'))
      seatedLobby()
      await settle()
      expect(historyCalls).toHaveLength(calls)
      expect(useGame.getState().lastResult).toBeNull()
    }
  })

  it('a new game replaces the hint, so the previous game is not shown after a later reconnect', async () => {
    storage.setItem(key, '7')
    socket.emit('TABLE_STATE', table)
    socket.emit('GAME_START_STATE', { ...waiting, revision: 4, phase: 'PLAYING', startAttemptId: 'a', gameSessionId: '8' })
    expect(storage.getItem(key)).toBe('8')
    runtime.reconnect()
    await vi.waitFor(() => expect(useSession.getState().status).toBe('connected'))
    seatedLobby()
    await vi.waitFor(() => expect(historyCalls).toHaveLength(1))
    await settle()
    expect(checks()).toHaveLength(0)
    expect(useGame.getState().lastResult).toBeNull()
  })

  it('another account in the same tab never reads the previous account\'s hint', async () => {
    storage.setItem('ontop.game.result-candidate.v1:202', '7')
    seatedLobby()
    await settle()
    expect(historyCalls).toHaveLength(0)
  })
})
