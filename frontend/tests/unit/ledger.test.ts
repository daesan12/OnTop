import { beforeEach, expect, it } from 'vitest'
import { gamePlayers, gameState, parseGame } from '../../src/game/protocol'
import { LEDGER_CATEGORIES, parseLedger, type LedgerCategory } from '../../src/game/ledger/protocol'
import { categoryScore } from '../../src/game/ledger/scoring'
import { canActLedger } from '../../src/game/ledger/actions'
import { LedgerPingEvents, parseLedgerPing, useLedgerPings } from '../../src/game/ledger/pings'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import type { Envelope } from '../../src/network/protocol'

const empty = () => Object.fromEntries(LEDGER_CATEGORIES.map(c => [c, null])) as Record<LedgerCategory, number | null>
function ledgerState(count = 2, overrides: Record<string, unknown> = {}) {
  const players = Array.from({ length: count }, (_, i) => ({ userId: String(101 + i), forfeited: false, scores: empty(),
    upperSubtotal: 0, upperBonus: 0, total: 0 }))
  return { gameCode: 'DICE_LEDGER', status: 'PLAYING', turnTimeLimitMs: 20000, maxRolls: 3, upperBonusThreshold: 63, upperBonus: 35,
    turnUserId: '101', turnId: 1, round: 1, rollCount: 1, rollId: 1, lastEvent: 'ROLL',
    turnDeadline: new Date(Date.now() + 20_000).toISOString(), endReason: null, endedAt: null,
    categories: [...LEDGER_CATEGORIES], winnerUserIds: [], players,
    dice: [6, 6, 6, 6, 5].map((value, id) => ({ id, value, held: false })), lastScored: null, ...overrides }
}
const restore = (state = ledgerState(), version = 1) => receiveGame({ type: 'GAME_CONNECTION_STATE', requestId: null,
  payload: { status: 'RESTORED', gameId: 'ledger', version, state: { publicState: state, privateState: {} } } }, '101', 't')
beforeEach(resetGame)

it('preview mirrors the server table: four of a kind sums only four, five of a kind counts as a full house', () => {
  expect(categoryScore('FOUR_OF_A_KIND', [6, 6, 6, 6, 5])).toBe(24)
  expect(categoryScore('FOUR_OF_A_KIND', [2, 2, 2, 2, 2])).toBe(8)
  expect(categoryScore('FULL_HOUSE', [6, 6, 6, 6, 6])).toBe(30)
  expect(categoryScore('FULL_HOUSE', [6, 6, 6, 5, 5])).toBe(28)
  expect(categoryScore('FULL_HOUSE', [6, 6, 6, 6, 5])).toBe(0)
  expect(categoryScore('SMALL_STRAIGHT', [3, 4, 5, 6, 6])).toBe(15)
  expect(categoryScore('SMALL_STRAIGHT', [1, 2, 3, 5, 6])).toBe(0)
  expect(categoryScore('LARGE_STRAIGHT', [6, 5, 4, 3, 2])).toBe(30)
  expect(categoryScore('FIVE_OF_A_KIND', [4, 4, 4, 4, 4])).toBe(50)
  expect(categoryScore('CHOICE', [6, 6, 5, 5, 4])).toBe(26)
  expect(categoryScore('THREES', [3, 3, 1, 2, 3])).toBe(9)
})

it.each([2, 3, 4])('parses %i-player ledgers and rejects inconsistent turn/finish fields', count => {
  const state = ledgerState(count)
  expect(parseLedger(state).players).toHaveLength(count)
  expect(() => parseLedger({ ...state, rollCount: 0 })).toThrow()
  expect(() => parseLedger({ ...state, categories: ['ONES'] })).toThrow()
  expect(() => parseLedger({ ...state, turnUserId: '999' })).toThrow()
  expect(() => parseLedger({ ...state, dice: state.dice.slice(0, 4) })).toThrow()
  const finished = ledgerState(count, { status: 'FINISHED', turnUserId: null, turnDeadline: null, round: null,
    endReason: 'ALL_CATEGORIES_FILLED', endedAt: new Date().toISOString(), winnerUserIds: ['101', '102'] })
  expect(parseLedger(finished).winnerUserIds).toEqual(['101', '102'])
  expect(() => parseLedger({ ...finished, winnerUserIds: [] })).toThrow()
})

it('joins the shared game union, wrapped recovery and spectator views', () => {
  const game = parseGame({ gameId: 'ledger', version: 3, role: 'SPECTATOR', publicState: ledgerState(3), privateState: {} }, '505')
  expect(game.ledger?.gameCode).toBe('DICE_LEDGER')
  expect(gamePlayers(game)).toEqual(['101', '102', '103'])
  expect(gameState(game).status).toBe('PLAYING')
  expect(() => parseGame({ gameId: 'ledger', version: 3, role: 'SPECTATOR', publicState: ledgerState(), privateState: { x: 1 } }, '505')).toThrow()
  restore()
  expect(useGame.getState().game?.ledger?.turnUserId).toBe('101')
})

