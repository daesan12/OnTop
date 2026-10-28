import { record } from '../../network/protocol'

export const BUNGEOPPANG_RANKINGS_ENABLED = import.meta.env.VITE_BUNGEOPPANG_RANKINGS === 'true'
export interface RankingEntry { rank: number; userId: string; nickname: string; made: number; failed: number; completedAt: string }
export interface RankingPage {
  rulesVersion: string; period: 'ALL_TIME'; basis: 'PERSONAL_BEST'; snapshotId: string; updatedAt: string
  totalParticipants: number; items: RankingEntry[]; me: RankingEntry | null; nextCursor: string | null
}
const whole = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v)
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
const text = (v: unknown, max = 160): v is string => typeof v === 'string' && !!v.trim() && v.length <= max
const invalid = (): never => { throw new Error('랭킹 응답을 확인하지 못했어요. 다시 불러와 주세요.') }
export function compareRanking(a: RankingEntry, b: RankingEntry) {
  return b.made - a.made || a.failed - b.failed || Date.parse(a.completedAt) - Date.parse(b.completedAt)
    || a.userId.length - b.userId.length || a.userId.localeCompare(b.userId)
}
function entry(value: unknown, total: number): RankingEntry {
  if (!record(value) || !whole(value.rank) || value.rank < 1 || value.rank > total || !id(value.userId)
    || !text(value.nickname, 40) || !whole(value.made) || !whole(value.failed) || !date(value.completedAt)) return invalid()
  return { rank: value.rank, userId: value.userId, nickname: value.nickname, made: value.made, failed: value.failed, completedAt: value.completedAt }
}
function validOrder(items: RankingEntry[]) {
  const users = new Set<string>()
  for (let i = 0; i < items.length; i++) {
    const current = items[i]!, before = items[i - 1]
    if (users.has(current.userId)) return false
    users.add(current.userId)
    if (!before) continue
    const tie = before.made === current.made && before.failed === current.failed
    if (compareRanking(before, current) > 0 || (tie ? before.rank !== current.rank : before.rank >= current.rank)) return false
  }
  return true
}
/** Draft read-only contract; never manufacture a rank or infer global ranks from a local page. */
export function parseRanking(value: unknown, rulesVersion: string, ownId: string): RankingPage {
  if (!record(value) || value.rulesVersion !== rulesVersion || value.period !== 'ALL_TIME' || value.basis !== 'PERSONAL_BEST'
    || !text(value.snapshotId) || !date(value.updatedAt) || !whole(value.totalParticipants)
    || !Array.isArray(value.items) || value.items.length > 20 || value.items.length > value.totalParticipants
    || !(value.nextCursor === null || text(value.nextCursor, 512))) return invalid()
  const items = value.items.map(item => entry(item, value.totalParticipants as number))
  const me = value.me === null ? null : entry(value.me, value.totalParticipants)
  if (!validOrder(items) || me && me.userId !== ownId || value.nextCursor && !items.length) return invalid()
  return { rulesVersion, period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: value.snapshotId,
    updatedAt: value.updatedAt, totalParticipants: value.totalParticipants, items, me, nextCursor: value.nextCursor }
}
export function appendRanking(previous: RankingPage, next: RankingPage) {
  const items = [...previous.items, ...next.items]
  if (previous.snapshotId !== next.snapshotId || previous.rulesVersion !== next.rulesVersion
    || previous.totalParticipants !== next.totalParticipants || !validOrder(items) || items.length > next.totalParticipants
    || next.nextCursor !== null && next.nextCursor === previous.nextCursor) return invalid()
  return { ...next, items }
}
export async function fetchRanking(requestJSON: (path: string, init?: RequestInit) => Promise<unknown>, rulesVersion: string,
  ownId: string, signal: AbortSignal, cursor?: string) {
  const params = new URLSearchParams({ period: 'ALL_TIME', rulesVersion, limit: '20' })
  if (cursor) params.set('cursor', cursor)
  return parseRanking(await requestJSON(`/api/v1/minigames/bungeoppang/rankings?${params}`, { signal, cache: 'no-store' }), rulesVersion, ownId)
}
