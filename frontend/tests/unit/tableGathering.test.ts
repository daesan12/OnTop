import { beforeEach, expect, it } from 'vitest'
import type { TableState } from '../../src/network/protocol'
import type { Result, StartState } from '../../src/game/protocol'
import { bridgeState } from '../fixtures/bridge'
import { gatheringHit, gatheringModel } from '../../src/features/tableLobby/gatheringModel'
import { gatheringCameraActive, getGathering, returnToWaiting } from '../../src/features/tableLobby/gathering'
import { resetGame, useGame } from '../../src/game/store'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { resetTableLobby, seatScope, useTableLobby } from '../../src/features/tableLobby/state'

const table: TableState = { tableId: 't', version: 1, capacity: 4, minimumPlayers: 2, allReady: false,
  gameCode: 'ONE_CARD', targetScore: null, betAmountPerPlayer: 1, selectorUserId: '101', seats: ['101', '102', '103', '104'].map((userId, i) => ({ userId, seatNumber: i + 1, ready: i === 1 })) }
const start: StartState = { tableId: 't', revision: 1, phase: 'WAITING', startAttemptId: null, gameCode: 'ONE_CARD', gameSessionId: null, code: null, simulation: false }
const result: Result = { gameSessionId: 'g', version: 1, gameCode: 'ONE_CARD', status: 'FINISHED', endReason: 'EMPTY_HAND',
  betAmountPerPlayer: 7, endedAt: '2026-10-26T00:00:00Z', settlementStatus: 'PENDING', myCoinDelta: null,
  participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'LOSE' }, { userId: '103', result: 'FORFEIT' }, { userId: '104', result: 'LOSE' }] }
