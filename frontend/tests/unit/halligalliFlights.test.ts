import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseHalliGalli, type HalliGalli } from '../../src/game/halligalli/protocol'
import { FLIGHT, flightPhase, installHalliFlights, pileOffset, planFlights, useHalliFlights, type FlightPlan } from '../../src/game/halligalli/flights'
import { FLIGHT_CLEARANCE, HALLI_LAYOUT, faceUpCorners, faceUpPose, flightPose, pileCorners, pilePose, poseCorners, useHalliStage } from '../../src/game/halligalli/anchors'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import { TABLES, tableScale } from '../../src/config'
import { halliPlayer, halliState } from '../fixtures/halligalli'

const AT = Date.parse('2026-11-02T03:00:00Z'), iso = (ms: number) => new Date(ms).toISOString()
const ring = (type: 'RING_SUCCESS' | 'RING_PENALTY', userId: string, cardCount: number, issuedCards = 0, at = AT) =>
  ({ type, userId, at: iso(at), cardCount, issuedCards })
const card = (fruit: string, count: number) => ({ fruit, count })
const player = (i: number, draw: number, face: number, extra: Record<string, unknown> = {}) => halliPlayer(i, {
  drawCount: draw, faceUpCount: face, cardCount: draw + face, topCard: face ? card('BANANA', 2) : null, ...extra })
const out = (i: number, draw: number, face: number, forfeited = false) =>
  player(i, draw, face, { active: false, eliminated: true, forfeited })
const state = (version: number, players: object[], extra: Record<string, unknown> = {}): HalliGalli => parseHalliGalli(
  halliState(players.length, { version, flipSeq: 9, bellWindowId: 9, players, ...extra }))
/** State right after a bell: windows closed, the server's 1s result pause running from the bell. */
const afterSuccess = (version: number, players: object[], e: object) =>
  state(version, players, { lastEvent: e, bellWindowId: null, resultUntil: iso(AT + 1000), flipDeadline: iso(AT + 6000) })

