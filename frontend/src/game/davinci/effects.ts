import type { DavinciState, TileColor } from './protocol'
import type { TilePose } from './layout'

export type DrawEffect = { tileId: string; actor: string; color: TileColor; from: TilePose; started: number }
export type GuessEffect = { tileId: string; actor: string; correct: boolean; started: number }
export type TileReaction = { kind: 'correct' | 'wrong' | 'penalty'; started: number }
export function newTileEvent(previous: DavinciState | null, next: DavinciState) {
  return previous && next.version > previous.version && JSON.stringify(previous.lastEvent) !== JSON.stringify(next.lastEvent)
    ? next.lastEvent : null
}

const victories = new Map<string, { seen: number; until: number | null }>()
export function noteLiveMatch(gameId: string, now = Date.now()) {
  const prior = victories.get(gameId)
  victories.set(gameId, { seen: now, until: prior?.until ?? null })
  if (victories.size > 32) victories.delete(victories.keys().next().value!)
}
/** 최근 직접 진행한 경기만 1회 표시한다. 정산 갱신·재마운트는 같은 종료 시각을 사용한다. */
export function victoryStampUntil(gameId: string, now = Date.now()) {
  const record = victories.get(gameId)
  if (!record || now - record.seen > 5000 && record.until === null) return 0
  if (record.until === null) record.until = now + 1600
  return record.until > now ? record.until : 0
}
