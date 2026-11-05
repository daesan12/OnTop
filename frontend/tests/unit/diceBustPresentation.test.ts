import { describe, expect, it, vi } from 'vitest'
import type { DiceGame, Farkle } from '../../src/game/protocol'
import { bustMatches, createBustPresentation, DICE_ROLL_MS, BUST_NOTICE_MS } from '../../src/game/farkle/bustPresentation'
import { installDicePresentation, useDiceUI } from '../../src/game/farkle/controls'
import { useGame } from '../../src/game/store'
import { useSession } from '../../src/network/worldClient'

const game = (patch: Partial<Farkle> = {}): DiceGame => ({ gameId: 'g', version: 1, role: 'PLAYER', dice: {
  gameCode: 'DICE', status: 'PLAYING', players: ['a', 'b'], scores: [0, 0], targetScore: 4000,
  turnTimeLimitMs: 30000, turnDeadline: '2099-01-01T00:00:30Z', turnUserId: 'a', turnScore: 0,
  dice: [], stage: 'AWAITING_ROLL', rollId: 0, round: 1, hotDice: false, lastEvent: 'START',
  winnerUserId: null, endReason: null, endedAt: null, ...patch,
} })
const busted = () => game({ lastEvent: 'BUST', turnUserId: 'b', rollId: 1, round: 2 })

describe('server-owned BUST with an empty next-turn dice list', () => {
  it('uses only the matching server receipt and knows an opponent reroll count from held flags', () => {
    const resultDice = [1, 1, 2, 3, 4, 6].map((value, id) => ({ id, value, held: id < 2 }))
    const next = { ...busted(), dice: { ...busted().dice, lastRoll: { rollId: 1, actorUserId: 'a', dice: resultDice } } }
    const receipt = createBustPresentation(game(), next, null, 0)!
    expect(receipt.resultDice).toEqual(resultDice)
    expect(receipt.rollingIds).toEqual([2, 3, 4, 5])
    next.dice.lastRoll.actorUserId = 'b'
    expect(createBustPresentation(game(), next, [], 0)!.resultDice).toEqual([])
    next.dice.lastRoll.actorUserId = 'a'; next.dice.lastRoll.rollId = 0
    expect(createBustPresentation(game(), next, [], 0)!.resultDice).toEqual([])
  })
  it('keeps a first roll visible before revealing the result without changing the snapshot or deadline', () => {
    const next = busted(), original = JSON.stringify(next)
    const bust = createBustPresentation(game(), next, [], 100)!
    expect(bust.rollingIds).toEqual([0, 1, 2, 3, 4, 5])
    expect(bust.actorId).toBe('a')
    expect(bust.phase).toBe('rolling')
    expect(bust.revealAt).toBe(100 + DICE_ROLL_MS)
    expect(bust.until).toBe(100 + DICE_ROLL_MS + BUST_NOTICE_MS)
    expect(JSON.stringify(next)).toBe(original)
    expect(bust).not.toHaveProperty('faces')
  })
  it('only animates the acting player’s known rerolled dice and handles all-six rerolls', () => {
    const before = game({ stage: 'SELECTING', dice: [1, 1, 1, 5, 3, 2].map((value, id) => ({ id, value, held: id === 0 })) })
    expect(createBustPresentation(before, busted(), [1, 2, 3], 0)!.rollingIds).toEqual([4, 5])
    expect(createBustPresentation(before, busted(), [1, 2, 3, 4, 5], 0)!.rollingIds).toHaveLength(6)
    expect(createBustPresentation(before, busted(), null, 0)!.rollingIds).toEqual([])
  })
  it('does not replay initial, duplicate, normal, skipped or cross-game states', () => {
    const before = game(), next = busted()
    expect(createBustPresentation(null, next, [], 0)).toBeNull()
    expect(createBustPresentation(next, next, [], 0)).toBeNull()
    expect(createBustPresentation(before, game({ lastEvent: 'ROLL', rollId: 1 }), [], 0)).toBeNull()
    expect(createBustPresentation(before, { ...next, gameId: 'other' }, [], 0)).toBeNull()
    expect(createBustPresentation(before, game({ ...next.dice, rollId: 4, round: 5 }), [], 0)).toBeNull()
    expect(createBustPresentation(before, game({ ...next.dice, status: 'FINISHED' }), [], 0)).toBeNull()
  })
  it('allows receipt refreshes but invalidates the presentation for a later roll, turn, result or game', () => {
    const next = busted(), bust = createBustPresentation(game(), next, [], 0)!
    expect(bustMatches({ ...next, version: 2 }, bust)).toBe(true)
    expect(bustMatches(game({ ...next.dice, rollId: 2, lastEvent: 'ROLL' }), bust)).toBe(false)
    expect(bustMatches(game({ ...next.dice, round: 3 }), bust)).toBe(false)
    expect(bustMatches(game({ ...next.dice, status: 'FINISHED' }), bust)).toBe(false)
    expect(bustMatches({ ...next, gameId: 'other' }, bust)).toBe(false)
  })
})