describe('bell success flights', () => {
  const prev = state(4, [player(0, 10, 3, { topCard: card('STRAWBERRY', 2) }), player(1, 12, 2, { topCard: card('STRAWBERRY', 3) })])
  const next = afterSuccess(5, [player(0, 15, 0), player(1, 12, 0)], ring('RING_SUCCESS', '101', 5))
  it('sweeps every face-up pile into the ringer\'s face-down pile as short staggered stacks inside the result pause', () => {
    const plan = planFlights(prev, next, AT + 50)!
    expect(plan.type).toBe('RING_SUCCESS')
    // The seat after the ringer first, then round to the ringer's own pile.
    expect(plan.flights.map(f => [f.from, f.to.userId, f.layer])).toEqual([
      [{ userId: '102', pile: 'face', count: 2 }, '101', 0], [{ userId: '102', pile: 'face', count: 2 }, '101', 1],
      [{ userId: '101', pile: 'face', count: 3 }, '101', 0], [{ userId: '101', pile: 'face', count: 3 }, '101', 1],
      [{ userId: '101', pile: 'face', count: 3 }, '101', 2]])
    expect(plan.flights.map(f => f.card)).toEqual([card('STRAWBERRY', 3), null, card('STRAWBERRY', 2), null, null])
    expect(plan.flights.every(f => f.to.count === 15)).toBe(true)
    expect(plan.flights.reduce((sum, f) => sum + f.weight, 0)).toBe(5)
    // Each pile leaves 40 ms after the previous one; the cards of one pile trail each other by 30 ms.
    const tops = plan.flights.filter(f => f.layer === 0).map(f => f.delay)
    expect(tops.slice(1).map((d, i) => d - tops[i]!)).toEqual([40])
    for (const id of ['101', '102']) {
      const stack = plan.flights.filter(f => f.from.userId === id).map(f => f.delay)
      expect(stack.slice(1).map((d, i) => d - stack[i]!).every(gap => gap === 30)).toBe(true)
    }
    expect(plan.total).toBeGreaterThanOrEqual(450)
    expect(plan.total).toBeLessThanOrEqual(650)
    expect(Math.max(...plan.flights.map(f => f.delay + f.duration))).toBeLessThanOrEqual(plan.total)
  })
  it('shortens to end before the result pause does, and skips when too little of it is left', () => {
    const late = planFlights(prev, next, AT + 600)!
    expect(AT + 600 + late.total).toBeLessThanOrEqual(AT + 1000 - FLIGHT.margin)
    expect(Math.max(...late.flights.map(f => f.delay + f.duration))).toBeLessThanOrEqual(late.total + 1e-9)
    expect(planFlights(prev, next, AT + 700)).toBeNull()
  })
  it('collects forfeited and eliminated players\' piles and caps each pile at three moving cards', () => {
    const before = state(8, [player(0, 9, 1), out(1, 10, 30, true), player(2, 0, 4), player(3, 7, 1)])
    const after = afterSuccess(9, [player(0, 45, 0), out(1, 10, 0, true), out(2, 0, 0), player(3, 7, 0)], ring('RING_SUCCESS', '101', 36))
    const plan = planFlights(before, after, AT)!
    const from = (id: string) => plan.flights.filter(f => f.from.userId === id)
    expect(from('102').map(f => f.weight)).toEqual([28, 1, 1])
    expect(from('103').map(f => f.weight)).toEqual([2, 1, 1])
    expect(from('104')).toHaveLength(1)
    expect(from('101')).toHaveLength(1)
    expect(plan.flights.length).toBeLessThanOrEqual(FLIGHT.slots)
    expect(plan.flights.reduce((sum, f) => sum + f.weight, 0)).toBe(36)
  })
  it('animates a finishing bell in full, there is no pause to fit', () => {
    const finished = parseHalliGalli({ ...halliState(2, { version: 5, players: [player(0, 15, 0), out(1, 0, 0)], lastEvent: ring('RING_SUCCESS', '101', 5) }),
      status: 'FINISHED', turnUserId: null, flipDeadline: null, resultUntil: null, bellWindowId: null,
      winnerUserIds: ['101'], endReason: 'LAST_PLAYER_STANDING', endedAt: iso(AT) })
    const before = state(4, [player(0, 10, 3), player(1, 0, 2)])
    expect(planFlights(before, finished, AT + 100)?.total).toBe(FLIGHT.collect.total)
  })
  it('does not guess: missed versions, other counts, old or repeated bells and other events are not animated', () => {
    expect(planFlights(null, next, AT)).toBeNull()
    expect(planFlights({ ...prev, version: 3 }, next, AT)).toBeNull()
    expect(planFlights(prev, { ...next, lastEvent: ring('RING_SUCCESS', '101', 6) }, AT)).toBeNull()
    expect(planFlights(prev, next, AT + FLIGHT.maxAge + 1)).toBeNull()
    expect(planFlights({ ...prev, lastEvent: next.lastEvent }, next, AT)).toBeNull()
    expect(planFlights(prev, { ...next, lastEvent: { ...next.lastEvent!, type: 'FLIP', cardCount: 1 } }, AT)).toBeNull()
  })
})

