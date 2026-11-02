import { record } from '../../network/protocol'

export const BUNGEOPPANG_RANKINGS_ENABLED = import.meta.env.VITE_BUNGEOPPANG_RANKINGS !== 'false'
export interface RankingEntry { rank: number; userId: string; nickname: string; score: number; maxCombo: number; completedAt: string }
export interface RankingPage {
  /** v5 boards are split by the round's stored play length; v4 has one board (null). */
  rulesVersion: string; durationMs: number | null; period: 'ALL_TIME'; basis: 'PERSONAL_BEST'; snapshotId: string; updatedAt: string
  totalParticipants: number; items: RankingEntry[]; me: RankingEntry | null; nextCursor: string | null
}
const whole = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v)
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
const text = (v: unknown, max = 160): v is string => typeof v === 'string' && !!v.trim() && v.length <= max
const invalid = (): never => { throw new Error('랭킹 응답을 확인하지 못했어요. 다시 불러와 주세요.') }
export class RankingScoreUnavailableError extends Error {
  constructor() { super('점수·콤보 기준 랭킹을 준비하고 있어요. 잠시 후 다시 확인해 주세요.') }
}
export function compareRanking(a: RankingEntry, b: RankingEntry) {
  return b.score - a.score || b.maxCombo - a.maxCombo || Date.parse(a.completedAt) - Date.parse(b.completedAt)
    || a.userId.length - b.userId.length || a.userId.localeCompare(b.userId)
}
function entry(value: unknown, total: number): RankingEntry {
  // Older responses cannot establish the score/combo-based global rank.
  if (record(value) && (value.score === undefined || value.maxCombo === undefined)) throw new RankingScoreUnavailableError()
  if (!record(value) || !whole(value.rank) || value.rank < 1 || value.rank > total || !id(value.userId)
    || !text(value.nickname, 40) || !whole(value.score) || !whole(value.maxCombo) || !date(value.completedAt)) return invalid()
  return { rank: value.rank, userId: value.userId, nickname: value.nickname, score: value.score, maxCombo: value.maxCombo, completedAt: value.completedAt }
}
function validOrder(items: RankingEntry[]) {
  const users = new Set<string>()
  for (let i = 0; i < items.length; i++) {
    const current = items[i]!, before = items[i - 1]
    if (users.has(current.userId)) return false
    users.add(current.userId)
    if (!before) continue
    const tie = before.score === current.score && before.maxCombo === current.maxCombo
    if (compareRanking(before, current) > 0 || (tie ? before.rank !== current.rank : before.rank >= current.rank)) return false
  }
  return true
}
/** Server read-only contract; never manufacture a rank or infer global ranks from a local page. */
export function parseRanking(value: unknown, rulesVersion: string, ownId: string, durationMs?: number): RankingPage {
  const duration = durationMs ?? null
  if (!record(value) || value.rulesVersion !== rulesVersion || (value.durationMs ?? null) !== duration
    || value.period !== 'ALL_TIME' || value.basis !== 'PERSONAL_BEST'
    || !text(value.snapshotId) || !date(value.updatedAt) || !whole(value.totalParticipants)
    || !Array.isArray(value.items) || value.items.length > 20 || value.items.length > value.totalParticipants
    || !(value.nextCursor === null || text(value.nextCursor, 512))) return invalid()
  const items = value.items.map(item => entry(item, value.totalParticipants as number))
  const me = value.me === null ? null : entry(value.me, value.totalParticipants)
  if (!validOrder(items) || me && me.userId !== ownId || value.nextCursor && !items.length) return invalid()
  return { rulesVersion, durationMs: duration, period: 'ALL_TIME', basis: 'PERSONAL_BEST', snapshotId: value.snapshotId,
    updatedAt: value.updatedAt, totalParticipants: value.totalParticipants, items, me, nextCursor: value.nextCursor }
}
export function appendRanking(previous: RankingPage, next: RankingPage) {
  const items = [...previous.items, ...next.items]
  if (previous.snapshotId !== next.snapshotId || previous.rulesVersion !== next.rulesVersion
    || previous.durationMs !== next.durationMs
    || previous.totalParticipants !== next.totalParticipants || !validOrder(items) || items.length > next.totalParticipants
    || next.nextCursor !== null && next.nextCursor === previous.nextCursor) return invalid()
  return { ...next, items }
}
/** The board a finished round belongs to: v5 by its stored play length (2 or 3 minutes), v4 has a single board. */
export function rankingDurationMs(rulesVersion: string, roundRules: { readonly durationMs: number }) {
  return rulesVersion === 'v5' ? roundRules.durationMs : undefined
}
/** v5 passes the round's stored rules.durationMs so the board matches the round just played; v4 passes none. */
export async function fetchRanking(requestJSON: (path: string, init?: RequestInit) => Promise<unknown>, rulesVersion: string,
  ownId: string, signal: AbortSignal, cursor?: string, durationMs?: number) {
  const params = new URLSearchParams({ period: 'ALL_TIME', rulesVersion, limit: '20' })
  if (durationMs !== undefined) params.set('durationMs', String(durationMs))
  if (cursor) params.set('cursor', cursor)
  return parseRanking(await requestJSON(`/api/v1/minigames/bungeoppang/rankings?${params}`, { signal, cache: 'no-store' }),
    rulesVersion, ownId, durationMs)
}
