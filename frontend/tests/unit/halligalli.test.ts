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
import { HalliTable, onLastChance } from '../../src/game/halligalli/HalliTable'
import { HALLI_CAMERA, halliCameraPose, halliPlayerViewActive, halliSpectatorCameraPose, halliSpectatorViewActive,
  halliSpectatorYaw } from '../../src/game/halligalli/camera'
import { ONECARD_CAMERA, oneCardCameraPose, oneCardSpectatorCameraPose } from '../../src/game/onecard/camera'
import { TABLES, tableScale, tableSeats } from '../../src/config'
import { HALLI_LAYOUT, bellCentre, faceUpCorners, halliSeatIndices, labelPoint, pileCorners, quadTransform, seatFrame, stackHeight } from '../../src/game/halligalli/anchors'
import { HalliStage } from '../../src/game/halligalli/HalliStage'
import { outsideSheet } from '../../src/game/halligalli/HalliForfeit'
import { ringAllowedBell } from '../../src/game/halligalli/controls'
import { bellLabel } from '../../src/game/halligalli/Bell'
import { parkRuntime } from '../../src/park/runtime/runtime'
import { PerspectiveCamera, Vector3 } from 'three'
import { CardBack, FruitCard } from '../../src/game/halligalli/FruitCard'
import { FRUIT_LAYOUT, FRUIT_SCALE } from '../../src/game/halligalli/FruitArt'
import { FRUITS } from '../../src/game/halligalli/protocol'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { halliFinished, halliPlayer, halliState } from '../fixtures/halligalli'
import { canLeaveEliminatedHalli } from '../../src/game/halligalli/actions'
import { resetForfeit, useForfeit } from '../../src/game/forfeit'

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
    // Two players left and no face-down card on the own turn: only the bell, never a flip.
    restore(halliState(2, { players: [halliPlayer(0, { drawCount: 0, cardCount: 1 }), halliPlayer(1)] }), 6)
    expect(canFlipHalli('101')).toBe(false)
    expect(canRingHalli('101', 4)).toBe(true)
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
  it('names a two-player turn without face-down cards as the last bell chance, for the holder and the others', () => {
    const state = halliState(2, { players: [halliPlayer(0, { drawCount: 0, cardCount: 1 }), halliPlayer(1)] })
    const h = parseHalliGalli(state)
    expect(onLastChance(h, h.players[0]!)).toBe(true)
    expect(onLastChance(h, h.players[1]!)).toBe(false)
    const normal = parseHalliGalli(halliState(2))
    expect(onLastChance(normal, normal.players[0]!)).toBe(false)
    const own = html('101', {}, state)
    expect(own).toContain('나 · 마지막 종 기회')
    expect(own).toContain('data-kind="turn">마지막 종 기회')
    expect(own).not.toContain('공개 차례')
    expect(own).toMatch(/<button[^>]*class="hg-draw"[^>]*disabled/)
    expect(html('102', {}, state)).toContain('data-kind="turn">마지막 종 기회')
    expect(html('101')).toContain('data-kind="turn">내 차례')
    expect(html('102')).toContain('data-kind="turn">공개 차례')
    // The 2D seat header drops the total; the counts stay under the piles and in the seat's name.
    expect(html('101')).not.toContain('hg-count')
    expect(html('101')).toContain('나 · 내 차례 · 남은 카드 13 · 펼친 카드 1')
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
  it('3D bell click takes the same ring path once per window and never rings for a spectator', async () => {
    // ringShownBell talks to the app runtime; give it the same fake socket.
    const shared = parkRuntime as unknown as Record<string, unknown>, internals = runtime as unknown as Record<string, unknown>
    Object.assign(shared, { active: true, mapAdmission: internals.mapAdmission, socket: internals.socket })
    expect(ringAllowedBell()).toBe(true)
    // A second press of the same window (another click, Enter on the bell button or Space) is not sent again.
    expect(ringAllowedBell()).toBe(false)
    await flush()
    expect(sent.map(r => r.payload.input)).toEqual([{ kind: 'ring', bellWindowId: 4 }])
    expect(sent[0]!.payload).toMatchObject({ gameId: 'halli', expectedVersion: 4 })
    expect(halliRingMark('halli', 4)).toBe('sent')
    sent[0]!.done.resolve({}); await flush()
    useGame.setState(s => ({ game: { ...s.game!, role: 'SPECTATOR', version: 5, halli: { ...s.game!.halli!, bellWindowId: 5 } } as typeof s.game }))
    expect(ringAllowedBell()).toBe(false)
    await flush()
    expect(sent).toHaveLength(1)
  })
})

