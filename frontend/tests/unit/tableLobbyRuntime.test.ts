import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../src/auth/authFlow'
import type { SocketLike } from '../../src/network/socketClient'
import { avatars, resetWorld, useSession } from '../../src/network/worldClient'
import { TABLES } from '../../src/config'
import { useTableLobby } from '../../src/features/tableLobby/state'
import { ParkRuntime } from '../../src/park/runtime/SpringParkRuntime'
import { useGame } from '../../src/game/store'
import { bridgeState } from '../fixtures/bridge'
import { useFacilityState, useFacilityUseNotice } from '../../src/features/facilities/state'
import { readFileSync } from 'node:fs'
import { parseGame } from '../../src/game/protocol'
import { useForfeit } from '../../src/game/forfeit'
import { useAiFeatures, resetAiFeatures } from '../../src/features/ai/serviceFeatures'
import { useCompanions, type Practice } from '../../src/features/ai/companions'
import { useDisplayGame } from '../../src/game/displayGame'
import { benchAnchors } from '../../src/features/interactions/benchAnchors'
import { benchTable } from '../../src/features/interactions/benchSpectator'
import { useBenchState, resetBenchState } from '../../src/features/interactions/benchState'

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
  joinMode: 'approve' | 'hold' | 'reject' = 'approve'
  requests: { requestId: string; type: string; payload: Record<string, unknown> }[] = []
  lastTable: object = table
  constructor() { socket = this; queueMicrotask(() => { this.readyState = 1; this.onopen?.(new Event('open')); this.emit('CONNECTED', { userId: '101' }) }) }
  emit(type: string, payload: object, requestId: string | null = null) { this.onmessage?.({ data: JSON.stringify({ type, payload, requestId }) } as MessageEvent) }
  approveJoin(requestId: string) {
    this.lastTable = { ...table, seats: table.seats.map((seat, index) => index === 0 ? { ...seat, userId: '101' } : seat) }
    this.emit('TABLE_STATE', this.lastTable, requestId)
  }
  send(data: string) {
    const r = JSON.parse(data); this.requests.push(r)
    queueMicrotask(() => {
      if (r.type === 'CHANNEL_JOIN') this.emit('CHANNEL_STATE', { channelId: 'c', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'] }, r.requestId)
      if (r.type === 'TABLE_WATCH' && this.mode === 'success') this.emit('TABLE_WATCH_STATE', table, r.requestId)
      if (r.type === 'TABLE_WATCH' && this.mode === 'error') this.emit('ERROR', { code: 'TABLE_OUT_OF_RANGE', message: '관전 범위 오류' }, r.requestId)
      if (r.type === 'TABLE_UNWATCH') this.emit('TABLE_WATCH_LEFT', { tableId: table.tableId }, r.requestId)
      if (r.type === 'TABLE_JOIN' && this.joinMode === 'approve') this.approveJoin(r.requestId)
      if (r.type === 'TABLE_JOIN' && this.joinMode === 'reject') this.emit('ERROR', { code: 'TABLE_FULL', message: '빈 좌석이 없습니다.' }, r.requestId)
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
  resetAiFeatures(); resetBenchState()
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
afterEach(async () => { await runtime.stop(); resetAiFeatures();resetBenchState();vi.restoreAllMocks();vi.useRealTimers(); clearAuthSession(); vi.unstubAllGlobals() })
function nearTable() {
  useSession.setState({ mapCompatible: true })
  const [x, y, z] = TABLES[0]!.position, pose = { x, y: y + .8, z: z + 3, yaw: 0 }
  avatars.set('101', { current: pose, previous: pose, at: 0, nickname: '나', color: 0, connected: true,
    moving: false, running: false, swimming: false, emote: '', emoteAt: 0, tableId: '', seatIndex: -1,
    benchId: '', fitnessId: '', fitnessStartedAt: 0, telescopeId: '', telescopeYaw: 0, telescopePitch: 0, followTargetId: '' })
  return TABLES[0]!.id
}
function npcBench() {
  nearTable()
  const bench=benchAnchors.find(b=>benchTable(b.id))!,anchor=benchTable(bench.id)!.id
  const pose=bench.seats[0]
  useAiFeatures.setState({companions:true,loaded:true})
  useSession.setState({benchId:bench.id,watchedTableId:table.tableId,focusedAnchorId:anchor,
    bindings:[{channelId:'c',tableId:table.tableId,anchorId:anchor}]})
  useBenchState.setState({placements:{'101':{channelId:'c',userId:'101',benchId:bench.id,seat:0,pose}}})
  useTableLobby.setState({status:'ready',spectatorRequested:false})
  const practice={name:'강잼민',npcUserId:'9001',difficulty:'EASY',phase:'PLAYING',bet:0,thinking:false,speech:'좋아',speechSource:'FIXED',analysis:{source:'LOCAL',blackEstimate:null,advantage:'UNKNOWN'},analysisNote:'',snapshot:{gameId:'npc-bench',tableId:table.tableId,version:1,blackUserId:102,whiteUserId:9001,turnUserId:102,winnerUserId:null,turnDeadline:null,endedAt:null,endReason:null,board:{board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:0,outcome:'PLAYING',forbiddenMoves:[]}}} as Practice
  const status={actors:[],practice:null,observedPractice:practice,practiceChat:{gameId:practice.snapshot.gameId,version:1,role:'SPECTATOR'},actorVersion:1}
  return {anchor,bench,status}
}
it('bench NPC observation uses the authorized board without GAME_WATCH and exits while retaining the bench',async()=>{
 const {anchor,bench,status}=npcBench()
 vi.spyOn(runtime,'requestJSON').mockResolvedValue(status)
 expect(await runtime.watchBench(anchor,true)).toBe(true)
 expect(useTableLobby.getState().spectatorRequested).toBe(false)
 expect(await runtime.watchBench(anchor)).toBe(true)
 expect(useDisplayGame.getState().game?.role).toBe('SPECTATOR')
 socket.emit('TABLE_WATCH_STATE',table)
 expect(useTableLobby.getState().spectatorRequested).toBe(true)
 expect(useDisplayGame.getState().game?.role).toBe('SPECTATOR')
 expect(socket.requests.some(r=>r.type==='GAME_WATCH')).toBe(false)
 expect(await runtime.unwatchGame()).toBe(true)
 expect(useSession.getState().benchId).toBe(bench.id)
 expect(useDisplayGame.getState().localPractice).toBeNull()
 expect(await runtime.watchBench(anchor)).toBe(true)
})
it.each(['cancel','leave'] as const)('%s rejects a delayed NPC bench observation response',async action=>{
 const {anchor,status}=npcBench()
 let finish!:(value:unknown)=>void
 vi.spyOn(runtime,'requestJSON').mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 const watching=runtime.watchBench(anchor)
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
 if(action==='cancel')await runtime.unwatchGame()
 else useSession.setState({benchId:''})
 finish(status)
 expect(await watching).toBe(false)
 expect(useTableLobby.getState().spectatorRequested).toBe(false)
 expect(useCompanions.getState().observedPractice).toBeNull()
})
it('standing spectator exit releases hidden table focus; a newer inspection survives late cleanup', async () => {
  const anchor = nearTable()
  useSession.setState({ focusedAnchorId: anchor })
  expect(await runtime.unwatchGame()).toBe(true)
  expect(useSession.getState().focusedAnchorId).toBe('')
  useSession.setState({ focusedAnchorId: anchor })
  const exiting = runtime.unwatchGame()
  useSession.setState({ focusedAnchorId: 'new-inspection' })
  expect(await exiting).toBe(true)
  expect(useSession.getState().focusedAnchorId).toBe('new-inspection')
})
it('a waiting broadcast before the forfeit receipt releases the finished game request', async () => {
  const wire = JSON.parse(readFileSync(new URL('../fixtures/alkkagi-forfeit.json', import.meta.url), 'utf8'))
  useSession.setState({tableId:table.tableId,seatIndex:0,mapCompatible:true})
  useGame.setState({game:parseGame(wire.initial.payload,'101'),permittedGameId:wire.initial.payload.gameId,
    recovery:'RESTORED',pending:false,uncertain:false,awaitingVersion:-1,
    start:{...wire.initialStart.payload,tableId:table.tableId}})
  useForfeit.setState({attempt:null})
  const request=runtime.forfeitGame(wire.initial.payload.gameId)
  await vi.waitFor(()=>expect(socket.requests.some(r=>r.type==='GAME_FORFEIT')).toBe(true))
  const sent=socket.requests.find(r=>r.type==='GAME_FORFEIT')!
  socket.emit('GAME_START_STATE',{...wire.waiting.payload,tableId:table.tableId})
  expect(useGame.getState().permittedGameId).toBe('')
  socket.emit('GAME_FORFEIT_RESULT',{...wire.accepted.payload,actionId:sent.payload.actionId},sent.requestId)
  expect(await request).toBe(true)
  expect(useGame.getState().pending).toBe(false)
  expect(useForfeit.getState().attempt?.status).toBe('approved')
})
it('a delayed movement rejection after approved seating cannot become the tablet error', async () => {
  const anchor = nearTable()
  runtime.move(1, 0, false, false)
  await vi.waitFor(() => expect(socket.requests.some(r => r.type === 'WORLD_MOVE')).toBe(true))
  const movement = socket.requests.find(r => r.type === 'WORLD_MOVE')!
  expect(await runtime.joinTable(anchor)).toBe(true)
  socket.emit('ERROR', { code: 'TABLE_BUSY', message: '먼저 테이블에서 퇴장해주세요.' }, movement.requestId)
  await Promise.resolve()
  expect(useSession.getState().error).toBe('')
  expect(useSession.getState().tableId).toBe(table.tableId)
  // A real failure from a different operation must still be visible.
  socket.emit('ERROR', { code: 'TABLE_BUSY', message: '실제 테이블 설정 오류' }, 'configuration-error')
  expect(useSession.getState().error).toBe('실제 테이블 설정 오류')
})
it('a movement rejection while standing still reports a server seating mismatch', async () => {
  nearTable()
  runtime.move(1, 0, false, false)
  await vi.waitFor(() => expect(socket.requests.some(r => r.type === 'WORLD_MOVE')).toBe(true))
  const movement = socket.requests.find(r => r.type === 'WORLD_MOVE')!
  socket.emit('ERROR', { code: 'TABLE_BUSY', message: '먼저 테이블에서 퇴장해주세요.' }, movement.requestId)
  await Promise.resolve()
  expect(useSession.getState().error).toBe('먼저 테이블에서 퇴장해주세요.')
})
it('a facility-blocked table action is temporary guidance and never becomes a persistent session error', async () => {
  const anchor = nearTable()
  useFacilityState.setState({ pending: true })
  expect(await runtime.joinTable(anchor)).toBe(false)
  expect(useFacilityUseNotice.getState().message).toBe('먼저 시설 이용·승인 위치 확인을 마쳐주세요.')
  expect(useSession.getState().error).toBe('')
  expect(socket.requests.some(r => r.type === 'TABLE_JOIN')).toBe(false)
  useFacilityState.setState({ pending: false })
  expect(useFacilityUseNotice.getState().message).toBe('')
})
it('distant seating guidance expires after three seconds and repeated attempts restart its lifetime', async () => {
  const anchor = nearTable(); avatars.get('101')!.current.z += 20
  vi.useFakeTimers()
  expect(await runtime.joinTable(anchor)).toBe(false)
  const message = '테이블 의자 가까이에서 앉기를 눌러주세요.'
  expect(useSession.getState().error).toBe(message)
  await vi.advanceTimersByTimeAsync(1000)
  expect(await runtime.joinTable(anchor)).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  expect(useSession.getState().error).toBe(message)
  await vi.advanceTimersByTimeAsync(1000)
  expect(useSession.getState().error).toBe(message)
  await vi.advanceTimersByTimeAsync(1000)
  expect(useSession.getState().error).toBe('')
  expect(socket.requests.some(r => r.type === 'TABLE_JOIN')).toBe(false)
  expect(useSession.getState().tableId).toBe('')
})
it('server activity guidance expires and an old timer does not erase a connection failure', async () => {
  vi.useFakeTimers()
  socket.emit('ERROR', { code: 'ACTIVITY_BUSY', message: '활동을 종료한 뒤 이동해주세요.' }, 'movement-error')
  expect(useSession.getState().error).toBe('활동을 종료한 뒤 이동해주세요.')
  await vi.advanceTimersByTimeAsync(3000)
  expect(useSession.getState().error).toBe('')
  const anchor = nearTable(); avatars.get('101')!.current.z += 20
  expect(await runtime.joinTable(anchor)).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  socket.emit('ERROR', { code: 'TABLE_BUSY', message: '실제 테이블 설정 오류' }, 'configuration-error')
  await vi.advanceTimersByTimeAsync(2000)
  expect(useSession.getState().error).toBe('실제 테이블 설정 오류')
  expect(await runtime.joinTable(anchor)).toBe(false)
  useSession.setState({ status: 'error', error: '서버 연결을 확인해주세요.' })
  await vi.advanceTimersByTimeAsync(2000)
  expect(useSession.getState().error).toBe('서버 연결을 확인해주세요.')
})
it('direct seating does not inspect or assign a seat until the server approves and blocks duplicate requests', async () => {
  const anchor = nearTable(); socket.joinMode = 'hold'
  const request = runtime.joinTable(anchor)
  await vi.waitFor(() => expect(socket.requests.some(r => r.type === 'TABLE_JOIN')).toBe(true))
  expect(useTableLobby.getState()).toMatchObject({ panelOpen: false, joiningAnchorId: anchor })
  expect(useSession.getState()).toMatchObject({ tableId: '', seatIndex: -1, focusedAnchorId: '' })
  expect(await runtime.joinTable(anchor)).toBe(false)
  const joins = socket.requests.filter(r => r.type === 'TABLE_JOIN')
  expect(joins).toHaveLength(1); expect(joins[0]!.payload).toEqual({ tableId: table.tableId })
  expect(socket.requests.some(r => r.type === 'TABLE_WATCH')).toBe(false)
  socket.approveJoin(joins[0]!.requestId)
  expect(await request).toBe(true)
  expect(useSession.getState()).toMatchObject({ tableId: table.tableId, seatIndex: 0, focusedAnchorId: '' })
  expect(useTableLobby.getState()).toMatchObject({ joiningAnchorId: '', panelOpen: false })
})
it('a full table leaves the player standing, keeps the panel closed and permits an explicit retry', async () => {
  const anchor = nearTable(); socket.joinMode = 'reject'
  expect(await runtime.joinTable(anchor)).toBe(false)
  expect(useSession.getState()).toMatchObject({ tableId: '', seatIndex: -1, focusedAnchorId: '', pending: false })
  expect(useSession.getState().error).toContain('빈 좌석')
  expect(useTableLobby.getState()).toMatchObject({ joiningAnchorId: '', panelOpen: false })
  socket.joinMode = 'approve'; expect(await runtime.joinTable(anchor)).toBe(true)
  expect(socket.requests.filter(r => r.type === 'TABLE_JOIN')).toHaveLength(2)
  expect(socket.requests.some(r => r.type === 'GAME_WATCH')).toBe(false)
})
it('direct seating rejects distant clicks, unknown bindings, and a move from another occupied table', async () => {
  const anchor = nearTable(); avatars.get('101')!.current.x += 100
  expect(await runtime.joinTable(anchor)).toBe(false)
  nearTable(); expect(await runtime.joinTable('missing-anchor')).toBe(false)
  useSession.setState({ mapCompatible: false }); expect(await runtime.joinTable(anchor)).toBe(false)
  useSession.setState({ mapCompatible: true })
  useSession.setState({ tableId: 'another-table' })
  expect(await runtime.joinTable(anchor)).toBe(false)
  expect(socket.requests.some(r => r.type === 'TABLE_JOIN')).toBe(false)
})
it('a timed-out direct request clears its waiting indicator without replay or optimistic seating', async () => {
  const anchor = nearTable(); socket.joinMode = 'hold'
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const request = runtime.joinTable(anchor)
  await vi.waitFor(() => expect(socket.requests.some(r => r.type === 'TABLE_JOIN')).toBe(true))
  await vi.advanceTimersByTimeAsync(8100)
  expect(await request).toBe(false)
  expect(useTableLobby.getState().joiningAnchorId).toBe('')
  expect(useSession.getState()).toMatchObject({ tableId: '', pending: false })
  expect(socket.requests.filter(r => r.type === 'TABLE_JOIN')).toHaveLength(1)
})
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
it('only server selector can select an available game without adding table/user authority', async () => {
  useSession.setState({ tableId: table.tableId, tableStates: { [table.tableId]: table } })
  expect(await runtime.selectGame('DICE', 5, 4000)).toBe(false)
  useSession.setState({ tableStates: { [table.tableId]: { ...table, selectorUserId: '101' } } })
  expect(await runtime.selectGame('DICE', 5, 3000)).toBe(false)
  expect(await runtime.selectGame('LIAR_BRIDGE', 5)).toBe(false)
  expect(socket.requests.some(r => r.type === 'GAME_SELECT')).toBe(false)
  expect(await runtime.selectGame('DICE', 5, 4000)).toBe(true)
  expect(socket.requests.at(-1)?.payload).toEqual({ gameCode: 'DICE', targetScore: 4000, betAmountPerPlayer: 5 })
  expect(await runtime.selectGame('ONE_CARD', 5)).toBe(true)
  expect(socket.requests.filter(r => r.type === 'GAME_SELECT').at(-1)?.payload).toEqual({ gameCode: 'ONE_CARD', betAmountPerPlayer: 5 })
})
it('ordinary mode never guesses a public game ID or sends GAME_WATCH', async () => {
  expect(await runtime.watchGame('guess')).toBe(false)
  expect(socket.requests.some(r => r.type === 'GAME_WATCH')).toBe(false)
})
it('ready confirms the displayed server fee and version; cancellation keeps its original contract', async () => {
  useSession.setState({ tableId: table.tableId, tableStates: { [table.tableId]: { ...table, selectorUserId: '101' } } })
  expect(await runtime.setReady(true)).toBe(false)
  expect(socket.requests.some(r => r.type === 'READY_SET')).toBe(false)
  expect(await runtime.selectGame('OMOK', 5)).toBe(true)
  expect(await runtime.setReady(true)).toBe(true)
  expect(socket.requests.filter(r => r.type === 'READY_SET').at(-1)?.payload).toEqual({ ready: true, betAmountPerPlayer: 5, expectedVersion: 5 })
  expect(await runtime.setReady(false)).toBe(true)
  expect(socket.requests.filter(r => r.type === 'READY_SET').at(-1)?.payload).toEqual({ ready: false })
})
it('blocks ready on a construction game from the server but still permits cancelling ready', async () => {
  for (const gameCode of ['LIAR_BRIDGE']) {
    useSession.setState({ tableId: table.tableId, tableStates: { [table.tableId]: { ...table, gameCode, betAmountPerPlayer: 5 } } })
    const before = socket.requests.length
    expect(await runtime.setReady(true)).toBe(false)
    expect(socket.requests).toHaveLength(before)
    expect(await runtime.setReady(false)).toBe(true)
    expect(socket.requests.at(-1)?.payload).toEqual({ ready: false })
  }
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
