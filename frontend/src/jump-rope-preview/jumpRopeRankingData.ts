export type JumpRopeRankingEntry = { nickname: string; score: number; rank?: number }

export type JumpRopeRankingState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; entries: readonly JumpRopeRankingEntry[]; personalBest?: { score: number; rank?: number }; serverRanked?: boolean }

export function topJumpRopeEntries(entries: readonly JumpRopeRankingEntry[]) {
  return [...entries].sort((a, b) => b.score - a.score).slice(0, 10)
}