describe('table stage anchors', () => {
  type Anchor = (typeof TABLES)[number]
  const toLocal = (anchor: Anchor, p: readonly number[]) =>
    ({ x: (p[0]! - anchor.position[0]) / tableScale(anchor), z: (p[2]! - anchor.position[2]) / tableScale(anchor) })
  const box = (anchor: Anchor, corners: readonly (readonly number[])[]) => {
    const local = corners.map(c => toLocal(anchor, c)), xs = local.map(p => p.x), zs = local.map(p => p.z)
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  }
  const apart = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ
  it('uses each avatar seat and gives unknown or doubled seats the next free seat in table order', () => {
    const seats: Record<string, number> = { a: 3, b: 0, c: 1 }
    expect(halliSeatIndices(['a', 'b', 'c'], id => seats[id])).toEqual([3, 0, 1])
    expect(halliSeatIndices(['a', 'b', 'c', 'd'], id => id === 'a' || id === 'b' ? 1 : undefined)).toEqual([1, 0, 2, 3])
    expect(halliSeatIndices(['a', 'b'], () => -1)).toEqual([0, 2])
  })
  it('lays every seat\'s face-up card and pile inside the felt, apart from each other and clear of the bell', () => {
    for (const anchor of TABLES) {
      const items = [0, 1, 2, 3].flatMap(seat => [box(anchor, faceUpCorners(anchor, seat, 1)), box(anchor, pileCorners(anchor, seat, 13))])
      for (const b of items) {
        expect(Math.max(Math.abs(b.minX), Math.abs(b.maxX))).toBeLessThanOrEqual(HALLI_LAYOUT.felt.x)
        expect(Math.max(Math.abs(b.minZ), Math.abs(b.maxZ))).toBeLessThanOrEqual(HALLI_LAYOUT.felt.z)
        // The point of each card nearest the bell stays outside the bell's base.
        const nx = Math.max(b.minX, Math.min(0, b.maxX)), nz = Math.max(b.minZ, Math.min(0, b.maxZ))
        expect(Math.hypot(nx, nz)).toBeGreaterThan(HALLI_LAYOUT.bellRadius)
      }
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) expect(apart(items[i]!, items[j]!)).toBe(true)
    }
  })
  it('points the card top at the bell, puts the pile on the seated player\'s right and scales with the table', () => {
    const anchor = TABLES.find(t => t.pavilionId !== 'P0') ?? TABLES[0]!
    for (let seat = 0; seat < 4; seat++) {
      const [tl, tr, bl, br] = faceUpCorners(anchor, seat, 1).map(c => toLocal(anchor, c))
      const out = seatFrame(anchor, seat).out
      expect((tl!.x + tr!.x) * out.x + (tl!.z + tr!.z) * out.z).toBeLessThan((bl!.x + br!.x) * out.x + (bl!.z + br!.z) * out.z)
      // Facing the bell (-out), the pile lies on the right: the y of cross(facing, toPile) is negative.
      const pile = box(anchor, pileCorners(anchor, seat, 5)), px = (pile.minX + pile.maxX) / 2, pz = (pile.minZ + pile.maxZ) / 2
      expect(-out.z * px - -out.x * pz).toBeLessThan(0)
    }
    const main = TABLES.find(t => t.pavilionId === 'P0')
    if (main) {
      const reach = (a: Anchor) => Math.hypot(faceUpCorners(a, 0, 1)[0]![0] - a.position[0], faceUpCorners(a, 0, 1)[0]![2] - a.position[2])
      expect(reach(main) / reach(anchor)).toBeCloseTo(tableScale(main) / tableScale(anchor))
    }
  })
  it('stacks cards in height with a cap and keeps the label past the felt edge', () => {
    expect(stackHeight(0)).toBe(0)
    expect(stackHeight(10)).toBeGreaterThan(stackHeight(1))
    expect(stackHeight(56)).toBe(HALLI_LAYOUT.maxStack)
    const anchor = TABLES[0]!
    expect(faceUpCorners(anchor, 0, 20)[0]![1]).toBeGreaterThan(faceUpCorners(anchor, 0, 1)[0]![1])
    for (let seat = 0; seat < 4; seat++) {
      const p = toLocal(anchor, labelPoint(anchor, seat))
      expect(Math.abs(p.x) > HALLI_LAYOUT.felt.x || Math.abs(p.z) > HALLI_LAYOUT.felt.z).toBe(true)
    }
  })
  it('builds a matrix3d that maps the element corners exactly onto the projected quad', () => {
    const quad = [{ x: 310, y: 402 }, { x: 395, y: 398 }, { x: 290, y: 520 }, { x: 420, y: 515 }]
    const m = quadTransform(120, 180, quad).match(/matrix3d\((.*)\)/)![1]!.split(',').map(Number)
    ;[[0, 0], [120, 0], [0, 180], [120, 180]].forEach(([x, y], i) => {
      const w = m[3]! * x! + m[7]! * y! + m[15]!
      expect((m[0]! * x! + m[4]! * y! + m[12]!) / w).toBeCloseTo(quad[i]!.x, 4)
      expect((m[1]! * x! + m[5]! * y! + m[13]!) / w).toBeCloseTo(quad[i]!.y, 4)
    })
    expect(quadTransform(120, 180, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])).toBe('')
  })
  it('projects from the seated camera: bell on screen, own card nearest and largest, opposite card beyond the bell', () => {
    for (const anchor of TABLES) {
      const width = 1920, height = 1080, pose = halliCameraPose(anchor, 0, width / height)
      const camera = new PerspectiveCamera(HALLI_CAMERA.fov, width / height, .1, 500)
      camera.position.set(...pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld()
      const project = (p: readonly number[]) => {
        const v = new Vector3(p[0], p[1], p[2]).project(camera)
        return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2, front: v.z > -1 && v.z < 1 }
      }
      const bell = project(bellCentre(anchor))
      expect(bell.front && bell.x > 0 && bell.x < width && bell.y > 0 && bell.y < height).toBe(true)
      const cards = [0, 1, 2, 3].map(seat => faceUpCorners(anchor, seat, 1).map(project))
      expect(cards.flat().every(c => c.front && c.x > 0 && c.x < width && c.y > 0 && c.y < height)).toBe(true)
      const centre = (q: { x: number; y: number }[]) => ({ x: q.reduce((s, c) => s + c.x, 0) / 4, y: q.reduce((s, c) => s + c.y, 0) / 4 })
      const span = (q: { x: number }[]) => Math.max(...q.map(c => c.x)) - Math.min(...q.map(c => c.x))
      expect(centre(cards[0]!).y).toBeGreaterThan(bell.y)
      expect(centre(cards[1]!).y).toBeLessThan(bell.y)
      expect(span(cards[0]!)).toBeGreaterThan(span(cards[1]!))
      // Behind the camera is not "front", so the stage falls back instead of drawing a mirrored quad.
      const behind = new Vector3(...pose.position).multiplyScalar(2).sub(new Vector3(...pose.target))
      expect(project([behind.x, behind.y, behind.z]).front).toBe(false)
    }
  })
})

