import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gamePlayers, gameState, parseGame, parseResult } from '../../src/game/protocol'
import { parseHalliGalli } from '../../src/game/halligalli/protocol'
import { canFlipHalli, canRingHalli, classifyHalliError, halliRingMark, markHalliRing, resetHalliUI, seatSlots,
  useHalliUI } from '../../src/game/halligalli/actions'
import { flipTimer } from '../../src/game/halligalli/timer'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import { turnOwner } from '../../src/audio/sfxEvents'
import { parseGameReaction } from '../../src/game/presentation/defeat'
import { parseParkDebris } from '../../src/features/parkDebris/state'
import { parseHistory, parseStats } from '../../src/features/gameHistory/service'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { ServerError } from '../../src/network/socketClient'
import { ParkRuntime } from '../../src/park/runtime/runtime'
import { HalliTable } from '../../src/game/halligalli/HalliTable'
import { HALLI_CAMERA, halliCameraPose, halliPlayerViewActive, halliSpectatorCameraPose, halliSpectatorViewActive,
  halliSpectatorYaw } from '../../src/game/halligalli/camera'
import { ONECARD_CAMERA, oneCardCameraPose, oneCardSpectatorCameraPose } from '../../src/game/onecard/camera'
import { TABLES, tableSeats } from '../../src/config'
import { CardBack, FruitCard } from '../../src/game/halligalli/FruitCard'
import { FRUIT_LAYOUT, FRUIT_SCALE } from '../../src/game/halligalli/FruitArt'
import { FRUITS } from '../../src/game/halligalli/protocol'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { halliFinished, halliPlayer, halliState } from '../fixtures/halligalli'

const restore = (state: object = halliState(), version = 4) => receiveGame({ type: 'GAME_CONNECTION_STATE', requestId: null,
  payload: { status: 'RESTORED', gameId: 'halli', version, state: { publicState: state, privateState: {} } } }, '101', 't')
const push = (state: object, version: number) => receiveGame({ type: 'GAME_STATE', requestId: null,
  payload: { gameId: 'halli', version, role: 'PLAYER', publicState: state, privateState: {} } }, '101', 't')
beforeEach(() => { resetGame(); resetHalliUI() })

describe('publicState parsing', () => {
  it.each([2, 3, 4])('parses %i players and rejects inconsistent fields', count => {
    const state = halliState(count)
    expect(parseHalliGalli(state).players.map(p => p.seat)).toEqual(Array.from({ length: count }, (_, i) => i))
    expect(parseHalliGalli({ ...state, bellWindowId: null }).bellWindowId).toBeNull()
    expect(() => parseHalliGalli({ ...state, bellWindowId: 5 })).toThrow()
    expect(() => parseHalliGalli({ ...state, turnUserId: '999' })).toThrow()
    expect(() => parseHalliGalli({ ...state, players: [halliPlayer(0, { cardCount: 9 }), ...state.players.slice(1)] })).toThrow()
    expect(() => parseHalliGalli({ ...state, players: [halliPlayer(0, { topCard: null }), ...state.players.slice(1)] })).toThrow()
    expect(() => parseHalliGalli({ ...state, players: [halliPlayer(0, { topCard: { fruit: 'APPLE', count: 2 } }), ...state.players.slice(1)] })).toThrow()
    expect(() => parseHalliGalli({ ...state, players: [halliPlayer(0, { topCard: { fruit: 'LIME', count: 6 } }), ...state.players.slice(1)] })).toThrow()
    expect(() => parseHalliGalli({ ...state, players: [halliPlayer(0, { forfeited: true }), ...state.players.slice(1)] })).toThrow()
  })
  it('accepts the deadlock, empty piles and finished co-winners', () => {
    const empty = halliPlayer(1, { drawCount: 0, faceUpCount: 0, cardCount: 0, topCard: null, active: false, eliminated: true })
    expect(parseHalliGalli(halliState(2, { turnUserId: null, players: [halliPlayer(0), empty] })).players[1]!.topCard).toBeNull()
    expect(parseHalliGalli(halliFinished(2, ['101', '102'])).winnerUserIds).toEqual(['101', '102'])
    expect(() => parseHalliGalli({ ...halliFinished(), winnerUserIds: [] })).toThrow()
    expect(() => parseHalliGalli({ ...halliFinished(), bellWindowId: 4 })).toThrow()
  })
  it('joins the shared union, wrapped recovery, live state and spectator view', () => {
    const game = parseGame({ gameId: 'halli', version: 4, role: 'SPECTATOR', publicState: halliState(3), privateState: {} }, '505')
    expect(game.halli?.gameCode).toBe('HALLI_GALLI')
    expect(gamePlayers(game)).toEqual(['101', '102', '103'])
    expect(gameState(game).status).toBe('PLAYING')
    expect(() => parseGame({ gameId: 'halli', version: 4, role: 'PLAYER', publicState: halliState(), privateState: { x: 1 } }, '101')).toThrow()
    restore()
    expect(useGame.getState()).toMatchObject({ recovery: 'RESTORED', permittedGameId: 'halli', error: '' })
    expect(useGame.getState().game?.halli?.bellWindowId).toBe(4)
    push(halliState(2, { version: 5, flipSeq: 5, bellWindowId: 5 }), 5)
    expect(useGame.getState().game?.halli?.bellWindowId).toBe(5)
    expect(parseResult({ gameSessionId: '7', version: 2, gameCode: 'HALLI_GALLI', status: 'FINISHED', endReason: 'CARD_COUNT',
      settlementStatus: 'SETTLED', betAmountPerPlayer: 5, endedAt: new Date().toISOString(), myCoinDelta: 5,
      participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'LOSE' }] }, '101').gameCode).toBe('HALLI_GALLI')
  })
})

