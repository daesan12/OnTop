import { beforeEach, expect, it } from 'vitest'
import { parseGame } from '../../src/game/protocol'
import { parseOneCard, parseHand, type Card, type OneCard, type Hand } from '../../src/game/onecard/protocol'
import { canActOneCard } from '../../src/game/onecard/actions'
import { cardLabel, cardEffect } from '../../src/game/onecard/presentation'
import { receiveGame, resetGame, useGame } from '../../src/game/store'

const card = (rank = '4', suit: Card['suit'] = 'hearts'): Card => ({ id: suit ? `${suit}-${rank}` : rank, suit, rank })
const make = (count = 2): OneCard => ({ gameCode: 'ONE_CARD', status: 'PLAYING', players: Array.from({ length: count }, (_, i) => ({ userId: String(101 + i), cardCount: 1,
  active: true, oneCardUntil: null, oneCardStatus: 'none' })), turnUserId: '101', turnDeadline: '2099-01-01T00:00:30Z', turnTimeLimitMs: 30000,
  direction: 1, stage: 'PLAYING', extraAction: false, topCard: card('5'), activeSuit: 'hearts', drawCount: 50, attackTotal: 0,
  lastAttack: null, turnCount: 1, winnerUserIds: [], endReason: null, endedAt: null })
const privateState = (): Hand => ({ userId: '101', hand: [card()], playableCardIds: ['hearts-4'], canDraw: true })
const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, requestId: null, payload }, '101', 't')
const restore = (o = make(), version = 0, hand = privateState()) => send('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'cards', version, state: { publicState: o, privateState: hand } })
beforeEach(resetGame)
it.each([2, 3, 4])('accepts %i players and atomically recovers only the matching private hand', count => {
  restore(make(count)); const g = useGame.getState().game!
  expect(g.onecard!.players).toHaveLength(count); expect(g.hand!.hand).toEqual([card()])
  expect(canActOneCard('101', { kind: 'play', cardId: 'hearts-4' })).toBe(true)
})
it('rejects foreign hands, inconsistent counts, duplicate/unknown cards and nonempty spectator private fields', () => {
  const o = make(), h = privateState()
  expect(() => parseHand({ ...h, userId: '102' }, '101', o)).toThrow()
  expect(() => parseHand({ ...h, hand: [] }, '101', o)).toThrow()
  expect(() => parseHand({ ...h, playableCardIds: ['spades-A'] }, '101', o)).toThrow()
  expect(() => parseHand({ ...h, hand: [{ ...card(), id: 'invented' }] }, '101', o)).toThrow()
  const msg = { gameId: 'cards', version: 0, role: 'SPECTATOR', publicState: o, privateState: h }
  expect(() => parseGame(msg, '505')).toThrow()
  const spectator = parseGame({ ...msg, privateState: {} }, '505')
  expect(spectator.hand).toBeNull(); expect(spectator.onecard).not.toHaveProperty('hand')
  expect(parseOneCard({ ...o, hand: ['foreign'], deck: ['hidden'] })).toEqual(o)
  expect(parseHand({ ...h, otherHands: ['hidden'] }, '101', o)).toEqual(h)
})
it('blocks stale versions, pending/uncertain/recovery/spectator and exact-deadline actions', () => {
  restore(); const play = { kind: 'play', cardId: 'hearts-4' } as const
  expect(canActOneCard('101', play, Date.parse(make().turnDeadline!))).toBe(false)
  for (const patch of [{ pending: true }, { uncertain: true }, { recovery: 'PENDING' as const }, { awaitingVersion: 1 }]) {
    restore(); useGame.setState(patch); expect(canActOneCard('101', play)).toBe(false)
    useGame.setState({ pending: false, uncertain: false, awaitingVersion: -1 })
  }
  resetGame(); useGame.setState({ watchedGameId: 'cards' })
  send('GAME_STATE', { gameId: 'cards', version: 0, role: 'SPECTATOR', publicState: make(), privateState: {} })
  expect(canActOneCard('101', play)).toBe(false)
  resetGame(); restore(make(), 3)
  send('GAME_STATE', { gameId: 'cards', version: 2, role: 'PLAYER', publicState: make(), privateState: privateState() })
  expect(useGame.getState().game!.version).toBe(3)
  expect(() => restore(make(), 4, { ...privateState(), userId: '102' })).toThrow()
  expect(useGame.getState().game!.version).toBe(3)
})
it('uses server playable IDs/canDraw and only permits the exact current stage and attack response', () => {
  restore(); expect(canActOneCard('101', { kind: 'draw' })).toBe(true)
  expect(canActOneCard('101', { kind: 'play', cardId: 'spades-A' })).toBe(false)
  expect(canActOneCard('101', { kind: 'accept-attack' })).toBe(false)
  const o = make(); o.attackTotal = 7; o.lastAttack = card('joker-color', null)
  restore(o, 1, { ...privateState(), playableCardIds: [], canDraw: false })
  expect(canActOneCard('101', { kind: 'draw' })).toBe(false)
  expect(canActOneCard('101', { kind: 'accept-attack' })).toBe(true)
  o.stage = 'CHOOSE_SUIT'; restore(o, 2)
  expect(canActOneCard('101', { kind: 'select-suit', suit: 'spades' })).toBe(true)
  expect(canActOneCard('101', { kind: 'draw' })).toBe(false)
  expect(canActOneCard('101', { kind: 'play', cardId: 'hearts-4' })).toBe(false)
})
it('declaration and catch are independent of whose turn it is and expire exactly at 3 seconds without local penalties', () => {
  const o = make(); o.turnUserId = '102'; o.players[0]!.oneCardStatus = 'pending'; o.players[0]!.oneCardUntil = '2099-01-01T00:00:03Z'
  restore(o); const deadline = Date.parse(o.players[0]!.oneCardUntil!)
  expect(canActOneCard('101', { kind: 'declare-one' }, deadline - 1)).toBe(true)
  expect(canActOneCard('101', { kind: 'declare-one' }, deadline)).toBe(false)
  o.players[1]!.oneCardStatus = 'pending'; o.players[1]!.oneCardUntil = o.players[0]!.oneCardUntil
  restore(o, 1)
  expect(canActOneCard('101', { kind: 'catch-one', targetUserId: '102' }, deadline - 1)).toBe(true)
  expect(canActOneCard('101', { kind: 'catch-one', targetUserId: '101' }, deadline - 1)).toBe(false)
  expect(canActOneCard('101', { kind: 'catch-one', targetUserId: '102' }, deadline)).toBe(false)
  expect(useGame.getState().game!.onecard!.players.map(p => p.cardCount)).toEqual([1, 1])
})
it('clears hand on next round/exit and refuses eliminated player actions', () => {
  const o = make(); o.players[0]!.active = false; o.players[0]!.cardCount = 0; o.turnUserId = '102'
  restore(o, 1, { userId: '101', hand: [], playableCardIds: [], canDraw: false })
  expect(canActOneCard('101', { kind: 'draw' })).toBe(false)
  send('TABLE_LEFT', {}); expect(useGame.getState().game).toBeNull()
  restore(); send('GAME_START_STATE', { tableId: 't', revision: 2, phase: 'WAITING', startAttemptId: null, gameCode: 'ONE_CARD', gameSessionId: null, code: null, simulation: false })
  expect(useGame.getState().game).toBeNull()
})
it('presents card effects without implementing random draws or game authority', () => {
  expect(cardLabel(card('joker-color', null))).toBe('컬러 조커')
  expect(cardEffect(card('A', 'spades'))).toBe('+5 공격')
  expect(cardEffect(card('K'))).toBe('한 장 더 내기')
  expect(cardEffect(card('4'))).toBe('')
})
