import { beforeEach, expect, it } from 'vitest'
import { receiveGame, tableBusy, useGame } from '../../src/game/store'
import { getGathering, returnToWaiting } from '../../src/features/tableLobby/gathering'
import { canLeaveByMovement } from '../../src/features/tableLobby/model'
import { tabletLobbyActive } from '../../src/features/tableLobby/tabletModel'
import { resetWorld, useSession } from '../../src/network/worldClient'
import type { Omok } from '../../src/game/protocol'
import type { TableState } from '../../src/network/protocol'

const table: TableState = { tableId: 'table', version: 4, capacity: 2, minimumPlayers: 2,
  selectorUserId: '101', gameCode: 'OMOK', targetScore: null, betAmountPerPlayer: 1, allReady: false,
  seats: [{ seatNumber: 1, userId: '101', ready: false }, { seatNumber: 2, userId: '102', ready: false }] }
const board = (finished = true): Omok => ({ gameCode: 'OMOK', status: finished ? 'FINISHED' : 'PLAYING', boardSize: 15,
  board: Array.from({ length: 15 }, () => Array(15).fill(0)), blackUserId: '101', whiteUserId: '102',
  turnUserId: finished ? null : '101', turnDeadline: finished ? null : '2099-01-01T00:00:30Z', moveCount: 0, lastMove: null,
  winnerUserId: finished ? '101' : null, endReason: finished ? 'TURN_TIMEOUT' : null,
  endedAt: finished ? '2026-10-29T00:00:00Z' : null })
const result = { version: 2, gameSessionId: 'old-game', gameCode: 'OMOK', status: 'FINISHED', endReason: 'TURN_TIMEOUT',
  settlementStatus: 'SETTLED', betAmountPerPlayer: 1, myCoinDelta: 1, endedAt: '2026-10-29T00:00:00Z',
  participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'LOSE' }] }
const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, payload, requestId: null }, '101', 'table')
const start = (phase: string, revision: number, gameSessionId: string | null = 'old-game') => send('GAME_START_STATE', {
  tableId: 'table', revision, phase, gameSessionId, gameCode: 'OMOK', startAttemptId: phase === 'WAITING' ? null : 'attempt',
  simulation: false, code: null })
function completedRound() {
  start('PLAYING', 1)
  send('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'old-game', version: 0, state: board(false) })
  start('SETTLING', 2)
  send('GAME_RESULT', result)
  start('WAITING', 3, null)
}
beforeEach(() => {
  resetWorld()
  useSession.setState({ status: 'connected', sessionId: '101', roomId: 'channel', tableId: 'table', seatIndex: 0,
    tableStates: { table }, mapCompatible: true })
})

it.each(['RESTORED', 'FINISHED', 'ELIMINATED'])('late %s recovery cannot reactivate a completed round or block preparation and exit', status => {
  completedRound()
  send('GAME_CONNECTION_STATE', { status, gameId: 'old-game', version: 9, state: board() })
  expect(tableBusy()).toBe(false)
  expect(useGame.getState()).toMatchObject({ game: null, permittedGameId: '', completedGameId: 'old-game' })
  expect(getGathering()?.canReturn).toBe(true)
  returnToWaiting()
  expect(getGathering()).toBeNull()
  expect(tabletLobbyActive()).toBe(true)
  expect(canLeaveByMovement(table, '101', useGame.getState())).toBe(true)
  useGame.setState({ resultCandidateGameId: 'old-game' })
  send('GAME_CONNECTION_STATE', { status, gameId: 'old-game', version: 10, state: board() })
  send('GAME_RESULT', { ...result, version: 20 })
  expect(getGathering()).toBeNull()
  expect(tableBusy()).toBe(false)
  expect(useGame.getState().resultCandidateGameId).toBe('')
})
it('discards an old active snapshot after server WAITING without reviving its game input', () => {
  completedRound()
  send('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'old-game', version: 0, state: board(false) })
  expect(useGame.getState()).toMatchObject({ game: null, permittedGameId: '', completedGameId: 'old-game' })
  expect(tableBusy()).toBe(false)
})
it('preparing the next round clears every terminal presentation field, including a previously restored snapshot', () => {
  completedRound()
  useGame.setState({ game: { gameId: 'old-game', version: 9, role: 'PLAYER', omok: board() },
    permittedGameId: 'old-game', recovery: 'FINISHED' })
  returnToWaiting()
  expect(useGame.getState()).toMatchObject({ game: null, result: null, lastResult: null, permittedGameId: '',
    completedGameId: 'old-game', recovery: 'LOBBY', awaitingVersion: -1, uncertain: false })
  expect(getGathering()).toBeNull()
})
it('ignores unscoped historical terminal recovery while the current table is waiting', () => {
  start('WAITING', 1, null)
  send('GAME_CONNECTION_STATE', { status: 'FINISHED', gameId: 'another-table-game', version: 9, state: board() })
  expect(useGame.getState()).toMatchObject({ game: null, permittedGameId: '', completedGameId: '' })
  expect(getGathering()).toBeNull()
  expect(tableBusy()).toBe(false)
})
it('keeps genuine new active recovery and unsettled results protected', () => {
  completedRound()
  start('PLAYING', 4, 'new-game')
  send('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'new-game', version: 0, state: board(false) })
  send('GAME_CONNECTION_STATE', { status: 'FINISHED', gameId: 'old-game', version: 99, state: board() })
  returnToWaiting()
  expect(useGame.getState().permittedGameId).toBe('new-game')
  expect(tableBusy()).toBe(true)
  start('SETTLING', 5, 'new-game')
  send('GAME_RESULT', { ...result, gameSessionId: 'new-game', settlementStatus: 'PENDING', myCoinDelta: null })
  returnToWaiting()
  expect(useGame.getState().lastResult?.settlementStatus).toBe('PENDING')
  expect(tableBusy()).toBe(true)
})
it('does not release a terminal RESTORED recovery before server WAITING has been confirmed', () => {
  send('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'old-game', version: 9, state: board() })
  send('GAME_RESULT', { ...result, settlementStatus: 'PENDING', myCoinDelta: null })
  returnToWaiting()
  expect(tableBusy()).toBe(true)
  expect(useGame.getState()).toMatchObject({ recovery: 'RESTORED', permittedGameId: 'old-game' })
  expect(useGame.getState().lastResult?.settlementStatus).toBe('PENDING')
})