describe('table stage rendering', () => {
  const html = (viewerId: string, props: { canFlip?: boolean; canRing?: boolean; keyHint?: boolean } = {}, state: object = halliState(4)) =>
    renderToStaticMarkup(createElement(HalliStage, { halli: parseHalliGalli(state), gameId: 'halli', viewerId,
      names: { '101': '나', '102': '둘', '103': '셋', '104': '넷' }, canFlip: false, canRing: false, onFlip: () => {}, onRing: () => {}, ...props }))
  it('renders one flat card and label per seat and only an accessible button for the 3D bell', () => {
    const own = html('101', { canFlip: true, canRing: true, keyHint: true })
    expect(own.match(/class="hg-stage-face"/g)).toHaveLength(4)
    expect(own.match(/hg-stage-seat/g)).toHaveLength(4)
    // No 2D bell drawing on the stage: one keyboard/screen-reader button over the 3D bell.
    expect(own).not.toContain('class="hg-bell"')
    expect(own.match(/class="hg-stage-bell"/g)).toHaveLength(1)
    expect(own).toMatch(/<button[^>]*class="hg-stage-bell"[^>]*aria-keyshortcuts="Space"[^>]*aria-label="종 치기 \(Space\)"/)
    expect(own).not.toMatch(/<button[^>]*class="hg-stage-bell"[^>]*disabled/)
    expect(own).not.toContain('hg-table')
    expect(own.match(/class="hg-stage-draw"/g)).toHaveLength(1)
    expect(own).toContain('내 뒷면 카드 13장 · 눌러서 공개')
    expect(own).toContain('Space</kbd> 종 치기')
    expect(html('102')).not.toContain('hg-stage-draw')
    expect(html('505')).toMatch(/<button[^>]*class="hg-stage-bell"[^>]*disabled/)
    expect(html('101', { canRing: true }, halliState(4, { bellWindowId: null }))).toContain('종 · 다음 카드를 기다리는 중')
  })
  it('speaks the same queued and rung bell states as the 2D bell', () => {
    // SSR renders the store's initial state, so the label helper both bells use is checked directly.
    const h = parseHalliGalli(halliState(2))
    expect(bellLabel(h, 'queued')).toBe('종 · 앞선 요청 뒤에 보냄')
    expect(bellLabel(h, 'sent')).toBe('종 · 이 카드에서는 이미 쳤어요')
    expect(bellLabel(h, undefined)).toBe('종 치기 (Space)')
  })
  it('keeps an empty spot, out badges and the last bell chance', () => {
    const players = [halliPlayer(0, { active: false, eliminated: true, forfeited: true }), halliPlayer(1, { topCard: null, faceUpCount: 0, cardCount: 13 }),
      halliPlayer(2, { active: false, eliminated: true, drawCount: 0, faceUpCount: 0, cardCount: 0, topCard: null })]
    const out = html('103', {}, halliState(3, { turnUserId: null, players }))
    expect(out).toContain('공개 카드 없음')
    expect(out).toContain('data-out="forfeited"')
    expect(out).toContain('data-out="eliminated"')
    expect(out).toContain('마지막 종 기회')
  })
  it('shows the name and the remaining · turned-up cards on every seat chip, no total, and the turn only on the turn seat', () => {
    const players = [halliPlayer(0, { drawCount: 10, faceUpCount: 3, cardCount: 13 }), halliPlayer(1, { drawCount: 12, faceUpCount: 2, cardCount: 14 }),
      halliPlayer(2), halliPlayer(3)]
    const own = html('101', { keyHint: true }, halliState(4, { players }))
    const chips = own.split('<section').slice(1)
    expect(chips).toHaveLength(4)
    for (const [i, name] of ['나', '둘', '셋', '넷'].entries()) {
      expect(chips[i]).toContain(`<strong>${name}</strong>`)
      expect(chips[i]).not.toMatch(/\d+장</)
      expect(chips[i]).not.toContain('뒷면')
    }
    for (const i of [1, 2, 3]) expect(chips[i]).toContain(`남은 카드 ${players[i]!.drawCount} · 펼친 카드 ${players[i]!.faceUpCount}`)
    // The own bar lists the two counts as separate items, in a row with the turn, the timer and the Space hint.
    const bar = chips[0]!.replace(/<!-- -->/g, '')
    expect(bar).toContain('<span class="hg-own-count">남은 카드 10</span><span class="hg-own-count">펼친 카드 3</span>')
    expect(bar.indexOf('내 차례')).toBeLessThan(bar.indexOf('남은 카드 10'))
    expect(bar.indexOf('role="timer"') === -1 || bar.indexOf('role="timer"') < bar.indexOf('Space</kbd>')).toBe(true)
    expect(own.match(/data-kind="turn"/g)).toHaveLength(1)
    expect(chips[0]).toContain('data-kind="turn">내 차례')
    expect(chips[0]).toContain('Space</kbd> 종 치기')
    expect(chips.slice(1).join('')).not.toContain('hg-keys')
    // Others see the same seat as the player whose turn it is.
    expect(html('102', {}, halliState(4, { players }))).toContain('data-kind="turn">공개 차례')
  })
  it('badges the two-player last bell chance on the seat label and keeps the own pile button disabled', () => {
    const state = halliState(2, { players: [halliPlayer(0, { drawCount: 0, cardCount: 1 }), halliPlayer(1)] })
    const own = html('101', {}, state)
    expect(own).toContain('data-kind="turn">마지막 종 기회')
    expect(own).toMatch(/<button[^>]*class="hg-stage-draw"[^>]*disabled/)
    expect(html('505', {}, state)).toContain('나 · 마지막 종 기회')
  })
})

