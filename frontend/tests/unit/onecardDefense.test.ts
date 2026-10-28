import { beforeEach, expect, it, vi } from 'vitest'
import { OneCardDefenseEvents, useOneCardDefense } from '../../src/game/onecard/defenseEvents'
import type { PrankScope } from '../../src/game/onecard/prankEvents'
import type { Envelope } from '../../src/network/protocol'
let time = 1000, scope: PrankScope | null
const attemptId = '00000000-0000-4000-8000-000000000001'
const started = (patch: Record<string, unknown> = {}): Envelope => ({ type: 'ONECARD_PRANK_REACH_STARTED', requestId: null, payload: {
  gameId: 'g', eventId: '00000000-0000-4000-8000-000000000002', attemptId, actorUserId: '505', targetUserId: '101', turnCount: 1, serverNow: 10000, resolveAt: 11400, ...patch } })
const blocked = (patch: Record<string, unknown> = {}): Envelope => ({ type: 'ONECARD_PRANK_BLOCKED', requestId: null, payload: {
  ...started().payload, eventId: '00000000-0000-4000-8000-000000000003', serverNow: 10500, blockedUntil: 13500, ...patch } })
beforeEach(() => {
  time = 1000; scope = { key: 'session/g', gameId: 'g', ownId: '101', role: 'PLAYER', turnCount: 1, turnUserId: '101', canSend: false, canRestore: true, handIds: ['hearts-4'], protectedId: '' }
  useOneCardDefense.setState({ scope: '', enabled: false, pending: false, error: '', attempts: [], blocks: {}, lastBlock: null, usedTurn: '' }, true)
})
function client(enabled = true) {
  const request = vi.fn(async (_type: string, payload: Record<string, unknown>, _expected: readonly string[], onId: (id: string) => void) => { onId('request-1'); return blocked({ eventId: payload.eventId }) })
  return { events: new OneCardDefenseEvents({ enabled, scope: () => scope, canReach: () => true, now: () => time, request }), request }
}
it('shows only a validated reach to the correct defender and expires it without locally flipping a hand', () => {
  const { events } = client()
  for (const patch of [{ gameId: 'other' }, { turnCount: 0 }, { targetUserId: '102' }, { resolveAt: 20000 }]) events.accept(started(patch))
  expect(useOneCardDefense.getState().attempts).toHaveLength(0)
  events.accept(started()); events.accept(started())
  expect(useOneCardDefense.getState().attempts).toHaveLength(1)
  expect(useOneCardDefense.getState()).not.toHaveProperty('flippedIds')
  time = 2401; events.sync(); expect(useOneCardDefense.getState().attempts).toHaveLength(0)
  expect(useOneCardDefense.getState().blocks).toEqual({})
})
it('waits for the hit ACK, accepts a delayed approval, and never extends a replayed block', async () => {
  const { events, request } = client(); events.accept(started())
  let reply!: (value: Envelope) => void
  request.mockImplementationOnce((_type, _payload, _expected, onId) => { onId('request-1'); return new Promise(resolve => { reply = resolve }) })
  const hit = events.hit(attemptId), eventId = request.mock.calls[0]![1].eventId
  expect(await events.hit(attemptId)).toBe(false)
  expect(useOneCardDefense.getState().blocks).toEqual({})
  time = 2500; events.sync(); reply(blocked({ eventId }))
  expect(await hit).toBe(true); expect(useOneCardDefense.getState().blocks['505/101']).toBe(5500)
  time = 3000; events.accept(blocked({ eventId: crypto.randomUUID() }))
  expect(useOneCardDefense.getState().blocks['505/101']).toBe(5500)
  expect(Object.keys(request.mock.calls[0]![1]).sort()).toEqual(['attemptId', 'eventId', 'gameId'])
})
it('does not accept unknown, forged-long or mismatched blocks, or submit a hit after its window', async () => {
  const { events, request } = client()
  events.accept(blocked()); expect(useOneCardDefense.getState().lastBlock).toBeNull()
  events.accept(started()); events.accept(blocked({ blockedUntil: 20000 })); events.accept(blocked({ actorUserId: '506' }))
  expect(useOneCardDefense.getState().blocks).toEqual({})
  time = 2500; expect(await events.hit(attemptId)).toBe(false); expect(request).not.toHaveBeenCalled()
})
it('keeps spectator attempts one per turn and blocks only the actor/target pair', () => {
  scope = { ...scope!, ownId: '505', role: 'SPECTATOR', canSend: true, canRestore: false }
  const { events } = client(); expect(events.canReach('101')).toBe(true)
  events.accept(started()); expect(events.canReach('101')).toBe(false)
  events.accept(blocked()); scope = { ...scope!, turnCount: 2 }
  expect(events.canReach('101')).toBe(false)
  time = 4001; expect(events.canReach('101')).toBe(true)
  scope = { ...scope!, ownId: '506' }; expect(events.canReach('101')).toBe(true)
})
it('clears hands and blocks on game exit, ignores late ACKs and sends nothing with the flag off', async () => {
  const { events, request } = client(); events.accept(started())
  let reply!: (value: Envelope) => void
  request.mockImplementationOnce((_type, _payload, _expected, onId) => { onId('request-1'); return new Promise(resolve => { reply = resolve }) })
  const hit = events.hit(attemptId); scope = null; events.sync()
  expect(events.accept({ type: 'ERROR', requestId: 'request-1', payload: { code: 'LATE_ERROR' } })).toBe(true)
  reply(blocked({ eventId: request.mock.calls[0]![1].eventId }))
  expect(await hit).toBe(false); expect(useOneCardDefense.getState().attempts).toEqual([])
  expect(useOneCardDefense.getState().blocks).toEqual({})
  const disabled = client(false); expect(await disabled.events.hit(attemptId)).toBe(false); expect(disabled.request).not.toHaveBeenCalled()
})