const model = (r: Result | null = null, s = start) => gatheringModel({ table, ownId: '101', game: null, result: r, start: s, nickname: id => id })
beforeEach(() => { resetWorld(); resetGame(); resetTableLobby() })
it('presents public readiness and real empty seats without invented spectators', () => {
  const m = model(); expect(m.finished).toBe(false); expect(m.headline).toBe('준비 1 / 4명')
  expect(m.rows).toHaveLength(4); expect(m.rows[1]?.label).toBe('준비 완료')
})
it('does not enable preparation for a game outside the installed UI contracts', () => {
  expect(gatheringModel({ table: { ...table, gameCode: 'UNSUPPORTED' }, ownId: '101', game: null, result: null, start, nickname: id => id }).playable).toBe(false)
})
it('uses server results without inferring ordinal rankings or payout for others', () => {
  const m = model(result); expect(m.headline).toBe('101 승리'); expect(m.rows.map(r => r.label)).toEqual(['승리', '패배', '기권', '패배'])
  expect(m.settlement).toBe('정산 대기 중'); expect(m.canReturn).toBe(false)
})
it('supports joint victory, draws and invalid outcomes without selecting a winner locally', () => {
  expect(model({ ...result, participants: [{ userId: '101', result: 'WIN' }, { userId: '102', result: 'WIN' }] }).headline).toBe('101 · 102 공동 승리')
  expect(model({ ...result, participants: result.participants.map(p => ({ ...p, result: 'DRAW' })) }).headline).toBe('무승부입니다')
  const invalid = model({ ...result, status: 'INVALID', endReason: 'ENGINE_LOST', participants: result.participants.map(p => ({ ...p, result: null })) })
  expect(invalid.headline).toBe('무효 경기'); expect(invalid.rows.every(p => p.label === '판정 없음' && !p.winner)).toBe(true)
  expect(invalid.settlement).toBe('무효 경기 · 참가비 7 코인 예약금 반환 대기')
  expect(invalid.canReturn).toBe(false)
})
it('uses the result fee rather than the next table fee and reports a release, not a new payout', () => {
  const invalid: Result = { ...result, status: 'INVALID', endReason: 'ABORTED_NO_PLAYERS', settlementStatus: 'SETTLED', myCoinDelta: 0,
    participants: result.participants.map(p => ({ ...p, result: 'FORFEIT' })) }
  const m = model(invalid)
  expect(table.betAmountPerPlayer).toBe(1); expect(m.headline).toBe('무효 경기')
  expect(m.rows.every(p => p.label === '무효' && !p.winner && !p.score)).toBe(true)
  expect(m.settlement).toBe('예약 해제 완료 · 참가비 7 코인 · 잔액 변화 0')
  expect(m.reason).toBe('종료 사유: ABORTED_NO_PLAYERS'); expect(m.canReturn).toBe(true)
})
it('requires both authoritative WAITING and SETTLED before returning to preparation', () => {
  expect(model({ ...result, settlementStatus: 'SETTLED', myCoinDelta: 0 }).canReturn).toBe(true)
  expect(model({ ...result, settlementStatus: 'SETTLED' }, { ...start, phase: 'SETTLING' }).canReturn).toBe(false)
  expect(model({ ...result, settlementStatus: 'SETTLED' }, { ...start, simulation: true }).canReturn).toBe(false)
  expect(model({ ...result, settlementStatus: 'SETTLED' }, { ...start, tableId: 'other' }).canReturn).toBe(false)
})
it('maps the real canvas UV buttons and ignores non-button regions', () => {
  expect(gatheringHit(726 / 1024, 1 - 572 / 640)).toBe('primary')
  expect(gatheringHit(246 / 1024, 1 - 572 / 640)).toBe('settings')
  expect(gatheringHit(.5, .8)).toBeNull(); expect(gatheringHit(-1, 2)).toBeNull()
})
it('preparation stays in the table panel; only an approved own result opens the gathering camera', () => {
  useSession.setState({ sessionId: '101', tableId: 't', seatIndex: 0, status: 'connected', tableStates: { t: table } })
  useGame.setState({ start }); expect(getGathering()).toBeNull(); expect(gatheringCameraActive()).toBe(false)
  useGame.setState({ lastResult: result, completedGameId: result.gameSessionId }); expect(getGathering()?.finished).toBe(true); expect(gatheringCameraActive()).toBe(true)
  useTableLobby.setState({ lookScope: seatScope(useSession.getState()) }); expect(gatheringCameraActive()).toBe(false)
  useSession.setState({ tableId: '' }); expect(getGathering()).toBeNull(); expect(gatheringCameraActive()).toBe(false)
})
it('returning to waiting dismisses presentation only and preserves the authoritative round', () => {
  useSession.setState({ sessionId: '101', tableId: 't', seatIndex: 0, status: 'connected', tableStates: { t: table } })
  useGame.setState({ start, lastResult: result, completedGameId: result.gameSessionId }); returnToWaiting(); expect(useGame.getState().lastResult).toBe(result)
  useGame.setState({ lastResult: { ...result, settlementStatus: 'SETTLED', myCoinDelta: 0 } }); returnToWaiting()
  expect(useGame.getState().lastResult).toBeNull(); expect(useGame.getState().start).toBe(start)
  expect(useSession.getState().tableId).toBe('t'); expect(useGame.getState().dismissedResult).toEqual({ gameId: 'g', version: 1 })
})
it('opens the same result and camera with a stale PLAYING engine or no engine at all', () => {
  const invalid: Result = { ...result, gameCode: 'LIAR_BRIDGE', status: 'INVALID', endReason: 'ENGINE_LOST',
    participants: result.participants.map(p => ({ ...p, result: null })) }
  useSession.setState({ sessionId: '101', tableId: 't', seatIndex: 0, status: 'connected', tableStates: { t: table } })
  useGame.setState({ start: { ...start, phase: 'SETTLING', gameSessionId: 'g' }, permittedGameId: 'g', result: invalid, lastResult: invalid,
    game: { gameId: 'g', version: 0, role: 'PLAYER', bridge: bridgeState(4), secret: null } })
  expect(getGathering()?.headline).toBe('무효 경기'); expect(gatheringCameraActive()).toBe(true)
  useGame.setState({ game: null })
  expect(getGathering()?.headline).toBe('무효 경기'); expect(gatheringCameraActive()).toBe(true)
  useGame.setState({ result: null, lastResult: { ...invalid, gameSessionId: 'other' } })
  expect(getGathering()).toBeNull(); expect(gatheringCameraActive()).toBe(false)
  useGame.setState({ result: invalid, start: { ...start, tableId: 'other-table' } })
  expect(getGathering()).toBeNull(); expect(gatheringCameraActive()).toBe(false)
  useGame.setState({ start })
  useGame.setState({ result: invalid, watchedGameId: 'watching' })
  expect(getGathering()).toBeNull(); expect(gatheringCameraActive()).toBe(false)
})