describe('wrong bell flights', () => {
  it('pays one card to each other active player, in seat order after the ringer, splitting quickly', () => {
    const prev = state(4, [player(0, 10, 1), player(1, 5, 1), player(2, 8, 1), out(3, 4, 1, true)])
    const next = state(5, [player(0, 11, 1), player(1, 3, 1), player(2, 9, 1), out(3, 4, 1, true)], { lastEvent: ring('RING_PENALTY', '102', 2) })
    const plan = planFlights(prev, next, AT)!
    expect(plan.flights.map(f => [f.kind, f.from, f.to])).toEqual([
      ['penalty', { userId: '102', pile: 'draw', count: 5 }, { userId: '103', count: 9 }],
      ['penalty', { userId: '102', pile: 'draw', count: 4 }, { userId: '101', count: 11 }]])
    expect(plan.flights.map(f => f.delay)).toEqual([0, 40])
    expect(plan.total).toBeGreaterThanOrEqual(350)
    expect(plan.total).toBeLessThanOrEqual(500)
    expect(Math.max(...plan.flights.map(f => f.delay + f.duration))).toBe(plan.total)
  })
  it('shows a short shortage as cards paid from the pile, then new cards from the bell, and the ringer out', () => {
    const prev = state(4, [player(0, 10, 1), player(1, 1, 1), player(2, 8, 1)])
    const next = state(5, [player(0, 11, 1), out(1, 0, 1), player(2, 9, 1)], { lastEvent: ring('RING_PENALTY', '102', 2, 1), issuedPenaltyCards: 1 })
    const plan = planFlights(prev, next, AT)!
    expect(plan.flights.map(f => [f.kind, f.from.pile, f.to.userId])).toEqual([['penalty', 'draw', '103'], ['issued', 'bell', '101']])
    // The server paid and issued exactly this way, or it is not animated.
    expect(planFlights(prev, { ...next, players: [next.players[0]!, prev.players[1]!, next.players[2]!] }, AT)).toBeNull()
    expect(planFlights(prev, { ...next, lastEvent: ring('RING_PENALTY', '102', 3, 1) }, AT)).toBeNull()
    expect(planFlights(prev, { ...next, players: [{ ...next.players[0]!, drawCount: 12 }, next.players[1]!, next.players[2]!] }, AT)).toBeNull()
  })
  it('lets the bell card fade in before it moves; pile cards are part of their pile until they leave', () => {
    const prev = state(4, [player(0, 3, 1), player(1, 0, 1)])
    const next = state(5, [player(0, 4, 1), out(1, 0, 1)], { lastEvent: ring('RING_PENALTY', '102', 1, 1), issuedPenaltyCards: 1 })
    const [issued] = planFlights(prev, next, AT)!.flights
    expect(flightPhase(issued!, -1)).toBeNull()
    expect(flightPhase(issued!, 20)!.t).toBe(0)
    expect(flightPhase(issued!, 20)!.appear).toBeGreaterThan(0)
    expect(flightPhase(issued!, 20)!.appear).toBeLessThan(1)
    expect(flightPhase(issued!, 300)!.appear).toBe(1)
    expect(flightPhase(issued!, issued!.duration)).toBeNull()
  })
})

describe('piles while cards are in the air', () => {
  it('keep what has not left and lack what has not landed, then match the server', () => {
    const prev = state(4, [player(0, 10, 3), player(1, 12, 2)])
    const plan = planFlights(prev, afterSuccess(5, [player(0, 15, 0), player(1, 12, 0)], ring('RING_SUCCESS', '101', 5)), AT)!
    expect(pileOffset(plan, 0, '101')).toEqual({ draw: -5, face: 3 })
    // 102's top card leaves at once, the one under it 30 ms later.
    expect(pileOffset(plan, 0, '102')).toEqual({ draw: 0, face: 1 })
    expect(pileOffset(plan, 45, '102')).toEqual({ draw: 0, face: 0 })
    expect(pileOffset(plan, plan.total, '101')).toEqual({ draw: 0, face: 0 })
    const penalty = planFlights(prev, state(5, [player(0, 11, 3), player(1, 11, 2)], { lastEvent: ring('RING_PENALTY', '102', 1) }), AT)!
    expect(pileOffset(penalty, -1, '102')).toEqual({ draw: 1, face: 0 })
    expect(pileOffset(penalty, 0, '102')).toEqual({ draw: 0, face: 0 })
    expect(pileOffset(penalty, 0, '101')).toEqual({ draw: -1, face: 0 })
    expect(pileOffset(null, 0, '101')).toEqual({ draw: 0, face: 0 })
  })
  it('collected stacks wait on their pile until they leave; landed cards are drawn by the pile, not the flight', () => {
    const plan = planFlights(state(4, [player(0, 10, 3), player(1, 12, 2)]),
      afterSuccess(5, [player(0, 15, 0), player(1, 12, 0)], ring('RING_SUCCESS', '101', 5)), AT)!
    const last = plan.flights.at(-1)!
    expect(flightPhase(last, 0)).toEqual({ appear: 1, t: 0 })
    expect(flightPhase(last, last.delay + last.duration / 2)!.t).toBeGreaterThan(.5)
    expect(flightPhase(last, last.delay + last.duration)).toBeNull()
  })
})