describe('action gates', () => {
  it('flips only on own turn after the result pause; spectators and eliminated players never act', () => {
    restore()
    expect(canFlipHalli('101')).toBe(true)
    expect(canFlipHalli('102')).toBe(false)
    const pausedUntil = new Date(Date.now() + 800).toISOString()
    restore(halliState(2, { resultUntil: pausedUntil }), 5)
    expect(canFlipHalli('101')).toBe(false)
    expect(canFlipHalli('101', Date.parse(pausedUntil))).toBe(true)
    useGame.setState({ pending: true })
    expect(canFlipHalli('101', Date.parse(pausedUntil))).toBe(false)
    useGame.setState({ pending: false, awaitingVersion: 6 })
    expect(canFlipHalli('101', Date.parse(pausedUntil))).toBe(false)
    resetGame()
    useGame.setState({ watchedGameId: 'halli' })
    receiveGame({ type: 'GAME_STATE', requestId: null, payload: { gameId: 'halli', version: 4, role: 'SPECTATOR',
      publicState: halliState(), privateState: {} } }, '505', 't')
    expect(canFlipHalli('505')).toBe(false)
    expect(canRingHalli('505', 4)).toBe(false)
  })
  it('rings only the shown window, once per window, and not while the result is uncertain', () => {
    restore()
    expect(canRingHalli('102', 4)).toBe(true)
    expect(canRingHalli('102', 3)).toBe(false)
    useGame.setState({ pending: true })
    expect(canRingHalli('102', 4)).toBe(true)
    markHalliRing('halli', 4, 'sent')
    expect(canRingHalli('102', 4)).toBe(false)
    // A later window and a later game start fresh; the blocked window is kept for the game.
    push(halliState(2, { flipSeq: 5, bellWindowId: 5 }), 5)
    expect(canRingHalli('102', 5)).toBe(true)
    expect(halliRingMark('halli', 4)).toBe('sent')
    useGame.setState({ uncertain: true })
    expect(canRingHalli('102', 5)).toBe(false)
    useGame.setState({ uncertain: false })
    restore(halliState(2, { bellWindowId: null }), 6)
    expect(canRingHalli('102', 5)).toBe(false)
    const out = halliPlayer(1, { active: false, eliminated: true, forfeited: true })
    restore(halliState(2, { flipSeq: 6, bellWindowId: 6, players: [halliPlayer(0), out] }), 7)
    expect(canRingHalli('102', 6)).toBe(false)
  })
  it('classifies late bells and auto-flip races as quiet, known rejections as definite, the rest as uncertain', () => {
    expect(classifyHalliError('ring', 'GAME_ACTION_STALE_VERSION').kind).toBe('quiet')
    expect(classifyHalliError('flip', 'GAME_ACTION_STALE_VERSION').kind).toBe('quiet')
    expect(classifyHalliError('flip', 'GAME_ACTION_NOT_YOUR_TURN').kind).toBe('quiet')
    expect(classifyHalliError('ring', 'GAME_ACTION_INVALID_ACTION').kind).toBe('rejected')
    expect(classifyHalliError('ring', 'GAME_ACTION_NOT_ACTIVE').kind).toBe('rejected')
    expect(classifyHalliError('ring', 'GAME_ACTION_PENDING').kind).toBe('rejected')
    expect(classifyHalliError('ring', 'GAME_ACTION_ACTION_ID_CONFLICT').kind).toBe('uncertain')
    expect(classifyHalliError('flip', null).kind).toBe('uncertain')
  })
  it('places the viewer at the bottom and the rest in seat order; spectators keep seat 0 at the bottom', () => {
    expect(seatSlots(parseHalliGalli(halliState(2)), '102')).toEqual(['top', 'bottom'])
    expect(seatSlots(parseHalliGalli(halliState(3)), '102')).toEqual(['right', 'bottom', 'left'])
    expect(seatSlots(parseHalliGalli(halliState(4)), '103')).toEqual(['top', 'right', 'bottom', 'left'])
    expect(seatSlots(parseHalliGalli(halliState(4)), '505')).toEqual(['bottom', 'left', 'top', 'right'])
  })
})

