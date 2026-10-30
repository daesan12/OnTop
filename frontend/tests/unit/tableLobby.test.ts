import { beforeEach, describe, expect, it } from 'vitest'
import { canLeaveByMovement, gameSelection, lobbyStatus, waitingForRound } from '../../src/features/tableLobby/model'
import { createMockPublicMatchService } from '../../src/features/tableLobby/mock/MockPublicMatchService'
import { publicMatchService } from '../../src/features/tableLobby/publicMatch'
import { resetTableLobby, seatScope, seatedLook, turnSeatedLook, useTableLobby } from '../../src/features/tableLobby/state'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import type { TableState } from '../../src/network/protocol'

const table: TableState = { tableId: 'table', version: 4, capacity: 4, minimumPlayers: 2,
  seats: [{ seatNumber: 1, userId: '102', ready: false }, { seatNumber: 2, userId: '101', ready: false },
    { seatNumber: 3, userId: null, ready: false }, { seatNumber: 4, userId: null, ready: false }],
  selectorUserId: '101', gameCode: 'OMOK', targetScore: null, betAmountPerPlayer: 5, allReady: false }
const start = (phase: 'WAITING' | 'PLAYING' | 'SETTLING', revision: number, gameId: string | null = 'game') => ({
  tableId: 'table', revision, phase, startAttemptId: phase === 'WAITING' ? null : 'attempt',
  gameCode: 'OMOK', gameSessionId: gameId, code: null, simulation: false,
})
const result = { version: 2, gameSessionId: 'game', gameCode: 'OMOK', status: 'FINISHED', endReason: 'TURN_TIMEOUT', settlementStatus: 'SETTLED',
  betAmountPerPlayer: 1, participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'LOSE' }],
  myCoinDelta: 1, endedAt: '2026-10-24T01:00:00Z' }
