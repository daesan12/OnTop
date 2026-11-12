import type { PassJudgement } from './jumpRopeJudgement'

export const roundDurationMs = 60_000
export const startingChances = 3

export type RoundEndReason = 'time' | 'missLimit'

const points = { perfect: 15, good: 10, miss: 0 } as const

export function pointsForPass(kind: PassJudgement['kind'], combo: number) {
  return kind === 'perfect' && combo >= 2 ? points.perfect * 2 : points[kind]
}

export function createRoundStats() {
  return {
    score: 0,
    chances: startingChances,
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, good: 0, miss: 0 },
    lastPassNumber: 0,
  }
}

export type RoundStats = ReturnType<typeof createRoundStats>

export function applyPass(stats: RoundStats, { kind, number }: Pick<PassJudgement, 'kind'> & { number: number }): RoundStats {
  if (number <= stats.lastPassNumber || stats.chances === 0) return stats

  const combo = kind === 'perfect' ? stats.combo + 1 : 0
  return {
    score: stats.score + pointsForPass(kind, combo),
    chances: stats.chances - (kind === 'miss' ? 1 : 0),
    combo,
    maxCombo: Math.max(stats.maxCombo, combo),
    counts: { ...stats.counts, [kind]: stats.counts[kind] + 1 },
    lastPassNumber: number,
  }
}
