import { beforeEach, expect, it } from 'vitest'
import { receiveGame, tableBusy, useGame } from '../../src/game/store'
import { resetForfeit, useForfeit } from '../../src/game/forfeit'
import { getGathering, returnToWaiting } from '../../src/features/tableLobby/gathering'
import { canLeaveByMovement } from '../../src/features/tableLobby/model'
import { tabletLobbyActive } from '../../src/features/tableLobby/tabletModel'
import { receiveWalletSettlement, useWalletSettlement } from '../../src/features/wallet/settlementRefresh'
import { resetWorld, useSession } from '../../src/network/worldClient'
import type { Chess } from '../../src/game/chess/protocol'
import type { TableState } from '../../src/network/protocol'

let round = 0
const at = '2026-11-23T00:00:00Z'
const chess = (finished = false): Chess => ({ gameCode: 'CHESS', status: finished ? 'FINISHED' : 'PLAYING',
  board: 'RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr', fen: '',
  whiteUserId: '101', blackUserId: '202', turnUserId: finished ? null : '101',
  turnDeadline: finished ? null : '2026-11-23T00:10:00Z', turnStartedAt: at, remainingMs: [600000, 600000],
  inCheck: false, canClaimDraw: false, legalMoves: [], moves: [], moveCount: 0,
  winnerUserId: finished ? '202' : null, endReason: finished ? 'EXPLICIT_LEAVE' : null,
  endedAt: finished ? at : null, drawOfferedBy: null, drawOffersUsed: [] })
const table: TableState = { tableId: 'table', version: 4, capacity: 2, minimumPlayers: 2, selectorUserId: '101',
  gameCode: 'CHESS', targetScore: null, betAmountPerPlayer: 500, allReady: false, selectedPlayers: 2, startMode: 'MANUAL',
  seats: [{ seatNumber: 1, userId: '101', ready: false }, { seatNumber: 2, userId: '202', ready: false }] }
beforeEach(() => { resetWorld(); resetForfeit(); round++ })

it.each([
  ['101', -500, 'state-first'], ['101', -500, 'result-first'],
  ['202', 500, 'state-first'], ['202', 500, 'result-first'],
] as const)('체스 기권 후 %s의 정산 %s는 %s 순서에도 복귀와 잔액 갱신을 막지 않는다', (own, delta, order) => {
  const id = `chess-forfeit-${round}`
  useSession.setState({ status: 'connected', sessionId: own, roomId: 'channel', tableId: 'table',
    seatIndex: own === '101' ? 0 : 1, tableStates: { table }, mapCompatible: true })
  const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, payload, requestId: null }, own, 'table')
  const start = (phase: string, revision: number) => send('GAME_START_STATE', { tableId: 'table', revision, phase,
    gameSessionId: phase === 'WAITING' ? null : id, gameCode: 'CHESS',
    startAttemptId: phase === 'WAITING' ? null : 'attempt', code: null, simulation: false })
  start('PLAYING', 1)
  useGame.setState({ game: { gameId: id, version: 0, role: 'PLAYER', chess: chess() },
    permittedGameId: id, recovery: 'RESTORED', awaitingVersion: 0, pending: false, uncertain: false })
  if (own === '101') useForfeit.setState({ attempt: { userId: own, gameId: id, actionId: 'stable', status: 'approved', error: '' } })
  const receipt = { version: 2, gameSessionId: id, gameCode: 'CHESS', status: 'FINISHED', endReason: 'EXPLICIT_LEAVE',
    settlementStatus: 'SETTLED', betAmountPerPlayer: 500, myCoinDelta: delta, endedAt: at,
    participants: [{ userId: '101', result: 'FORFEIT' }, { userId: '202', result: 'WIN' }] }
  const endedState = () => send('GAME_STATE', { gameId: id, version: 1, role: 'PLAYER', publicState: chess(true), privateState: {} })
  start('SETTLING', 2)
  if (order === 'state-first') endedState()
  send('GAME_RESULT', receipt)
  if (order === 'result-first') endedState()
  start('WAITING', 3)

  expect(tableBusy()).toBe(false)
  expect(getGathering()).toMatchObject({ finished: true, settled: true, canReturn: true,
    settlement: `내 엽전 ${delta > 0 ? '+' : ''}${delta}냥` })
  const revision = useWalletSettlement.getState().revision
  const message = { type: 'GAME_RESULT', payload: receipt, requestId: null }
  receiveWalletSettlement(message, own)
  receiveWalletSettlement(message, own)
  expect(useWalletSettlement.getState().revision).toBe(revision + 1)
  returnToWaiting()
  send('GAME_CONNECTION_STATE', { status: 'FINISHED', gameId: id, version: 99, state: { ...chess(true), privateState: {} } })
  send('GAME_RESULT', { ...receipt, version: 20 })

  expect(useGame.getState()).toMatchObject({ game: null, permittedGameId: '', completedGameId: id, pending: false })
  expect(getGathering()).toBeNull()
  expect(tableBusy()).toBe(false)
  expect(tabletLobbyActive()).toBe(true)
  expect(canLeaveByMovement(table, own, useGame.getState())).toBe(true)
})

it('체스 정산 대기는 완료로 꾸미지 않고 확정 결과가 오면 준비와 퇴장을 해제한다', () => {
  const id = `chess-pending-${round}`, own = '202'
  useSession.setState({ status: 'connected', sessionId: own, roomId: 'channel', tableId: 'table', seatIndex: 1,
    tableStates: { table }, mapCompatible: true })
  useGame.setState({ game: { gameId: id, version: 1, role: 'PLAYER', chess: chess(true) },
    permittedGameId: id, recovery: 'FINISHED', pending: false, uncertain: false,
    start: { tableId: 'table', revision: 2, phase: 'SETTLING', gameSessionId: id, gameCode: 'CHESS',
      startAttemptId: 'attempt', code: null, simulation: false } })
  const receipt = { version: 2, gameSessionId: id, gameCode: 'CHESS', status: 'FINISHED', endReason: 'EXPLICIT_LEAVE',
    settlementStatus: 'PENDING', betAmountPerPlayer: 500, myCoinDelta: null, endedAt: at,
    participants: [{ userId: '101', result: 'FORFEIT' }, { userId: own, result: 'WIN' }] }
  const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, payload, requestId: null }, own, 'table')
  send('GAME_RESULT', receipt)
  returnToWaiting()
  expect(getGathering()).toMatchObject({ canReturn: false, settled: false, settlement: '정산 대기 중' })
  expect(tableBusy()).toBe(true)
  send('GAME_RESULT', { ...receipt, version: 3, settlementStatus: 'SETTLED', myCoinDelta: 500 })
  send('GAME_START_STATE', { tableId: 'table', revision: 3, phase: 'WAITING', gameSessionId: null,
    gameCode: 'CHESS', startAttemptId: null, code: null, simulation: false })
  returnToWaiting()
  expect(tableBusy()).toBe(false)
  expect(getGathering()).toBeNull()
  expect(tabletLobbyActive()).toBe(true)
})