describe('numberless flip timer', () => {
  it('follows the server deadline, holds full during the result pause and never flips locally', () => {
    const now = Date.parse('2026-11-01T00:00:00Z')
    const h = parseHalliGalli(halliState(2, { flipDeadline: '2026-11-01T00:00:04Z' }))
    expect(flipTimer(h, now)).toEqual({ phase: 'running', fraction: .8 })
    expect(flipTimer(h, now + 4000)).toEqual({ phase: 'waiting', fraction: 0 })
    const paused = parseHalliGalli(halliState(2, { resultUntil: '2026-11-01T00:00:01Z', flipDeadline: '2026-11-01T00:00:06Z' }))
    expect(flipTimer(paused, now)).toEqual({ phase: 'paused', fraction: 1 })
    expect(flipTimer(paused, now + 1000)).toEqual({ phase: 'running', fraction: 1 })
    expect(flipTimer(paused, now + 3500).fraction).toBeCloseTo(.5)
    expect(flipTimer(parseHalliGalli(halliFinished()), now).phase).toBe('idle')
  })
})

describe('shared registrations stay parseable with HALLI_GALLI', () => {
  it('sound cues, defeat reactions, park debris and game history accept the new game', () => {
    restore()
    expect(turnOwner(useGame.getState().game!)).toBe('101')
    restore(halliState(2, { turnUserId: null }), 5)
    expect(turnOwner(useGame.getState().game!)).toBeNull()
    const at = new Date().toISOString()
    expect(parseGameReaction({ eventId: 'e1', gameId: 'halli', tableId: 't', channelId: 'c', userId: '101', gameCode: 'HALLI_GALLI',
      version: 3, kind: 'DEFEAT', remainingBefore: 3, participantCount: 3, motion: 'head-clutch', durationMs: 3600, occurredAt: at }).gameCode)
      .toBe('HALLI_GALLI')
    const debris = { id: 'd1', gameId: 'halli', tableId: 't', anchorId: 'a', userId: '101', gameCode: 'HALLI_GALLI', occurredAt: at,
      throwYaw: 0, seed: 1, parts: ['board', 'coin-0', 'coin-1'] }
    expect(parseParkDebris({ channelId: 'c', mapVersion: 'm', version: 1, items: [debris] }).items[0]!.gameCode).toBe('HALLI_GALLI')
    expect(() => parseParkDebris({ channelId: 'c', mapVersion: 'm', version: 1, items: [{ ...debris, parts: ['card-0'] }] })).toThrow()
    const page = parseHistory({ items: [{ gameSessionId: '9', gameCode: 'HALLI_GALLI', status: 'FINISHED', myResult: 'WIN',
      settlementStatus: 'SETTLED', endedAt: at }, { gameSessionId: '8', gameCode: 'OMOK', status: 'FINISHED', myResult: 'LOSE',
      settlementStatus: 'SETTLED', endedAt: at }], nextCursor: null, hasNext: false })
    expect(page.items.map(item => item.gameCode)).toEqual(['HALLI_GALLI', 'OMOK'])
    const stat = (gameCode: string) => ({ gameCode, played: 1, wins: 1, losses: 0, forfeits: 0, draws: 0 })
    expect(parseStats({ items: ['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'HALLI_GALLI'].map(stat) })
      .map(s => s.gameCode)).toContain('HALLI_GALLI')
  })
})

describe('card art', () => {
  it('places 1~5 fruits like the physical cards and keeps them inside the card', () => {
    expect(Object.keys(FRUIT_LAYOUT).map(Number)).toEqual([1, 2, 3, 4, 5])
    // Rough fruit extents around (0,0) before scaling: half width, top, bottom.
    const extent = { STRAWBERRY: [15.5, 23, 18.5], BANANA: [14, 22, 21], LIME: [17, 14, 14], PLUM: [16, 22, 18] } as const
    for (const [count, spots] of Object.entries(FRUIT_LAYOUT)) {
      expect(spots).toHaveLength(Number(count))
      for (const fruit of FRUITS) {
        const [w, top, bottom] = extent[fruit], s = FRUIT_SCALE[fruit]
        for (const [x, y] of spots) { expect(x - w * s).toBeGreaterThan(1); expect(x + w * s).toBeLessThan(99)
          expect(y - top * s).toBeGreaterThan(1); expect(y + bottom * s).toBeLessThan(149) }
      }
    }
    expect(FRUIT_LAYOUT[1]).toEqual([[50, 75]])
    expect(FRUIT_LAYOUT[5]).toContainEqual([50, 75])
  })
  it.each(FRUITS.flatMap(fruit => [1, 2, 3, 4, 5].map(count => [fruit, count] as const)))('draws %s × %i as that many fruits', (fruit, count) => {
    const svg = renderToStaticMarkup(createElement(FruitCard, { card: { fruit, count } }))
    expect(svg).toContain(`data-fruit="${fruit}"`)
    expect(svg.match(/transform="translate\(/g)).toHaveLength(count)
  })
  it('draws the pink line-art back with unique clip ids', () => {
    const svg = renderToStaticMarkup(createElement('div', null, createElement(CardBack), createElement(CardBack)))
    const clips = [...svg.matchAll(/clipPath id="([^"]+)"/g)].map(m => m[1])
    expect(new Set(clips).size).toBe(2)
    expect(svg).toContain('hg-back-paper')
  })
})

describe('table rendering', () => {
  const html = (viewerId: string, props: { canFlip?: boolean; canRing?: boolean } = {}, state: object = halliState(4)) =>
    renderToStaticMarkup(createElement(HalliTable, { halli: parseHalliGalli(state), gameId: 'halli', viewerId,
      names: { '101': '나', '102': '둘', '103': '셋', '104': '넷' }, canFlip: false, canRing: false, onFlip: () => {}, onRing: () => {}, ...props }))
  it('shows face-down counts, top fruit cards, the bell and only the own flip button on the own turn', () => {
    const own = html('101', { canFlip: true, canRing: true })
    expect(own).toContain('data-slot="bottom"')
    expect(own).toContain('내 뒷면 카드 13장 · 눌러서 공개')
    expect(own.match(/aria-label="바나나 2개"/g)).toHaveLength(4)
    expect(own).toContain('종 치기 (Space)')
    expect(own).not.toMatch(/<button[^>]*class="hg-bell"[^>]*disabled/)
    const viewer = html('505')
    expect(viewer).not.toContain('눌러서 공개')
    expect(viewer).toMatch(/<button[^>]*class="hg-bell"[^>]*disabled/)
  })
  it('marks forfeited and eliminated seats and the last bell chance', () => {
    const players = [halliPlayer(0, { active: false, eliminated: true, forfeited: true }),
      halliPlayer(1, { active: false, eliminated: true, drawCount: 0, faceUpCount: 0, cardCount: 0, topCard: null }), halliPlayer(2)]
    const out = html('103', {}, halliState(3, { turnUserId: null, players }))
    expect(out).toContain('data-out="forfeited"')
    expect(out).toContain('data-out="eliminated"')
    expect(out).toContain('마지막 종 기회')
  })
})

describe('table camera', () => {
  const pitch = (position: readonly number[], target: readonly number[]) =>
    Math.atan2(position[1]! - target[1]!, Math.hypot(position[0]! - target[0]!, position[2]! - target[2]!))
  it('sits behind every physical seat, higher and steeper than ONE_CARD, looking at the table centre', () => {
    for (const anchor of TABLES) for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
      const halli = halliCameraPose(anchor, seatIndex), onecard = oneCardCameraPose(anchor, seatIndex), seat = tableSeats(anchor)[seatIndex]!
      expect([...halli.position, ...halli.target].every(Number.isFinite)).toBe(true)
      expect((halli.position[0] - anchor.position[0]) * seat.x + (halli.position[2] - anchor.position[2]) * seat.z)
        .toBeGreaterThan(seat.x ** 2 + seat.z ** 2)
      expect([halli.target[0], halli.target[2]]).toEqual([anchor.position[0], anchor.position[2]])
      expect(halli.position[1]).toBeGreaterThan(onecard.position[1])
      expect(pitch(halli.position, halli.target)).toBeGreaterThan(pitch(onecard.position, onecard.target))
      expect(pitch(halli.position, halli.target)).toBeLessThan(Math.PI / 3)
    }
    expect(HALLI_CAMERA.eyeHeight).toBeGreaterThan(ONECARD_CAMERA.eyeHeight)
  })
  it('pulls back on narrow screens instead of cropping the side seats', () => {
    const anchor = TABLES[0]!, wide = halliCameraPose(anchor, 0, 16 / 9), narrow = halliCameraPose(anchor, 0, 390 / 844)
    const flat = (p: readonly number[]) => Math.hypot(p[0]! - anchor.position[0], p[2]! - anchor.position[2])
    expect(flat(narrow.position)).toBeGreaterThan(flat(wide.position))
    expect(halliCameraPose(anchor, 0, 2.4)).toEqual(wide)
  })
  it('switches on only for a seated playing player who is not looking around, and for a watching spectator', () => {
    const player = parseGame({ gameId: 'halli', version: 4, role: 'PLAYER', publicState: halliState(), privateState: {} }, '101')
    const spectator = parseGame({ gameId: 'halli', version: 4, role: 'SPECTATOR', publicState: halliState(), privateState: {} }, '505')
    const finished = parseGame({ gameId: 'halli', version: 9, role: 'PLAYER', publicState: halliFinished(), privateState: {} }, '101')
    expect(halliPlayerViewActive(player, true, false)).toBe(true)
    expect(halliPlayerViewActive(player, true, true)).toBe(false)
    expect(halliPlayerViewActive(player, false, false)).toBe(false)
    expect(halliPlayerViewActive(finished, true, false)).toBe(false)
    expect(halliPlayerViewActive(spectator, true, false)).toBe(false)
    expect(halliSpectatorViewActive(spectator, true)).toBe(true)
    expect(halliSpectatorViewActive(spectator, false)).toBe(false)
    expect(halliSpectatorViewActive(player, true)).toBe(false)
    expect(halliPlayerViewActive(null, true, false)).toBe(false)
  })
  it('keeps the spectator orbit on a stable seat and only the drag rotates it', () => {
    const anchor = TABLES[0]!
    expect(halliSpectatorYaw(anchor, 1, 0)).toBeCloseTo(Math.atan2(tableSeats(anchor)[1]!.x, tableSeats(anchor)[1]!.z))
    expect(halliSpectatorYaw(anchor, 1, .5) - halliSpectatorYaw(anchor, 1, 0)).toBeCloseTo(.5)
    const pose = halliSpectatorCameraPose(anchor, 0, 0, 16 / 9, 99)
    expect(pose.target).toEqual(oneCardSpectatorCameraPose(anchor, halliSpectatorYaw(anchor, 0, 0), 16 / 9, 99).target)
  })
})

describe('runtime bell queue', () => {
  type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  let runtime: ParkRuntime, sent: { type: string; payload: Record<string, unknown>; done: Deferred }[]
  beforeEach(() => {
    vi.stubGlobal('window', { location: { href: 'http://localhost:5197/park' } })
    runtime = new ParkRuntime()
    sent = []
    const internals = runtime as unknown as Record<string, unknown>
    internals.active = true
    internals.mapAdmission = { allowed: true }
    internals.socket = { connected: true, request: (type: string, payload: Record<string, unknown>) =>
      new Promise((resolve, reject) => { sent.push({ type, payload, done: { resolve, reject } }) }) }
    useSession.setState({ status: 'connected', sessionId: '101' })
    restore()
  })
  afterEach(() => { vi.unstubAllGlobals(); resetWorld() })
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  it('queues one bell behind the own flip and sends it after the answer with the window that was pressed', async () => {
    const flip = runtime.flipHalli()
    await flush()
    expect(sent.map(r => r.payload.input)).toEqual([{ kind: 'flip' }])
    expect(await runtime.ringHalli(4, 4)).toBe(true)
    expect(await runtime.ringHalli(4, 4)).toBe(false)
    expect(halliRingMark('halli', 4)).toBe('queued')
    expect(sent).toHaveLength(1)
    // The flip's new window arrives before its result: the queued bell must keep the pressed window 4.
    push(halliState(2, { turnUserId: '102', flipSeq: 5, bellWindowId: 5 }), 5)
    sent[0]!.done.resolve({})
    await flush()
    expect(sent[1]!.payload).toMatchObject({ gameId: 'halli', expectedVersion: 4, input: { kind: 'ring', bellWindowId: 4 } })
    expect(sent[1]!.payload.actionId).not.toBe(sent[0]!.payload.actionId)
    sent[1]!.done.reject(new ServerError('GAME_ACTION_STALE_VERSION', 'late'))
    expect(await flip).toBe(true)
    expect(useGame.getState()).toMatchObject({ uncertain: false, pending: false })
    expect(useHalliUI.getState().notice).toContain('이미 처리된 종')
    expect(halliRingMark('halli', 4)).toBeUndefined()
  })
  it('drops the queued bell when the flip result is unknown and does not resend anything', async () => {
    const flip = runtime.flipHalli()
    await flush()
    await runtime.ringHalli(4, 4)
    sent[0]!.done.reject(new Error('timeout'))
    expect(await flip).toBe(false)
    await flush()
    expect(sent).toHaveLength(1)
    expect(useGame.getState().uncertain).toBe(true)
    expect(halliRingMark('halli', 4)).toBeUndefined()
  })
  it('keeps an answered bell blocked for its window and reports a busy shared lock instead of dropping silently', async () => {
    const ring = runtime.ringHalli(4, 4)
    await flush()
    sent[0]!.done.resolve({})
    expect(await ring).toBe(true)
    expect(halliRingMark('halli', 4)).toBe('sent')
    expect(await runtime.ringHalli(4, 4)).toBe(false)
    const internals = runtime as unknown as Record<string, unknown>
    internals.actionBusy = true
    push(halliState(2, { flipSeq: 5, bellWindowId: 5 }), 5)
    expect(await runtime.ringHalli(5, 5)).toBe(false)
    expect(useHalliUI.getState().notice).toContain('다른 요청')
    expect(sent).toHaveLength(1)
  })
})
