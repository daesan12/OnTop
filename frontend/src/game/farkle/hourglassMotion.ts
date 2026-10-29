export const HOURGLASS_FLIP_MS = 850
export type HourglassMotion = { gameId: string; round: number; turn: string; from: number; to: number; at: number; flips: number }
export function hourglassMotion(previous: HourglassMotion | null, gameId: string, round: number, turn: string, now: number): HourglassMotion {
  if (!previous || previous.gameId !== gameId) return { gameId, round, turn, from: 0, to: 0, at: now, flips: 0 }
  if (round < previous.round || (round === previous.round && turn === previous.turn)) return previous
  const turns = Math.max(1, round - previous.round)
  // A resumed snapshot may skip several expired turns. Keep parity without replaying unbounded spins.
  const visibleTurns = turns % 2 || 2
  const from = hourglassAngle(previous, now), to = previous.to + Math.PI * visibleTurns
  return { gameId, round, turn, from, to, at: now, flips: previous.flips + turns }
}
export function hourglassAngle(motion: HourglassMotion, now: number) {
  const p = Math.max(0, Math.min(1, (now - motion.at) / HOURGLASS_FLIP_MS))
  const eased = p * p * (3 - 2 * p)
  return motion.from + (motion.to - motion.from) * eased
}
export function sandRemaining(deadline: string | null, limit: number, now: number) {
  const end = deadline ? Date.parse(deadline) : NaN
  return Number.isFinite(end) && limit > 0 ? Math.max(0, Math.min(1, (end - now) / limit)) : 0
}
