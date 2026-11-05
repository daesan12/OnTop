import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DiceGame } from '../../src/game/protocol'
import { LEDGER_CATEGORIES } from '../../src/game/ledger/protocol'
import { installLedgerControls, rollLedger } from '../../src/game/ledger/controls'
import { installDiceControls, resetDiceUI, rollDice } from '../../src/game/farkle/controls'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import { useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'

const runtime = vi.hoisted(() => ({ actLedger: vi.fn(async () => {}), actDice: vi.fn(async () => {}) }))
vi.mock('../../src/park/runtime/runtime', () => ({ parkRuntime: runtime }))

const press = (code: string) => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code }))
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, querySelector: () => null }))
  Object.keys(inputState).forEach(key => { inputState[key as keyof typeof inputState] = false })
  resetGame(); resetDiceUI(); runtime.actLedger.mockClear(); runtime.actDice.mockClear()
})
afterEach(() => { resetDiceUI(); vi.unstubAllGlobals() })

it('ledger: open chat keeps R as text, but the roll button still rolls', () => {
  useSession.setState({ sessionId: '101', status: 'connected', pending: false })
  const scores = Object.fromEntries(LEDGER_CATEGORIES.map(c => [c, null]))
  const players = ['101', '102'].map(userId => ({ userId, forfeited: false, scores, upperSubtotal: 0, upperBonus: 0, total: 0 }))
  receiveGame({ type: 'GAME_CONNECTION_STATE', requestId: null, payload: { status: 'RESTORED', gameId: 'ledger', version: 1,
    state: { publicState: { gameCode: 'DICE_LEDGER', status: 'PLAYING', turnTimeLimitMs: 20000, maxRolls: 3,
      upperBonusThreshold: 63, upperBonus: 35, turnUserId: '101', turnId: 1, round: 1, rollCount: 0, rollId: 0,
      lastEvent: 'START', turnDeadline: new Date(Date.now() + 20_000).toISOString(), endReason: null, endedAt: null,
      categories: [...LEDGER_CATEGORIES], winnerUserIds: [], players, dice: [], lastScored: null }, privateState: {} } } }, '101', 't')
  const dispose = installLedgerControls()
  inputState.chatOpen = true
  press('KeyR')
  expect(runtime.actLedger).not.toHaveBeenCalled()
  expect(rollLedger()).toBe(true)
  expect(runtime.actLedger).toHaveBeenCalledWith({ kind: 'roll', keepIds: [] })
  // 채팅 외의 패널은 여전히 클릭 입력도 가린다.
  inputState.chatOpen = false; inputState.manualOpen = true
  expect(rollLedger()).toBe(false)
  dispose()
})

it('farkle: open chat keeps R as text, but the roll button still rolls', () => {
  useSession.setState({ sessionId: 'a', status: 'connected', pending: false })
  const game: DiceGame = { gameId: 'g', version: 1, role: 'PLAYER', dice: {
    gameCode: 'DICE', status: 'PLAYING', players: ['a', 'b'], scores: [0, 0], targetScore: 4000,
    turnTimeLimitMs: 30000, turnDeadline: '2099-01-01T00:00:30Z', turnUserId: 'a', turnScore: 0,
    dice: [], stage: 'AWAITING_ROLL', rollId: 0, round: 1, hotDice: false, lastEvent: 'START',
    winnerUserId: null, endReason: null, endedAt: null } }
  useGame.setState({ game, permittedGameId: 'g', recovery: 'RESTORED' })
  const dispose = installDiceControls()
  inputState.chatOpen = true
  press('KeyR')
  expect(runtime.actDice).not.toHaveBeenCalled()
  expect(rollDice()).toBe(true)
  expect(runtime.actDice).toHaveBeenCalledWith('roll', [])
  inputState.chatOpen = false; inputState.mapOpen = true
  expect(rollDice()).toBe(false)
  dispose()
})
