import { integer, record } from '../../network/protocol'

export interface JumpmapRankingEntry { rank: number; userId: string; nickname: string; finishMs: number; finishedAt: string }
export interface JumpmapRankings { items: JumpmapRankingEntry[]; me: JumpmapRankingEntry | null }
const entry = (value: unknown): value is JumpmapRankingEntry => record(value) && integer(value.rank) && value.rank > 0
  && typeof value.userId === 'string' && typeof value.nickname === 'string' && integer(value.finishMs) && value.finishMs > 0
  && typeof value.finishedAt === 'string' && Number.isFinite(Date.parse(value.finishedAt))
export function parseJumpmapRankings(value: unknown): JumpmapRankings {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 50 || !value.items.every(entry)
    || value.me !== null && !entry(value.me)) throw new Error('랭킹 응답을 확인하지 못했어요.')
  return { items: value.items as JumpmapRankingEntry[], me: value.me as JumpmapRankingEntry | null }
}