const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, payload, requestId: null }, '101', 'table')
beforeEach(() => { resetGame(); resetTableLobby() })
describe('M09 lobby authority and completed round presentation', () => {
  it('permits only a normal unready leave when optional start events are absent', () => {
    expect(canLeaveByMovement(table, '101', useGame.getState())).toBe(true)
    expect(canLeaveByMovement(table, '103', useGame.getState())).toBe(false)
    expect(canLeaveByMovement({ ...table, seats: table.seats.map(s => ({ ...s, ready: true })) }, '101', useGame.getState())).toBe(false)
    const state = useGame.getState()
    for (const recovery of ['PENDING', 'RESTORED', 'EXPIRED', 'UNAVAILABLE'] as const)
      expect(canLeaveByMovement(table, '101', { ...state, recovery, permittedGameId: 'g' })).toBe(false)
    expect(canLeaveByMovement(table, '101', { ...state, pending: true })).toBe(false)
    expect(canLeaveByMovement(table, '101', { ...state, uncertain: true })).toBe(false)
    expect(canLeaveByMovement(table, '101', { ...state, permittedGameId: 'g' })).toBe(false)
    for (const phase of ['STARTING', 'CONFIRMED', 'PLAYING', 'SETTLING', 'NOT_SEATED'] as const)
      expect(canLeaveByMovement(table, '101', { ...state, start: { ...start('WAITING', 1), phase } })).toBe(false)
    expect(canLeaveByMovement(table, '101', { ...state, start: { ...start('WAITING', 1), tableId: 'other' } })).toBe(false)
    expect(canLeaveByMovement(table, '101', { ...state, start: start('WAITING', 1) })).toBe(true)
    // A rehearsal WAITING permits leaving but still cannot dismiss a real next-round result.
    expect(canLeaveByMovement(table, '101', { ...state, start: { ...start('WAITING', 1), simulation: true } })).toBe(true)
  })
  it('uses server selector identity rather than first seat or rule-player index', () => {
    expect(lobbyStatus(table, '101', false)).toMatchObject({ host: true, count: 2, canReady: true, canLeaveByMovement: true })
    expect(lobbyStatus(table, '102', false).host).toBe(false)
    expect(lobbyStatus(table, '103', false).canReady).toBe(false)
    expect(lobbyStatus(table, '101', true).canLeaveByMovement).toBe(false)
    expect(lobbyStatus({ ...table, seats: table.seats.map(s => ({ ...s, ready: !!s.userId })) }, '101', false).canLeaveByMovement).toBe(false)
  })
  it('allows omok and one-card selection and blocks games under construction', () => {
    expect(gameSelection('OMOK', 5)).toEqual({ gameCode: 'OMOK', betAmountPerPlayer: 5 })
    expect(gameSelection('ONE_CARD', 5)).toEqual({ gameCode: 'ONE_CARD', betAmountPerPlayer: 5 })
    for (const gameCode of ['DICE', 'LIAR_BRIDGE'] as const) {
      expect(() => gameSelection(gameCode, 5, gameCode === 'DICE' ? 4000 : undefined)).toThrow('공사 중')
      expect(lobbyStatus({ ...table, gameCode }, '101', false).canReady).toBe(false)
    }
    expect(() => gameSelection('DICE', 5)).toThrow()
    expect(() => gameSelection('DICE', 5, 3000)).toThrow()
    expect(() => gameSelection('OMOK', 5, 2000)).toThrow()
  })
  it('rejects invalid bets before sending and requires a confirmed bet before ready', () => {
    for (const bet of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER])
      expect(() => gameSelection('ONE_CARD', bet)).toThrow()
    expect(gameSelection('ONE_CARD', Math.floor(Number.MAX_SAFE_INTEGER / 4)).betAmountPerPlayer)
      .toBe(Math.floor(Number.MAX_SAFE_INTEGER / 4))
    expect(lobbyStatus({ ...table, betAmountPerPlayer: null }, '101', false).canReady).toBe(false)
  })
  it('requires actual server WAITING before next-round presentation can be dismissed', () => {
    expect(waitingForRound(start('SETTLING', 1), 'table')).toBe(false)
    expect(waitingForRound({ ...start('WAITING', 2), simulation: true }, 'table')).toBe(false)
    expect(waitingForRound(start('WAITING', 2), 'another')).toBe(false)
    expect(waitingForRound(start('WAITING', 2), 'table')).toBe(true)
  })
  it('retains the result across WAITING, discards old results when a new game begins', () => {
    send('GAME_START_STATE', start('SETTLING', 1))
    send('GAME_RESULT', result)
    send('GAME_START_STATE', start('WAITING', 2, null))
    expect(useGame.getState()).toMatchObject({ game: null, permittedGameId: '', completedGameId: 'game', result: null })
    expect(useGame.getState().lastResult?.myCoinDelta).toBe(1)
    send('GAME_START_STATE', start('PLAYING', 3, 'new-game'))
    send('GAME_RESULT', { ...result, version: 999 })
    expect(useGame.getState().lastResult).toBeNull()
  })
  it('accepts its own late committed result after server WAITING without reopening an old game', () => {
    send('GAME_START_STATE', start('SETTLING', 1))
    send('GAME_START_STATE', start('WAITING', 2, null))
    send('GAME_RESULT', result)
    send('GAME_RESULT', { ...result, version: 1, settlementStatus: 'PENDING', myCoinDelta: null })
    expect(useGame.getState().lastResult?.settlementStatus).toBe('SETTLED')
    expect(useGame.getState().game).toBeNull()
    useGame.setState({ lastResult: null, dismissedResult: { gameId: 'game', version: 2 } })
    send('GAME_RESULT', result)
    expect(useGame.getState().lastResult).toBeNull()
    send('TABLE_LEFT', { tableId: 'table' })
    send('GAME_RESULT', result)
    expect(useGame.getState().lastResult).toBeNull()
  })
  it('keeps nullable INVALID results monotonic across WAITING, duplicate query/push and dismissal', () => {
    const pending = { ...result, version: 1, status: 'INVALID', endReason: 'ENGINE_LOST', betAmountPerPlayer: 9,
      settlementStatus: 'PENDING', myCoinDelta: null, participants: result.participants.map(p => ({ ...p, result: null })) }
    const settled = { ...pending, version: 2, settlementStatus: 'SETTLED', myCoinDelta: 0 }
    send('GAME_START_STATE', start('SETTLING', 1))
    send('GAME_START_STATE', start('WAITING', 2, null))
    send('GAME_RESULT', pending)
    expect(useGame.getState()).toMatchObject({ completedGameId: 'game', game: null, lastResult: pending })
    receiveGame({ type: 'GAME_RESULT', requestId: 'query', payload: settled }, '101', 'table')
    send('GAME_RESULT', pending); send('GAME_RESULT', settled)
    expect(useGame.getState().lastResult).toEqual(settled)
    useGame.setState({ lastResult: null, dismissedResult: { gameId: 'game', version: 2 } })
    send('GAME_RESULT', settled); send('GAME_RESULT', pending)
    expect(useGame.getState().lastResult).toBeNull()
    send('GAME_START_STATE', start('PLAYING', 3, 'new-game'))
    send('GAME_RESULT', { ...settled, version: 100 })
    expect(useGame.getState().lastResult).toBeNull()
  })
  it('keeps look yaw local, clamps it and scopes it to user/table/seat', () => {
    const scope = seatScope({ sessionId: '101', tableId: 't', seatIndex: 1 })
    turnSeatedLook(scope, 100000)
    expect(seatedLook.yaw).toBeCloseTo(-Math.PI * .48)
    const other = seatScope({ sessionId: '102', tableId: 't', seatIndex: 1 })
    turnSeatedLook(other, 0)
    expect(seatedLook.yaw).toBe(0)
    resetTableLobby()
    expect(useTableLobby.getState().lookScope).toBe('')
  })
  it('uses the server provider in ordinary mode; preview mock only supplies explicitly seeded public IDs', () => {
    expect(publicMatchService.mode).toBe('server')
    const mock = createMockPublicMatchService()
    expect(mock.find({ channelId: 'a', tableId: 't' })).toBeNull()
    mock.set({ channelId: 'a', tableId: 't', gameId: 'g' })
    expect(mock.find({ channelId: 'b', tableId: 't' })).toBeNull()
    expect(mock.find({ channelId: 'a', tableId: 't' })?.gameId).toBe('g')
    mock.clear()
    expect(mock.find({ channelId: 'a', tableId: 't' })).toBeNull()
  })
})
