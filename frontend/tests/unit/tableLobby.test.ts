import { beforeEach, describe, expect, it } from 'vitest'
import { gameSelection, lobbyStatus, waitingForRound } from '../../src/features/tableLobby/model'
import { createMockPublicMatchService } from '../../src/features/tableLobby/mock/MockPublicMatchService'
import { publicMatchService } from '../../src/features/tableLobby/publicMatch'
import { resetTableLobby, seatScope, seatedLook, turnSeatedLook, useTableLobby } from '../../src/features/tableLobby/state'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import type { TableState } from '../../src/network/protocol'

const table: TableState = { tableId: 'table', version: 4, capacity: 4, minimumPlayers: 2,
  seats: [{ seatNumber: 1, userId: '102', ready: false }, { seatNumber: 2, userId: '101', ready: false },
    { seatNumber: 3, userId: null, ready: false }, { seatNumber: 4, userId: null, ready: false }],
  selectorUserId: '101', gameCode: 'OMOK', targetScore: null, allReady: false }
const start = (phase: 'WAITING' | 'PLAYING' | 'SETTLING', revision: number, gameId: string | null = 'game') => ({
  tableId: 'table', revision, phase, startAttemptId: phase === 'WAITING' ? null : 'attempt',
  gameCode: 'OMOK', gameSessionId: gameId, code: null, simulation: false,
})
const result = { version: 2, gameSessionId: 'game', gameCode: 'OMOK', status: 'FINISHED', settlementStatus: 'SETTLED',
  betAmountPerPlayer: 1, participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'LOSE' }],
  myCoinDelta: 1, endedAt: '2026-10-24T01:00:00Z' }
const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, payload, requestId: null }, '101', 'table')
beforeEach(() => { resetGame(); resetTableLobby() })
describe('M09 lobby authority and completed round presentation', () => {
  it('uses server selector identity rather than first seat or rule-player index', () => {
    expect(lobbyStatus(table, '101', false)).toMatchObject({ host: true, count: 2, canReady: true, canLeaveByMovement: true })
    expect(lobbyStatus(table, '102', false).host).toBe(false)
    expect(lobbyStatus(table, '103', false).canReady).toBe(false)
    expect(lobbyStatus(table, '101', true).canLeaveByMovement).toBe(false)
    expect(lobbyStatus({ ...table, seats: table.seats.map(s => ({ ...s, ready: !!s.userId })) }, '101', false).canLeaveByMovement).toBe(false)
  })
  it('uses existing exact GAME_SELECT options, never preview IDs or omitted dice options', () => {
    expect(gameSelection('OMOK')).toEqual({ gameCode: 'OMOK' })
    expect(gameSelection('DICE', 4000)).toEqual({ gameCode: 'DICE', targetScore: 4000 })
    expect(gameSelection('ONE_CARD')).toEqual({ gameCode: 'ONE_CARD' })
    expect(() => gameSelection('DICE')).toThrow()
    expect(() => gameSelection('DICE', 3000)).toThrow()
    expect(() => gameSelection('OMOK', 2000)).toThrow()
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
  it('has no reference in ordinary mode; preview mock only supplies explicitly seeded public IDs', () => {
    expect(publicMatchService.mode).toBe('unavailable')
    const mock = createMockPublicMatchService()
    expect(mock.find({ channelId: 'a', tableId: 't' })).toBeNull()
    mock.set({ channelId: 'a', tableId: 't', gameId: 'g' })
    expect(mock.find({ channelId: 'b', tableId: 't' })).toBeNull()
    expect(mock.find({ channelId: 'a', tableId: 't' })?.gameId).toBe('g')
    mock.clear()
    expect(mock.find({ channelId: 'a', tableId: 't' })).toBeNull()
  })
})
