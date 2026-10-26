import { beforeEach, expect, it } from 'vitest'
import type { TableState } from '../../src/network/protocol'
import type { Result, StartState } from '../../src/game/protocol'
import { gatheringModel } from '../../src/features/tableLobby/gatheringModel'
import { gatheringCameraActive, getGathering, returnToWaiting } from '../../src/features/tableLobby/gathering'
import { resetGame, useGame } from '../../src/game/store'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { resetTableLobby, seatScope, useTableLobby } from '../../src/features/tableLobby/state'

const table: TableState = { tableId: 't', version: 1, capacity: 4, minimumPlayers: 2, allReady: false,
  gameCode: 'ONE_CARD', targetScore: null, betAmountPerPlayer: 1, selectorUserId: 'a', seats: ['a', 'b', 'c', 'd'].map((userId, i) => ({ userId, seatNumber: i + 1, ready: i === 1 })) }
const start: StartState = { tableId: 't', revision: 1, phase: 'WAITING', startAttemptId: null, gameCode: 'ONE_CARD', gameSessionId: null, code: null, simulation: false }
const result: Result = { gameSessionId: 'g', version: 1, gameCode: 'ONE_CARD', status: 'FINISHED', settlementStatus: 'PENDING', myCoinDelta: null,
  participants: [{ userId: 'a', result: 'WIN' }, { userId: 'b', result: 'LOSE' }, { userId: 'c', result: 'FORFEIT' }, { userId: 'd', result: 'LOSE' }] }
const model = (r: Result | null = null, s = start) => gatheringModel({ table, ownId: 'a', game: null, result: r, start: s, nickname: id => id })
beforeEach(() => { resetWorld(); resetGame(); resetTableLobby() })
it('presents public readiness and real empty seats without invented spectators', () => {
  const m = model(); expect(m.finished).toBe(false); expect(m.headline).toBe('준비 1 / 4명')
  expect(m.rows).toHaveLength(4); expect(m.rows[1]?.label).toBe('준비 완료')
})
it('does not enable preparation for a game outside the installed UI contracts', () => {
  expect(gatheringModel({ table: { ...table, gameCode: 'UNSUPPORTED' }, ownId: 'a', game: null, result: null, start, nickname: id => id }).playable).toBe(false)
})
it('uses server results without inferring ordinal rankings or payout for others', () => {
  const m = model(result); expect(m.headline).toBe('a 승리'); expect(m.rows.map(r => r.label)).toEqual(['승리', '패배', '기권', '패배'])
  expect(m.settlement).toBe('정산 대기 중'); expect(m.canReturn).toBe(false)
})
it('supports joint victory, draws and invalid outcomes without selecting a winner locally', () => {
  expect(model({ ...result, participants: [{ userId: 'a', result: 'WIN' }, { userId: 'b', result: 'WIN' }] }).headline).toBe('a · b 공동 승리')
  expect(model({ ...result, participants: [{ userId: 'a', result: 'DRAW' }] }).headline).toBe('무승부입니다')
  expect(model({ ...result, status: 'INVALID', participants: [{ userId: 'a', result: 'INVALID' }] }).rows[0]?.label).toBe('무효')
})
it('requires both authoritative WAITING and SETTLED before returning to preparation', () => {
  expect(model({ ...result, settlementStatus: 'SETTLED', myCoinDelta: 0 }).canReturn).toBe(true)
  expect(model({ ...result, settlementStatus: 'SETTLED' }, { ...start, phase: 'SETTLING' }).canReturn).toBe(false)
  expect(model({ ...result, settlementStatus: 'SETTLED' }, { ...start, simulation: true }).canReturn).toBe(false)
  expect(model({ ...result, settlementStatus: 'SETTLED' }, { ...start, tableId: 'other' }).canReturn).toBe(false)
})
it('preparation stays in the table panel; only an approved own result opens the gathering camera', () => {
  useSession.setState({ sessionId: 'a', tableId: 't', seatIndex: 0, status: 'connected', tableStates: { t: table } })
  useGame.setState({ start }); expect(getGathering()).toBeNull(); expect(gatheringCameraActive()).toBe(false)
  useGame.setState({ lastResult: result }); expect(getGathering()?.finished).toBe(true); expect(gatheringCameraActive()).toBe(true)
  useTableLobby.setState({ lookScope: seatScope(useSession.getState()) }); expect(gatheringCameraActive()).toBe(false)
  useSession.setState({ tableId: '' }); expect(getGathering()).toBeNull(); expect(gatheringCameraActive()).toBe(false)
})
it('returning to waiting dismisses presentation only and preserves the authoritative round', () => {
  useSession.setState({ sessionId: 'a', tableId: 't', seatIndex: 0, status: 'connected', tableStates: { t: table } })
  useGame.setState({ start, lastResult: result }); returnToWaiting(); expect(useGame.getState().lastResult).toBe(result)
  useGame.setState({ lastResult: { ...result, settlementStatus: 'SETTLED', myCoinDelta: 0 } }); returnToWaiting()
  expect(useGame.getState().lastResult).toBeNull(); expect(useGame.getState().start).toBe(start)
  expect(useSession.getState().tableId).toBe('t'); expect(useGame.getState().dismissedResult).toEqual({ gameId: 'g', version: 1 })
})
