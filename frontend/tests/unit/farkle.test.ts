import { beforeEach, describe, expect, it } from 'vitest'
import { parseFarkle, parseGame, type Farkle } from '../../src/game/protocol'
import { canPlayDice, canPlace, receiveGame, resetGame, useGame } from '../../src/game/store'
import { eligibleDice, scoreSelection, selectionScore, validDiceAction } from '../../src/game/farkle/scoring'
import { ShakeTracker } from '../../src/game/farkle/shake'

const make = (patch: Partial<Farkle> = {}): Farkle => ({ gameCode: 'DICE', status: 'PLAYING', players: ['101', '102'], scores: [0, 0], targetScore: 4000,
  turnTimeLimitMs: 30000, turnUserId: '101', turnDeadline: '2099-01-01T00:00:30Z', turnScore: 0, dice: [], stage: 'AWAITING_ROLL', rollId: 0,
  round: 1, hotDice: false, lastEvent: 'START', winnerUserId: null, endReason: null, endedAt: null, ...patch })
const dice = (values: number[]) => values.map((value, id) => ({ id, value, held: false }))
const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, payload, requestId: null }, '101', 't')
const restore = (state = make(), version = 0) => send('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'dice', version, state })
beforeEach(resetGame)
describe('M11 preview and public DICE boundary', () => {
  it.each([2, 3, 4])('accepts %i seats with aligned scores and rejects malformed eliminated rosters', count => {
    const players = ['101', '102', '103', '104'].slice(0, count)
    const state = make({ players, scores: players.map((_, i) => i * 50), turnUserId: players[count - 1]! })
    const parsed = parseFarkle(state)
    expect(parsed.players).toEqual(players)
    expect(parsed.scores).toHaveLength(count)
    expect(parsed.forfeitedUserIds).toEqual([])
    expect(parseFarkle({ ...state, forfeitedUserIds: ['101'] }).forfeitedUserIds).toEqual(['101'])
    for (const patch of [{ scores: [0] }, { players: ['101', '101'] }, { players: ['101'] },
      { players: [...players, '105', '106', '107'] }, { forfeitedUserIds: ['999'] },
      { forfeitedUserIds: ['101', '101'] }, { forfeitedUserIds: [state.turnUserId] }])
      expect(() => parseFarkle({ ...state, ...patch })).toThrow()
  })
  it('copies confirmed last-roll faces, accepts older servers and rejects malformed or stale receipts', () => {
    const state = make({ lastEvent: 'BUST', rollId: 1, round: 2, turnUserId: '102' })
    const lastRoll = { rollId: 1, actorUserId: '101', dice: dice([2, 3, 4, 6, 2, 3]) }
    const parsed = parseFarkle({ ...state, lastRoll })
    expect(parsed.lastRoll).toEqual(lastRoll)
    lastRoll.dice[0]!.value = 6
    expect(parsed.lastRoll!.dice[0]!.value).toBe(2)
    expect(parseFarkle(state).lastRoll).toBeNull()
    for (const invalid of [{ ...lastRoll, rollId: 2 }, { ...lastRoll, actorUserId: '505' },
      { ...lastRoll, dice: lastRoll.dice.slice(1) }, { ...lastRoll, dice: Array(6).fill(lastRoll.dice[0]) },
      { ...lastRoll, dice: dice([0, 2, 3, 4, 5, 6]) }]) expect(() => parseFarkle({ ...state, lastRoll: invalid })).toThrow()
  })
  it.each([
    [[1], 100], [[5], 50], [[2], null], [[1, 1, 1], 1000], [[2, 2, 2, 2], 400], [[1, 1, 1, 1, 1, 1], 8000],
    [[1, 2, 3, 4, 5], 500], [[2, 3, 4, 5, 6], 750], [[1, 2, 3, 4, 5, 6], 1500], [[3, 3, 3, 5, 1, 1], 550],
    [[2, 2, 3, 3, 4, 4], null], [[7], null],
  ] as [number[], number | null][])('previews known approved score vectors %j', (values, score) => expect(scoreSelection(values)).toBe(score))
  it('requires every selected die to score, while allowing a triple to be selected piece by piece', () => {
    const available = dice([2, 2, 2, 3, 4, 5])
    expect(eligibleDice(available)).toEqual([0, 1, 2, 5])
    expect(selectionScore(available, [0])).toBeNull()
    expect(selectionScore(available, [0, 1, 2])).toBe(200)
    expect(selectionScore(available, [0, 1, 2, 3])).toBeNull()
    available[0]!.held = true
    expect(selectionScore(available, [0, 1, 2])).toBeNull()
    expect(selectionScore(available, [5, 5])).toBeNull()
    expect(validDiceAction(make(), 'bank', [])).toBe(false)
  })
  it('validates and copies only public fields; rejects extra private values and malformed dice', () => {
    const publicState = make({ dice: dice([1, 2, 3, 4, 5, 6]), stage: 'SELECTING', rollId: 1, lastEvent: 'ROLL' })
    expect(parseFarkle({ ...publicState, secret: 'discard' })).not.toHaveProperty('secret')
    expect(() => parseFarkle({ ...publicState, dice: [...publicState.dice.slice(0, 5), publicState.dice[0]] })).toThrow()
    expect(() => parseGame({ gameId: 'dice', version: 0, role: 'SPECTATOR', publicState, privateState: { hand: ['secret'] } })).toThrow()
    expect(() => parseFarkle({ ...publicState, stage: 'ROLLING' })).toThrow()
  })
  it('uses confirmed role, version and unchanged server deadline, never an OMOK placement', () => {
    restore()
    expect(canPlayDice('101')).toBe(true); expect(canPlayDice('102')).toBe(false); expect(canPlace('101', 0, 0)).toBe(false)
    expect(canPlayDice('101', Date.parse(make().turnDeadline!))).toBe(false)
    send('GAME_ACTION_RESULT', { gameId: 'dice', version: 1 })
    expect(canPlayDice('101')).toBe(false)
    restore(make(), 1)
    expect(canPlayDice('101')).toBe(true)
    send('GAME_STATE', { gameId: 'dice', version: 0, role: 'PLAYER', publicState: make({ turnUserId: '102' }), privateState: {} })
    expect(useGame.getState().game!.version).toBe(1)
    send('GAME_CONNECTION_STATE', { status: 'PENDING' })
    expect(canPlayDice('101')).toBe(false)
    restore(make(), 1)
    expect(useGame.getState().game?.dice?.turnDeadline).toBe(make().turnDeadline)
  })
  it('spectator approval can never grant control or personal result authority', () => {
    useGame.setState({ watchedGameId: 'dice' })
    send('GAME_STATE', { gameId: 'dice', version: 5, role: 'SPECTATOR', publicState: make(), privateState: {} })
    expect(canPlayDice('101')).toBe(false)
    send('GAME_WATCH_LEFT', { gameId: 'dice' })
    expect(useGame.getState().game).toBeNull()
  })
  it('tiny jitter or one direction cannot arm a cup, but a deliberate reversal can', () => {
    const jitter = new ShakeTracker(0, 0)
    for (let i = 0; i < 100; i++) jitter.move(i % 2, 0)
    expect(jitter.ready).toBe(false)
    const shake = new ShakeTracker(0, 0)
    shake.move(60, 0); expect(shake.ready).toBe(false)
    shake.move(0, 0); expect(shake.ready).toBe(true)
  })
})