describe('flight path on the table', () => {
  const anchor = TABLES[0]!
  it('starts on the old stack top, ends on the target pile top and turns between seats without folding the card', () => {
    const from = faceUpPose(anchor, 0, 3), to = pilePose(anchor, 2, 15)
    expect(poseCorners(anchor, flightPose(from, to, 0))).toEqual(faceUpCorners(anchor, 0, 3))
    poseCorners(anchor, flightPose(from, to, 1)).forEach((c, i) => c.forEach((v, j) => expect(v).toBeCloseTo(pileCorners(anchor, 2, 15)[i]![j]!, 9)))
    const mid = poseCorners(anchor, flightPose(from, to, .5)), width = Math.hypot(mid[1]![0] - mid[0]![0], mid[1]![2] - mid[0]![2])
    expect(width).toBeCloseTo(HALLI_LAYOUT.card.w * tableScale(anchor), 6)
    expect(mid[0]![1]).toBeGreaterThan(Math.max(faceUpCorners(anchor, 0, 3)[0]![1], pileCorners(anchor, 2, 15)[0]![1]) + .03)
  })
  it('slides round the bell instead of through it, and keeps short paths straight', () => {
    const from = faceUpPose(anchor, 0, 3), to = faceUpPose(anchor, 2, 3)
    for (let i = 0; i <= 20; i++) {
      const p = flightPose(from, to, i / 20), straight = Math.hypot(from.x + (to.x - from.x) * i / 20, from.z + (to.z - from.z) * i / 20)
      expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(Math.min(straight, FLIGHT_CLEARANCE) - .03)
    }
    const near = faceUpPose(anchor, 0, 3), own = pilePose(anchor, 0, 10), half = flightPose(near, own, .5)
    expect(half.x).toBeCloseTo((near.x + own.x) / 2, 9)
    expect(half.z).toBeCloseTo((near.z + own.z) / 2, 9)
  })
})

describe('bell watcher', () => {
  const push = (publicState: object, version: number, type = 'GAME_STATE') => receiveGame(type === 'GAME_STATE'
    ? { type, requestId: null, payload: { gameId: 'halli', version, role: 'PLAYER', publicState, privateState: {} } }
    : { type, requestId: null, payload: { status: 'RESTORED', gameId: 'halli', version, state: { publicState, privateState: {} } } }, '101', 't')
  const now = () => Date.now()
  const before = () => halliState(2, { version: 4, players: [player(0, 10, 3), player(1, 12, 2)] })
  const success = (version = 5) => halliState(2, { version, flipSeq: 9, bellWindowId: null, players: [player(0, 15, 0), player(1, 12, 0)],
    lastEvent: ring('RING_SUCCESS', '101', 5, 0, now()), resultUntil: iso(now() + 1000), flipDeadline: iso(now() + 6000) })
  let uninstall = () => {}
  beforeEach(() => { resetGame(); useHalliFlights.setState({ gameId: null, plan: null, startedAt: 0 }); uninstall = installHalliFlights() })
  afterEach(() => { uninstall(); useHalliStage.setState({ projected: false }) })
  const plan = () => useHalliFlights.getState().plan

  it('plays a live bell once, keeps it through later states and never replays it', () => {
    push(before(), 4, 'GAME_CONNECTION_STATE')
    expect(plan()).toBeNull()
    const bell = success()
    push(bell, 5)
    const first: FlightPlan | null = plan(), started = useHalliFlights.getState().startedAt
    expect(first?.type).toBe('RING_SUCCESS')
    push({ ...bell }, 5)
    push({ ...bell, version: 6, lastEvent: { ...bell.lastEvent, type: 'FLIP', userId: '101', cardCount: 1 }, resultUntil: null,
      players: [player(0, 14, 1), player(1, 12, 0)], bellWindowId: 10, flipSeq: 10 }, 6)
    expect(plan()).toBe(first)
    expect(useHalliFlights.getState().startedAt).toBe(started)
  })
  it('does not play a bell found on joining, restoring after a gap or after missed versions', () => {
    push(success(9), 9, 'GAME_CONNECTION_STATE')
    expect(plan()).toBeNull()
    resetGame()
    push(before(), 4, 'GAME_CONNECTION_STATE')
    push(success(7), 7)
    expect(plan()).toBeNull()
    expect(useGame.getState().game?.halli?.version).toBe(7)
  })
  it('a newer bell replaces running flights; a layout switch ends them', () => {
    push(before(), 4, 'GAME_CONNECTION_STATE')
    push(success(), 5)
    expect(plan()).not.toBeNull()
    useHalliStage.setState({ projected: true })
    expect(plan()).toBeNull()
  })
})
