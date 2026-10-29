import { beforeEach, expect, it, vi } from 'vitest'
import { TABLES, tableSeats } from '../../src/config'
import { oneCardCameraPose, oneCardPlayerViewActive } from '../../src/game/onecard/camera'
import { fanPose, flipCandidates, handScope, privateHandLayout } from '../../src/game/onecard/uiState'
import { OneCardPrankEvents, useOneCardPranks, type PrankScope } from '../../src/game/onecard/prankEvents'
import type { Envelope } from '../../src/network/protocol'

let time = 1000
let scope: PrankScope | null
const flip = (patch: Record<string, unknown> = {}): Envelope => ({ type: 'ONECARD_HAND_FLIPPED', requestId: null,
  payload: { gameId: 'g', eventId: '00000000-0000-4000-8000-000000000001', targetUserId: '101', turnCount: 1, count: 2, serverNow: 10_000, ...patch } })
const restored = (patch: Record<string, unknown> = {}): Envelope => ({ type: 'ONECARD_HAND_RESTORED', requestId: null,
  payload: { ...flip().payload, eventId: '00000000-0000-4000-8000-000000000002', effectId: flip().payload.eventId,
    immuneUntil: 12_500, ...patch } })
beforeEach(() => {
  time = 1000
  scope = { key: 'session/g', gameId: 'g', ownId: '101', role: 'PLAYER', turnUserId: '101', turnCount: 1,
    canSend: false, canRestore: true, handIds: ['hearts-4', 'hearts-K', 'spades-3'], protectedId: 'hearts-K' }
  useOneCardPranks.setState({ scope: '', enabled: false, effect: null, flippedIds: [], pending: false, error: '', usedTurn: '', immune: {} }, true)
})
function client(enabled = true) {
  const request = vi.fn(async (_type: string, payload: Record<string, unknown>) => restored({ eventId: payload.eventId, effectId: payload.effectId }))
  return { events: new OneCardPrankEvents({ enabled, scope: () => scope, request, now: () => time }), request }
}
it('caps flips at two and protects the selected or submitting card, including the last card', () => {
  expect(flipCandidates(scope!.handIds, 'hearts-K', 50)).toEqual(['hearts-4', 'spades-3'])
  expect(flipCandidates(['hearts-K'], 'hearts-K')).toEqual([])
  expect(flipCandidates(['hearts-4'], '')).toEqual(['hearts-4'])
  expect(handScope('a', 'b', 'g', 1)).not.toBe(handScope('a', 'b', 'g', 2))
})
it('flips only the spectator-selected slot without substituting a different card', () => {
  scope = { ...scope!, version: 9 }
  const { events } = client()
  events.accept(flip({ count: 1, cardIndex: 2, handVersion: 9 }))
  expect(useOneCardPranks.getState().flippedIds).toEqual(['spades-3'])
})
it('restores a selected protected slot immediately and never flips its neighbour', () => {
  scope = { ...scope!, version: 9 }
  const { events, request } = client()
  events.accept(flip({ count: 1, cardIndex: 1, handVersion: 9 }))
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
  expect(request).toHaveBeenCalledTimes(1)
})
it('ignores stale, incomplete and out-of-range targeted effects', () => {
  scope = { ...scope!, version: 9 }
  const { events } = client()
  for (const patch of [{ cardIndex: 2, handVersion: 8 }, { cardIndex: 3, handVersion: 9 },
    { cardIndex: -1, handVersion: 9 }, { cardIndex: 1.5, handVersion: 9 }, { cardIndex: 1 }])
    events.accept(flip({ count: 1, ...patch }))
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
  expect(useOneCardPranks.getState().effect).toBeNull()
})
it('sends the public slot and exact version, and rejects an outdated UI selection', async () => {
  scope = { ...scope!, version: 9, role: 'SPECTATOR', ownId: '505', canSend: true }
  const { events, request } = client()
  request.mockImplementationOnce(async (_type, payload) => flip({ ...payload, count: 1 }))
  expect(await events.flip('101', 2, 8)).toBe(false)
  expect(request).not.toHaveBeenCalled()
  expect(await events.flip('101', 2, 9)).toBe(true)
  expect(request.mock.calls[0]![1]).toMatchObject({ cardIndex: 2, handVersion: 9 })
  expect(request.mock.calls[0]![1]).not.toHaveProperty('cardId')
})
it('restores every flipped card synchronously before the ACK and preserves the once-per-turn limit', async () => {
  const { events, request } = client()
  events.accept(flip())
  expect(useOneCardPranks.getState().flippedIds).toEqual(['hearts-4', 'spades-3'])
  const restore = events.restore()
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
  expect(useOneCardPranks.getState().immune['101']).toBe(3500)
  expect(request.mock.calls[0]?.[1]).not.toHaveProperty('cardIds')
  await restore
  events.accept(flip({ eventId: crypto.randomUUID() }))
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
})
it('deduplicates, does not stack or refresh an effect, and ignores foreign or stale turns', () => {
  const { events } = client()
  events.accept(flip({ gameId: 'other' })); events.accept(flip({ turnCount: 0 }))
  expect(useOneCardPranks.getState().effect).toBeNull()
  events.accept(flip({ count: 1 })); events.accept(flip()); events.accept(flip({ eventId: crypto.randomUUID() }))
  expect(useOneCardPranks.getState().flippedIds).toEqual(['hearts-4'])
  expect(useOneCardPranks.getState().effect?.count).toBe(1)
})
it('retains recovery immunity into the next turn and allows a later turn after immunity expires', async () => {
  const { events } = client()
  events.accept(flip()); await events.restore()
  scope = { ...scope!, role: 'SPECTATOR', ownId: '505', canSend: true, turnCount: 2 }
  expect(events.canFlip('101')).toBe(false)
  time = 3501
  expect(events.canFlip('101')).toBe(true)
  events.accept(flip({ turnCount: 2, eventId: crypto.randomUUID() }))
  expect(events.canFlip('101')).toBe(false)
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
})
it('cleans up on turn change, game exit and reconnect without replaying a prior effect', () => {
  const { events } = client()
  events.accept(flip()); scope = { ...scope!, turnCount: 2 }; events.sync()
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
  scope = null; events.sync()
  expect(useOneCardPranks.getState().effect).toBeNull()
  expect(useOneCardPranks.getState().enabled).toBe(false)
})
it('does not send or display anything when the server feature is disabled', async () => {
  const { events, request } = client(false)
  events.accept(flip())
  expect(await events.flip('101')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
})
it('a failed restore cannot hide cards again or poison ordinary game state', async () => {
  const { events, request } = client()
  request.mockRejectedValueOnce(new Error('timeout'))
  events.accept(flip())
  expect(await events.restore()).toBe(false)
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
  expect(useOneCardPranks.getState().error).toBe('timeout')
})
it('a stale restore does not clear a newer effect', () => {
  const { events } = client()
  events.accept(flip())
  events.accept(restored({ effectId: crypto.randomUUID() }))
  expect(useOneCardPranks.getState().flippedIds).toHaveLength(2)
})
it('unsupported server errors disable only the prank channel without retrying', async () => {
  const { events, request } = client()
  scope = { ...scope!, role: 'SPECTATOR', ownId: '505', canSend: true }
  request.mockRejectedValueOnce(Object.assign(new Error('unsupported'), { code: 'ONECARD_PRANK_NOT_CONFIGURED' }))
  expect(await events.flip('101')).toBe(false)
  expect(events.canFlip('101')).toBe(false)
  expect(useOneCardPranks.getState().enabled).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})
it('discards a reply after leaving its scope', async () => {
  const { events, request } = client()
  scope = { ...scope!, role: 'SPECTATOR', ownId: '505', canSend: true }
  let reply!: (value: Envelope) => void
  request.mockImplementationOnce(() => new Promise(resolve => { reply = resolve }))
  const sending = events.flip('101')
  const eventId = request.mock.calls[0]![1].eventId
  scope = null; events.sync(); reply(flip({ eventId }))
  expect(await sending).toBe(false)
  expect(useOneCardPranks.getState().effect).toBeNull()
})
it('automatically restores when every remaining card is selected', async () => {
  const { events, request } = client()
  scope = { ...scope!, handIds: ['hearts-K'] }
  events.accept(flip({ count: 1 }))
  expect(useOneCardPranks.getState().flippedIds).toEqual([])
  expect(request).toHaveBeenCalledTimes(1)
  await Promise.resolve()
})
it('builds a symmetric fan and a seat-centered first-person pose for every table and seat', () => {
  expect(fanPose(0, 1)).toEqual({ angle: 0, lift: 0 })
  expect(fanPose(0, 7).angle).toBe(-fanPose(6, 7).angle)
  for (const anchor of TABLES) for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
    const { position, target } = oneCardCameraPose(anchor, seatIndex), seat = tableSeats(anchor)[seatIndex]!
    expect(position.every(Number.isFinite)).toBe(true)
    expect((position[0] - anchor.position[0]) * seat.x + (position[2] - anchor.position[2]) * seat.z)
      .toBeGreaterThan(seat.x ** 2 + seat.z ** 2)
    expect(target[0]).toBe(anchor.position[0]); expect(target[2]).toBe(anchor.position[2])
    // No lateral shoulder offset: the camera faces the center from the seat's radial line.
    expect((position[0] - anchor.position[0]) * seat.z - (position[2] - anchor.position[2]) * seat.x).toBeCloseTo(0)
  }
  expect(oneCardPlayerViewActive(null)).toBe(false)
})
it('fits every private card on desktop and mobile without unbounded fan drop', () => {
  for (const width of [342, 740, 1060]) for (const count of [1, 7, 17, 39, 54]) {
    const layout = privateHandLayout(count, width, 800)
    expect(layout.cardWidth).toBeGreaterThanOrEqual(40)
    expect(layout.cardWidth + Math.max(0, count - 1) * layout.step).toBeLessThanOrEqual(width - 39)
    for (let i = 0; i < count; i++) {
      const pose = fanPose(i, count)
      expect(Math.abs(pose.angle)).toBeLessThanOrEqual(9); expect(pose.lift).toBeLessThanOrEqual(12)
    }
  }
  expect(privateHandLayout(39, 1060, 800).cardWidth).toBeLessThan(privateHandLayout(7, 1060, 800).cardWidth)
})
