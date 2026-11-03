import type { DiceGame, Game } from '../protocol'

export const DICE_ROLL_MS = 900
export const BUST_NOTICE_MS = 800
export interface BustPresentation {
  key: string; gameId: string; rollId: number; round: number; actorId: string
  at: number; revealAt: number; until: number; phase: 'rolling' | 'result'; rollingIds: number[]
}

/** nextTurn clears the server's dice on BUST. This is motion, never a substitute result. */
export function createBustPresentation(previous: Game | null, next: Game | null, selectedIds: readonly number[] | null, now: number): BustPresentation | null {
  if (!previous?.dice || !next?.dice || previous.gameId !== next.gameId
    || previous.dice.status !== 'PLAYING' || next.dice.status !== 'PLAYING'
    || next.dice.lastEvent !== 'BUST' || next.dice.dice.length || !previous.dice.turnUserId
    || next.dice.rollId !== previous.dice.rollId + 1 || next.dice.round !== previous.dice.round + 1) return null
  const before = previous.dice
  const held = new Set([...before.dice.filter(die => die.held).map(die => die.id), ...(selectedIds ?? [])])
  // A first roll has six dice. Only the acting client knows a reroll's selected IDs.
  // For another player's reroll, animate the cup alone instead of inventing a count.
  const rollingIds = before.stage === 'AWAITING_ROLL' || held.size === 6 ? [0, 1, 2, 3, 4, 5]
    : selectedIds === null ? [] : before.dice.filter(die => !held.has(die.id)).map(die => die.id)
  return { key: `${next.gameId}/${next.dice.rollId}/${next.dice.round}`, gameId: next.gameId,
    rollId: next.dice.rollId, round: next.dice.round, actorId: before.turnUserId!, rollingIds,
    at: now, revealAt: now + DICE_ROLL_MS, until: now + DICE_ROLL_MS + BUST_NOTICE_MS, phase: 'rolling' }
}

export function bustMatches(game: Game | null, bust: BustPresentation | null): game is DiceGame {
  return !!bust && !!game?.dice && game.gameId === bust.gameId && game.dice.status === 'PLAYING'
    && game.dice.rollId === bust.rollId && game.dice.round === bust.round && game.dice.lastEvent === 'BUST'
}
