import { beforeEach, expect, it } from 'vitest'
import { TabletLobbyClient, parseHostTimeout, parseHostWait, useTabletStartStatus } from '../../src/features/tableLobby/TabletLobbyClient'
import { usePreparationPort, type PreparationContext } from '../../src/features/tableLobby/tabletModel'
import { useHostStartWait } from '../../src/features/tableLobby/hostStartWait'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { resetGame } from '../../src/game/store'
import { ServerError } from '../../src/network/socketClient'
import { tableState, type TableState } from '../../src/network/protocol'

const table: TableState = { tableId: 't', version: 3, capacity: 2, minimumPlayers: 2, gameCode: 'OMOK', targetScore: null,
  betAmountPerPlayer: 5, selectorUserId: 'a', allReady: true, selectedPlayers: 2, startMode: 'MANUAL',
  seats: [{ seatNumber: 1, userId: 'a', ready: true }, { seatNumber: 2, userId: 'b', ready: true }] }
const context: PreparationContext = { userId: 'a', channelId: 'park', tableId: 't', expectedVersion: 3 }
const wait = { tableId: 't', epoch: 'room-1', revision: 2, tableVersion: 3, hostUserId: 'a', serverNow: 2000000, expiresAt: 2120000, cancelReason: null }
beforeEach(() => { resetWorld(); resetGame(); useSession.setState({ status: 'connected', sessionId: 'a', roomId: 'park', tableId: 't', seatIndex: 0, tableStates: { t: table } }) })
function setup() {
  const calls: { type: string; payload: Record<string, unknown> }[] = []
  let error: Error | null = null
  const client = new TabletLobbyClient({ connected: () => true,
    action: async job => { try { await job(); return true } catch { return false } },
    request: async (type, payload) => { calls.push({ type, payload }); if (error) throw error
      return { type: type === 'TABLE_CONFIGURE' ? 'TABLE_STATE' : 'GAME_START_STATE', requestId: 'r', payload: { tableId: 't', phase: 'STARTING' } } },
  })
  client.begin()
  return { client, calls, port: usePreparationPort.getState().port!, fail: (next: Error | null) => { error = next } }
}
it('validates manual table selection while keeping AUTO and old servers readable', () => {
  expect(tableState({ ...table }).selectedPlayers).toBe(2)
  expect(tableState({ ...table, selectedPlayers: undefined, startMode: undefined }).startMode).toBeUndefined()
  expect(() => tableState({ ...table, selectedPlayers: 3 })).toThrow()
  expect(() => tableState({ ...table, startMode: 'UNSUPPORTED' })).toThrow()
  const { client, port } = setup()
  expect(port.selectedPlayers(table)).toBe(2)
  expect(port.selectedPlayers({ ...table, startMode: 'AUTO', selectedPlayers: null })).toBeNull()
  client.end()
})
it('configures only the authenticated host and sends exactly the published payload', async () => {
  const { client, calls, port } = setup()
  expect(await port.configure(context, { gameCode: 'DICE', playerCount: 2, betAmountPerPlayer: 5, targetScore: 4000 })).toBe(true)
  expect(calls[0]).toEqual({ type: 'TABLE_CONFIGURE', payload: { gameCode: 'DICE', selectedPlayers: 2, betAmountPerPlayer: 5, targetScore: 4000, expectedVersion: 3 } })
  expect(await port.configure({ ...context, userId: 'b' }, { gameCode: 'OMOK', playerCount: 2, betAmountPerPlayer: 5 })).toBe(false)
  expect(calls).toHaveLength(1)
  client.end()
})
it('reuses an unconfirmed action identity and version, but uses a fresh identity for a later round', async () => {
  const { client, calls, port, fail } = setup()
  fail(new Error('response lost'))
  expect(await port.start(context)).toBe(false); expect(useTabletStartStatus.getState().uncertain).toBe(true)
  fail(null); expect(await port.start(context)).toBe(true)
  expect(calls[0]!.payload).toEqual(calls[1]!.payload)
  client.accept({ type: 'TABLE_STATE', requestId: null, payload: {} })
  client.accept({ type: 'GAME_START_STATE', requestId: null, payload: { tableId: 't', phase: 'PLAYING' } })
  client.accept({ type: 'GAME_START_STATE', requestId: null, payload: { tableId: 't', phase: 'WAITING' } })
  await port.start(context)
  const starts = calls.filter(c => c.type === 'TABLE_START')
  expect(starts[2]!.payload.actionId).not.toBe(starts[0]!.payload.actionId)
  client.end()
})
it('reads uncertain start state without replay and clears definitively rejected requests', async () => {
  const { client, calls, port, fail } = setup()
  fail(new ServerError('NOT_GAME_SELECTOR', 'rejected'))
  expect(await port.start(context)).toBe(false); expect(useTabletStartStatus.getState().uncertain).toBe(false)
  fail(null); await port.start(context)
  expect(calls[1]!.payload.actionId).not.toBe(calls[0]!.payload.actionId)
  await port.recoverStart!(context)
  expect(calls.at(-1)!.type).toBe('GAME_START_CHECK')
  client.end()
})
it('accepts clock refreshes at the same revision and version without extending the deadline', () => {
  const { client } = setup()
  const send = (payload: Record<string, unknown>, type = 'TABLE_HOST_WAIT_STATE') => client.accept({ type, requestId: null, payload })
  send(wait)
  send({ ...wait, serverNow: 2030000 })
  expect(useHostStartWait.getState().snapshot?.serverNow).toBe(2030000)
  expect(useHostStartWait.getState().snapshot?.expiresAt).toBe(wait.expiresAt)
  send({ ...wait, epoch: 'room-2' })
  send({ ...wait, revision: 1000, epoch: 'room-1' })
  expect(useHostStartWait.getState().snapshot?.revision).toBe(2)
  client.end()
})
it('keeps a server timeout receipt after TABLE_LEFT while rejecting malformed packets and other tables', () => {
  const { client } = setup()
  client.accept({ type: 'TABLE_HOST_WAIT_STATE', requestId: null, payload: wait })
  useSession.setState({ tableId: '', tableStates: {} })
  client.accept({ type: 'TABLE_LEFT', requestId: null, payload: { tableId: 't', reason: 'HOST_START_TIMEOUT' } })
  const payload = { ...wait, revision: 3, tableVersion: 6, eventId: 'timeout-1', previousHostUserId: 'a', nextHostUserId: 'b', reason: 'HOST_START_TIMEOUT' }
  client.accept({ type: 'TABLE_HOST_TIMEOUT', requestId: null, payload })
  expect(useHostStartWait.getState().receipt?.nextHostUserId).toBe('b')
  expect(() => parseHostTimeout({ ...payload, reason: 'WINNER' })).toThrow()
  expect(() => parseHostWait({ ...wait, expiresAt: 'later' })).toThrow()
  client.accept({ type: 'TABLE_HOST_TIMEOUT', requestId: null, payload: { ...payload, tableId: 'other' } })
  expect(useHostStartWait.getState().scope?.tableId).toBe('t')
  client.end(); expect(useHostStartWait.getState().scope).toBeNull()
})
it('clears uncertainty when a timed-out host rejoins and does not carry an old timeout notice into gameplay', async () => {
  const { client, port, fail } = setup()
  client.accept({ type: 'TABLE_STATE', requestId: null, payload: {} })
  fail(new Error('lost')); await port.start(context)
  expect(useTabletStartStatus.getState().uncertain).toBe(true)
  useSession.setState({ tableId: '', tableStates: {} })
  client.accept({ type: 'TABLE_LEFT', requestId: null, payload: { tableId: 't', reason: 'HOST_START_TIMEOUT' } })
  expect(useTabletStartStatus.getState().uncertain).toBe(false)
  useSession.setState({ tableId: 't', tableStates: { t: table } })
  client.accept({ type: 'TABLE_STATE', requestId: null, payload: {} })
  expect(useTabletStartStatus.getState().uncertain).toBe(false)
  client.accept({ type: 'TABLE_HOST_TIMEOUT', requestId: null, payload: { ...wait, revision: 3, tableVersion: 6,
    eventId: 'past-timeout', previousHostUserId: 'b', nextHostUserId: 'a', reason: 'HOST_START_TIMEOUT' } })
  client.accept({ type: 'GAME_START_STATE', requestId: null, payload: { tableId: 't', phase: 'PLAYING' } })
  expect(useHostStartWait.getState().dismissedEventId).toBe('past-timeout')
  client.end()
})