function livePresentation(check: () => void) {
  const previousGame = useGame.getState(), previousSession = useSession.getState()
  vi.useFakeTimers(); vi.setSystemTime(100)
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  useSession.setState({ sessionId: 'a', roomId: 'room', status: 'connected' })
  useGame.setState({ game: game(), recovery: 'RESTORED', pending: false, permittedGameId: 'g' })
  const dispose = installDicePresentation()
  try { check() } finally {
    dispose(); useGame.setState(previousGame, true); useSession.setState(previousSession, true)
    vi.restoreAllMocks(); vi.useRealTimers()
  }
}

describe('BUST presentation lifecycle', () => {
  it('reveals after rolling and releases once without extending for duplicate receipts', () => livePresentation(() => {
    useGame.setState({ game: { ...busted(), version: 2 } })
    expect(useDiceUI.getState().bust?.phase).toBe('rolling')
    const until = useDiceUI.getState().animationUntil
    vi.advanceTimersByTime(DICE_ROLL_MS - 1)
    expect(useDiceUI.getState().bust?.phase).toBe('rolling')
    vi.advanceTimersByTime(1)
    expect(useDiceUI.getState().bust?.phase).toBe('result')
    useGame.setState({ game: { ...busted(), version: 3 } })
    expect(useDiceUI.getState().animationUntil).toBe(until)
    vi.advanceTimersByTime(BUST_NOTICE_MS)
    expect(useDiceUI.getState().bust).toBeNull()
    expect(useDiceUI.getState().animationUntil).toBe(0)
    useGame.setState({ game: { ...busted(), version: 4 } })
    expect(useDiceUI.getState().bust).toBeNull()
  }))
  it('cancels old timers when a new roll arrives and leaves that animation intact', () => livePresentation(() => {
    useGame.setState({ game: { ...busted(), version: 2 } })
    vi.advanceTimersByTime(1200)
    useGame.setState({ game: { ...game({ ...busted().dice, lastEvent: 'ROLL', rollId: 2, stage: 'SELECTING',
      dice: [1, 2, 3, 4, 5, 6].map((value, id) => ({ id, value, held: false })) }), version: 3 } })
    expect(useDiceUI.getState().bust).toBeNull()
    const until = useDiceUI.getState().animationUntil
    expect(until).toBe(1300 + DICE_ROLL_MS)
    vi.advanceTimersByTime(500)
    expect(useDiceUI.getState().animationUntil).toBe(until)
  }))
  it('drops pending visuals on recovery or disconnect instead of replaying stale BUST', () => livePresentation(() => {
    useGame.setState({ game: { ...busted(), version: 2 } })
    useGame.setState({ recovery: 'PENDING' })
    expect(useDiceUI.getState().bust).toBeNull()
    useGame.setState({ recovery: 'RESTORED' })
    expect(useDiceUI.getState().bust).toBeNull()
    useSession.setState({ status: 'reconnecting' })
    vi.advanceTimersByTime(DICE_ROLL_MS + BUST_NOTICE_MS)
    expect(useDiceUI.getState().bust).toBeNull()
    expect(useDiceUI.getState().animationUntil).toBe(0)
  }))
  it('supports public spectator snapshots without requiring participant recovery state', () => livePresentation(() => {
    useGame.setState({ game: { ...game(), role: 'SPECTATOR' }, recovery: 'UNKNOWN' })
    useGame.setState({ game: { ...busted(), version: 2, role: 'SPECTATOR' } })
    expect(useDiceUI.getState().bust?.phase).toBe('rolling')
    expect(useDiceUI.getState().bust?.rollingIds).toHaveLength(6)
    vi.advanceTimersByTime(DICE_ROLL_MS)
    expect(useDiceUI.getState().bust?.phase).toBe('result')
  }))
})