it('gates roll and score on turn, remaining rolls and empty cells', () => {
  restore()
  expect(canActLedger('101', { kind: 'roll', keepIds: [0, 1] })).toBe(true)
  expect(canActLedger('101', { kind: 'roll', keepIds: [0, 0] })).toBe(false)
  expect(canActLedger('101', { kind: 'roll', keepIds: [5] })).toBe(false)
  expect(canActLedger('101', { kind: 'score', category: 'FOUR_OF_A_KIND' })).toBe(true)
  expect(canActLedger('102', { kind: 'score', category: 'CHOICE' })).toBe(false)
  const card = ledgerState()
  card.players[0]!.scores.CHOICE = 20
  restore({ ...card, rollCount: 3, rollId: 3 }, 2)
  expect(canActLedger('101', { kind: 'roll', keepIds: [] })).toBe(false)
  expect(canActLedger('101', { kind: 'score', category: 'CHOICE' })).toBe(false)
  restore(ledgerState(2, { rollCount: 0, dice: [] }), 3)
  expect(canActLedger('101', { kind: 'score', category: 'CHOICE' })).toBe(false)
  expect(canActLedger('101', { kind: 'roll', keepIds: [1] })).toBe(false)
  expect(canActLedger('101', { kind: 'roll', keepIds: [] })).toBe(true)
  useGame.setState({ pending: true })
  expect(canActLedger('101', { kind: 'roll', keepIds: [] })).toBe(false)
})

const ping = (payload: Record<string, unknown>): Envelope => ({ type: 'DICE_LEDGER_SPECTATOR_PING', requestId: null, payload: {
  gameId: 'ledger', eventId: 'ee46b20f-e2b9-40ee-9a73-7a86c59e65a2', senderUserId: '505', basedOnVersion: 4,
  sentAt: 1000, expiresAt: 3000, serverNow: 1000, ...payload } })

it('parses exactly one ping target and shows hints only for the displayed version', async () => {
  expect(parseLedgerPing(ping({ category: 'CHOICE' }))?.category).toBe('CHOICE')
  expect(parseLedgerPing(ping({ dieId: 4 }))?.dieId).toBe(4)
  expect(parseLedgerPing(ping({ category: 'CHOICE', dieId: 1 }))).toBeNull()
  expect(parseLedgerPing(ping({}))).toBeNull()
  expect(parseLedgerPing(ping({ category: 'YACHT' }))).toBeNull()
  expect(parseLedgerPing(ping({ dieId: 5 }))).toBeNull()
  expect(parseLedgerPing(ping({ category: 'CHOICE', expiresAt: 9000 }))).toBeNull()
  let clock = 0, version = 4
  const sent: Record<string, unknown>[] = []
  const events = new LedgerPingEvents({
    scope: () => ({ key: 'k', gameId: 'ledger', version, role: 'SPECTATOR', canSend: true }),
    request: async (type, payload, _expected, onId) => {
      onId('req-1'); sent.push({ type, ...payload })
      return ping({ eventId: payload.eventId, category: payload.category, dieId: payload.dieId })
    },
    now: () => clock,
  })
  events.sync()
  expect(events.accept(ping({ category: 'FULL_HOUSE' }))).toBe(true)
  expect(useLedgerPings.getState().pings.map(p => p.category)).toEqual(['FULL_HOUSE'])
  expect(await events.send({ dieId: 2 })).toBe(true)
  expect(sent[0]).toMatchObject({ type: 'DICE_LEDGER_SPECTATOR_PING_SEND', gameId: 'ledger', basedOnVersion: 4, dieId: 2 })
  expect(sent[0]).not.toHaveProperty('category')
  expect(await events.send({ category: 'CHOICE' })).toBe(false)
  expect(useLedgerPings.getState().error).toMatch(/1초/)
  clock = 1500; version = 5; events.sync()
  expect(useLedgerPings.getState().pings).toEqual([])
  events.reset()
})

it('never lets a player send hints', async () => {
  const events = new LedgerPingEvents({
    scope: () => ({ key: 'p', gameId: 'ledger', version: 1, role: 'PLAYER', canSend: true }),
    request: async () => { throw new Error('must not send') },
  })
  events.sync()
  expect(useLedgerPings.getState().canSend).toBe(false)
  expect(await events.send({ category: 'CHOICE' })).toBe(false)
  events.reset()
})
