import type { OneCard } from './protocol'

export const SHUFFLE_MS = 1000, DEAL_GAP_MS = 95, DEAL_FLIGHT_MS = 420
/** Use the first server turn's clock. Joining late never replays a completed deal. */
export function openingAge(state: OneCard, version: number, now: number) {
  if ((!state.dealEndsAt && version !== 0) || state.status !== 'PLAYING' || state.turnCount !== 1 || !state.turnDeadline
    || state.players.some(player => !player.active || player.cardCount !== 7)) return Infinity
  const start = state.dealEndsAt ? Date.parse(state.dealEndsAt) - openingDuration(state.players.length)
    : Date.parse(state.turnDeadline) - state.turnTimeLimitMs
  return Math.max(0, now - start)
}
export const dealArrival = (round: number, seat: number, players: number) =>
  SHUFFLE_MS + (round * players + seat) * DEAL_GAP_MS + DEAL_FLIGHT_MS
export const openingDuration = (players: number) => dealArrival(6, players - 1, players)
export const openingActive = (state: OneCard, version: number, now: number) =>
  openingAge(state, version, now) < openingDuration(state.players.length)
export function dealtCount(state: OneCard, version: number, userId: string, now: number) {
  const seat = state.players.findIndex(player => player.userId === userId)
  if (seat < 0) return 0
  const age = openingAge(state, version, now)
  if (!Number.isFinite(age)) return state.players[seat]!.cardCount
  return Array.from({ length: 7 }, (_, round) => dealArrival(round, seat, state.players.length))
    .filter(arrival => age >= arrival).length
}
