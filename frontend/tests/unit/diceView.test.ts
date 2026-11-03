import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiceGame } from '../../src/game/protocol'
import { useGame } from '../../src/game/store'
import { useSession } from '../../src/network/worldClient'
import { resetSeatedLook, useTableLobby } from '../../src/features/tableLobby/state'
import { inputState } from '../../src/world/inputOwnership'
import { installDiceControls, resetDiceUI, useDiceUI } from '../../src/game/farkle/controls'

const game = (): DiceGame => ({ gameId: 'g', version: 1, role: 'PLAYER', dice: {
  gameCode: 'DICE', status: 'PLAYING', players: ['a', 'b'], scores: [0, 0], targetScore: 4000,
  turnTimeLimitMs: 30000, turnDeadline: '2099-01-01T00:00:30Z', turnUserId: 'a', turnScore: 0,
  dice: [], stage: 'AWAITING_ROLL', rollId: 0, round: 1, hotDice: false, lastEvent: 'START',
  winnerUserId: null, endReason: null, endedAt: null,
} })
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, querySelector: () => null }))
  Object.keys(inputState).forEach(key => { inputState[key as keyof typeof inputState] = false })
  resetDiceUI(); resetSeatedLook()
  useSession.setState({ sessionId: 'a', tableId: 't', seatIndex: 0, status: 'connected', mapCompatible: true })
  useGame.setState({ game: game() })
})
afterEach(() => { resetDiceUI(); resetSeatedLook(); vi.unstubAllGlobals() })

describe('player dice keyboard ownership', () => {
  const press = (code: string) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code })
    window.dispatchEvent(event); return event
  }
  it('clears a lobby look on game entry and leaves Tab to normal focus navigation', () => {
    useTableLobby.setState({ lookScope: 'stale-seat' })
    const dispose = installDiceControls()
    expect(useTableLobby.getState().lookScope).toBe('')
    expect(press('Tab').defaultPrevented).toBe(false)
    expect(useDiceUI.getState().boardView).toBe(false)
    expect(useTableLobby.getState().lookScope).toBe('')
    dispose()
  })
  it('consumes cup cancellation and scorebook closing before the forfeit shortcut', () => {
    const dispose = installDiceControls()
    useDiceUI.setState({ cup: 'ready' })
    expect(press('Escape').defaultPrevented).toBe(true)
    expect(useDiceUI.getState().cup).toBe('idle')
    press('KeyT'); expect(useDiceUI.getState().scoreOpen).toBe(true)
    expect(press('Escape').defaultPrevented).toBe(true)
    expect(useDiceUI.getState().scoreOpen).toBe(false)
    expect(press('Escape').defaultPrevented).toBe(false)
    dispose()
  })
})