describe('naturally eliminated player leaves the table', () => {
  type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  const out = { active: false, eliminated: true }
  const playing = (own: Record<string, unknown> = out) => {
    restore(halliState(3, { turnUserId: '102', players: [halliPlayer(0, own), halliPlayer(1), halliPlayer(2)] }))
    useGame.setState({ start: { tableId: 't', revision: 1, phase: 'PLAYING', startAttemptId: 'a', gameCode: 'HALLI_GALLI',
      gameSessionId: 'halli', code: null, simulation: false } as never })
  }
  beforeEach(() => {
    resetForfeit()
    useSession.setState({ status: 'connected', sessionId: '101', pending: false })
  })
  afterEach(() => { vi.unstubAllGlobals(); resetWorld(); resetForfeit() })

  it('allows leaving only a naturally eliminated player, also after a reconnect restored ELIMINATED', () => {
    playing({})
    expect(canLeaveEliminatedHalli('101')).toBe(false)
    playing()
    expect(canLeaveEliminatedHalli('101')).toBe(true)
    useGame.setState({ recovery: 'ELIMINATED' })
    expect(canLeaveEliminatedHalli('101')).toBe(true)
    useGame.setState({ pending: true })
    expect(canLeaveEliminatedHalli('101')).toBe(false)
  })
  it('never offers leaving to a forfeited player, a spectator, a finished game or outside PLAYING', () => {
    playing({ active: false, eliminated: true, forfeited: true })
    expect(canLeaveEliminatedHalli('101')).toBe(false)
    playing()
    useGame.setState(s => ({ game: { ...s.game!, role: 'SPECTATOR' } as typeof s.game }))
    expect(canLeaveEliminatedHalli('101')).toBe(false)
    playing()
    useGame.setState(s => ({ start: { ...s.start!, phase: 'SETTLING' } }))
    expect(canLeaveEliminatedHalli('101')).toBe(false)
    restore(halliFinished(3, ['102']))
    expect(canLeaveEliminatedHalli('101')).toBe(false)
  })
  it('keeps the pending or uncertain forfeit re-check ahead of leaving', () => {
    for (const status of ['pending', 'uncertain'] as const) {
      playing()
      useForfeit.setState({ attempt: { userId: '101', gameId: 'halli', actionId: 'f1', status, error: '' } })
      expect(canLeaveEliminatedHalli('101')).toBe(false)
    }
  })
  it('sends the plain TABLE_LEAVE mid-game only for that player; others keep the local busy guard', async () => {
    vi.stubGlobal('window', { location: { href: 'http://localhost:5197/park' } })
    const runtime = new ParkRuntime(), sent: { type: string; payload: unknown; done: Deferred }[] = []
    Object.assign(runtime as unknown as Record<string, unknown>, { active: true, mapAdmission: { allowed: true },
      socket: { connected: true, request: (type: string, payload: unknown) =>
        new Promise((resolve, reject) => { sent.push({ type, payload, done: { resolve, reject } }) }) } })
    useSession.setState({ status: 'connected', sessionId: '101' })

    playing({})
    expect(await runtime.leaveTable()).toBe(false)
    expect(sent).toHaveLength(0)
    expect(useSession.getState().error).toContain('경기 진행')

    playing()
    const leaving = runtime.leaveTable()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(sent.map(r => [r.type, r.payload])).toEqual([['TABLE_LEAVE', {}]])
    sent[0]!.done.resolve({ type: 'TABLE_LEFT', requestId: 'r', payload: { tableId: 't' } })
    expect(await leaving).toBe(true)
  })
})

describe('forfeit confirmation backdrop', () => {
  // Stand-ins for event targets: the backdrop is outside the sheet, the sheet and everything in it are inside.
  const node = (inSheet: boolean) => ({ closest: (selector: string) => selector === '.hg-forfeit-dialog' && inSheet ? {} : null }) as unknown as EventTarget
  it('treats only targets off the sheet as backdrop clicks', () => {
    expect(outsideSheet(node(false))).toBe(true)
    // The sheet, its text, its buttons and its close button all sit inside .hg-forfeit-dialog.
    expect(outsideSheet(node(true))).toBe(false)
    expect(outsideSheet(null)).toBe(false)
    // A text node or window has no closest(): never a backdrop click.
    expect(outsideSheet({} as EventTarget)).toBe(false)
  })
})
