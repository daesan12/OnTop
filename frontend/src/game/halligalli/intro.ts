import { create } from 'zustand'
import { useGame } from '../store'
import type { Game, StartState } from '../protocol'
import type { HalliGalli } from './protocol'

/** How long the start rule card stays up. Presentation only: the server clock and input never wait for it. */
export const INTRO_MS = 2000
/** The first turn must have begun this recently; a later view of the same state is a late join, not a start. */
const FRESH_MS = 2000

/** The server's very first state of a match: nothing has happened yet (version 0) and the first turn just began. */
export function freshStart(h: HalliGalli, now: number) {
  if (h.status !== 'PLAYING' || h.version !== 0 || h.flipSeq !== 0 || h.lastEvent || !h.flipDeadline) return false
  const age = now - (Date.parse(h.flipDeadline) - h.flipTimeLimitMs)
  return age >= -FRESH_MS && age < FRESH_MS
}

/**
 * Plays only when this tab saw the table before the start (waiting or start check) and then the match's first state.
 * A refresh, a reconnect or a spectator joining arrive straight in PLAYING, so they never arm it; one play per game.
 */
export interface IntroWatch { armed: boolean; played: string[] }
const PRE_START = ['WAITING', 'STARTING', 'CONFIRMED']
export function watchIntro(w: IntroWatch, start: StartState | null, game: Game | null, now: number): { watch: IntroWatch; play: string | null } {
  if (start && !start.simulation && PRE_START.includes(start.phase)) return { watch: { ...w, armed: true }, play: null }
  if (!start || start.phase === 'NOT_SEATED') return { watch: { ...w, armed: false }, play: null }
  const h = game?.halli
  if (!w.armed || !game || !h || game.role !== 'PLAYER' || w.played.includes(game.gameId) || !freshStart(h, now)) return { watch: w, play: null }
  return { watch: { armed: false, played: [...w.played.slice(-7), game.gameId] }, play: game.gameId }
}

export const useHalliIntro = create<{ gameId: string; at: number }>(() => ({ gameId: '', at: 0 }))
/** Milliseconds the card still shows for this game (performance clock); 0 or less once it is over. */
export const introLeft = (intro: { gameId: string; at: number }, gameId: string, now: number) =>
  intro.gameId === gameId && intro.gameId !== '' ? INTRO_MS - (now - intro.at) : 0

let watch: IntroWatch = { armed: false, played: [] }
// Installed when the module loads (GamePanel imports the panel up front), so the waiting phase is already seen.
useGame.subscribe(s => {
  const next = watchIntro(watch, s.start, s.game, Date.now())
  watch = next.watch
  if (next.play) useHalliIntro.setState({ gameId: next.play, at: performance.now() })
})
