import { pointsForPass } from './jumpRopeRules'
import type { JumpRopeRankingState } from './jumpRopeRankingData'

const sampleRuns = [
  { nickname: '골목한바퀴', good: 18, streaks: [7, 9, 11] },
  { nickname: '공원벤치단골', good: 14, streaks: [16, 17, 15] },
  { nickname: '옥상에서구구를외치는줄넘기도전자', good: 12, streaks: [18, 16, 13] },
  { nickname: '지붕위보폭', good: 26, streaks: [5, 7] },
  { nickname: '돌담넘어', good: 19, streaks: [9, 11, 10] },
  { nickname: '한강줄넘기', good: 16, streaks: [22, 17, 10] },
  { nickname: '비둘기반장', good: 20, streaks: [13, 12, 10] },
  { nickname: '신호등밑연습생', good: 29, streaks: [5, 8] },
  { nickname: '노을발끝', good: 21, streaks: [9, 6, 7] },
  { nickname: '발맞춰통통', good: 14, streaks: [14, 14, 14] },
  { nickname: '전봇대친구', good: 27, streaks: [5, 4] },
  { nickname: '가벼운한걸음', good: 22, streaks: [6, 6, 6] },
] as const

export function sampleScore(goodCount: number, ...perfectStreaks: number[]) {
  let score = goodCount * pointsForPass('good', 0)
  for (const streak of perfectStreaks) {
    for (let combo = 1; combo <= streak; combo++) score += pointsForPass('perfect', combo)
  }
  return score
}

export const rankingPreviewStates = {
  ready: { kind: 'ready', entries: sampleRuns.map(({ nickname, good, streaks }) => ({ nickname, score: sampleScore(good, ...streaks) })) },
  loading: { kind: 'loading' },
  empty: { kind: 'ready', entries: [] },
  error: { kind: 'error' },
} satisfies Record<string, JumpRopeRankingState>
