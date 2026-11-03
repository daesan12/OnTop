import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiceGame } from '../../src/game/protocol'
import { useGame } from '../../src/game/store'
import { useSession } from '../../src/network/worldClient'
import { resetSeatedLook, seatScope, useTableLobby } from '../../src/features/tableLobby/state'
import { inputState } from '../../src/world/inputOwnership'
import { canDragDiceView, cupMotion, resetDiceUI, toggleDiceView, useDiceUI } from '../../src/game/farkle/controls'

const game = (): DiceGame => ({ gameId: 'g', version: 1, role: 'PLAYER', dice: {
  gameCode: 'DICE', status: 'PLAYING', players: ['a', 'b'], scores: [0, 0], targetScore: 4000,
  turnTimeLimitMs: 30000, turnDeadline: '2099-01-01T00:00:30Z', turnUserId: 'a', turnScore: 0,
  dice: [], stage: 'AWAITING_ROLL', rollId: 0, round: 1, hotDice: false, lastEvent: 'START',
  winnerUserId: null, endReason: null, endedAt: null,
} })
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', { hidden: false, querySelector: () => null })
  Object.keys(inputState).forEach(key => { inputState[key as keyof typeof inputState] = false })
  resetDiceUI(); resetSeatedLook()
  useSession.setState({ sessionId: 'a', tableId: 't', seatIndex: 0, status: 'connected', mapCompatible: true })
  useGame.setState({ game: game() })
})
afterEach(() => { resetDiceUI(); resetSeatedLook(); vi.unstubAllGlobals() })

describe('player dice camera toggle', () => {
  it('switches board and surroundings without changing confirmed game state', () => {
    const before = useGame.getState().game
    expect(toggleDiceView()).toBe(true)
    expect(useTableLobby.getState().lookScope).toBe(seatScope(useSession.getState()))
    expect(toggleDiceView()).toBe(true)
    expect(useTableLobby.getState().lookScope).toBe('')
    expect(useDiceUI.getState().boardView).toBe(true)
    expect(useGame.getState().game).toBe(before)
  })
  it('returns to the board from the default opponent-turn view or a right-drag view', () => {
    const current = game(); current.dice.turnUserId = 'b'; useGame.setState({ game: current })
    expect(toggleDiceView()).toBe(true)
    expect(useDiceUI.getState().boardView).toBe(true)
    useTableLobby.setState({ lookScope: seatScope(useSession.getState()) })
    expect(toggleDiceView()).toBe(true)
    expect(useTableLobby.getState().lookScope).toBe('')
  })
  it('cancels a held cup before changing view so releasing cannot roll it', () => {
    expect(canDragDiceView()).toBe(true)
    const cancel = vi.fn(); cupMotion.cancel = cancel
    useDiceUI.setState({ cup: 'ready', selectedIds: [1, 2] })
    expect(canDragDiceView()).toBe(false)
    expect(toggleDiceView()).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(useDiceUI.getState()).toMatchObject({ cup: 'idle', selectedIds: [1, 2] })
    expect(canDragDiceView()).toBe(true)
    cupMotion.cancel = () => {}
  })
  it('leaves modal/text owners, disconnected seats, spectators and finished games alone', () => {
    for (const key of ['chatOpen', 'manualOpen', 'minigameOpen'] as const) {
      inputState[key] = true; expect(toggleDiceView()).toBe(false); inputState[key] = false
    }
    vi.stubGlobal('document', { hidden: false, querySelector: () => ({ open: true }) })
    expect(toggleDiceView()).toBe(false)
    vi.stubGlobal('document', { hidden: true, querySelector: () => null })
    expect(toggleDiceView()).toBe(false)
    vi.stubGlobal('document', { hidden: false, querySelector: () => null })
    useSession.setState({ status: 'reconnecting' }); expect(toggleDiceView()).toBe(false)
    useSession.setState({ status: 'connected', mapCompatible: false }); expect(toggleDiceView()).toBe(false)
    useSession.setState({ mapCompatible: true, seatIndex: -1 }); expect(toggleDiceView()).toBe(false)
    useSession.setState({ seatIndex: 0 }); useGame.setState({ game: { ...game(), role: 'SPECTATOR' } })
    expect(toggleDiceView()).toBe(false)
    const finished = game(); finished.dice.status = 'FINISHED'; useGame.setState({ game: finished })
    expect(toggleDiceView()).toBe(false)
    expect(useTableLobby.getState().lookScope).toBe('')
    useGame.setState({ game: null }); expect(canDragDiceView()).toBe(false)
  })
})
