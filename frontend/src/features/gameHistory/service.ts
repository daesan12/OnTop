import type { ParkRuntimePort } from '../../park/runtime/contracts'
import { RestError } from '../../network/restError'

export const RECORD_GAMES = { OMOK: '오목', DICE: '주사위 한 판', ONE_CARD: '원카드', LIAR_BRIDGE: '거짓말 다리 건너기', DICE_LEDGER: '주사위 장부', HALLI_GALLI: '과일 땡', ALKKAGI: '알까기', QUORIDOR: '길목 한 수', DAVINCI_CODE: '흑백수사' } as const
export type RecordGame = keyof typeof RECORD_GAMES
export type RecordFilter = RecordGame | 'ALL'
export type GameResult = 'WIN' | 'LOSE' | 'FORFEIT' | 'DRAW'
export const RESULT_LABELS: Record<GameResult, string> = { WIN: '승리', LOSE: '패배', FORFEIT: '기권', DRAW: '무승부' }
export interface GameRecord {
  gameSessionId: string; gameCode: RecordGame; status: 'FINISHED' | 'INVALID'
  myResult: GameResult | null; settlementStatus: 'PENDING' | 'SETTLED' | null; endedAt: string
}
export interface GameHistoryPage { items: GameRecord[]; nextCursor: string | null; hasNext: boolean }
export interface GameStat { gameCode: RecordGame; played: number; wins: number; losses: number; forfeits: number; draws: number }
type RequestJSON = ParkRuntimePort['requestJSON']
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const game = (v: unknown): v is RecordGame => typeof v === 'string' && Object.hasOwn(RECORD_GAMES, v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
export class HistoryResponseError extends Error {
  constructor() { super('전적 응답을 확인할 수 없습니다.') }
}
const invalid = (): never => { throw new HistoryResponseError() }

/** IDs stay strings throughout. BE pages are ordered by DB ID, not endedAt. */
export function parseHistory(value: unknown, filter: RecordFilter = 'ALL', cursor?: string): GameHistoryPage {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 20 || typeof value.hasNext !== 'boolean'
    || !(value.nextCursor === null || id(value.nextCursor)) || value.hasNext !== (value.nextCursor !== null)
    || cursor !== undefined && !id(cursor)) return invalid()
  let previous = cursor ? BigInt(cursor) : null
  const items = value.items.map((item): GameRecord => {
    if (!record(item) || !id(item.gameSessionId) || !game(item.gameCode)
      || filter !== 'ALL' && item.gameCode !== filter || !['FINISHED', 'INVALID'].includes(String(item.status))
      || !(item.myResult === null || typeof item.myResult === 'string' && Object.hasOwn(RESULT_LABELS, item.myResult))
      || !(item.settlementStatus === null || item.settlementStatus === 'PENDING' || item.settlementStatus === 'SETTLED')
      || typeof item.endedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(item.endedAt) || !Number.isFinite(Date.parse(item.endedAt))) return invalid()
    const current = BigInt(item.gameSessionId)
    if (previous !== null && current >= previous) return invalid()
    previous = current
    return { gameSessionId: item.gameSessionId, gameCode: item.gameCode, status: item.status as GameRecord['status'],
      myResult: item.myResult as GameResult | null, settlementStatus: item.settlementStatus, endedAt: item.endedAt }
  })
  if (value.hasNext && value.nextCursor !== items.at(-1)?.gameSessionId) return invalid()
  return { items, nextCursor: value.nextCursor as string | null, hasNext: value.hasNext }
}

export function parseStats(value: unknown): GameStat[] {
  // One row per known game at most. A fixed 4 already rejected users with five games (DICE_LEDGER).
  if (!record(value) || !Array.isArray(value.items) || value.items.length > Object.keys(RECORD_GAMES).length) return invalid()
  const seen = new Set<RecordGame>()
  return value.items.map((item): GameStat => {
    if (!record(item) || !game(item.gameCode) || seen.has(item.gameCode)
      || !count(item.played) || !count(item.wins) || !count(item.losses) || !count(item.forfeits) || !count(item.draws)
      || item.played !== item.wins + item.losses + item.forfeits + item.draws) return invalid()
    seen.add(item.gameCode)
    return { gameCode: item.gameCode, played: item.played, wins: item.wins, losses: item.losses, forfeits: item.forfeits, draws: item.draws }
  })
}

export function historyPath(filter: RecordFilter = 'ALL', cursor?: string) {
  if (filter !== 'ALL' && !game(filter) || cursor !== undefined && !id(cursor)) return invalid()
  const query = new URLSearchParams({ size: '20' })
  if (cursor) query.set('cursor', cursor)
  if (filter !== 'ALL') query.set('gameCode', filter)
  return `/api/v1/users/me/games?${query}`
}
const readOptions = (signal: AbortSignal): RequestInit => ({ method: 'GET', cache: 'no-store',
  signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
export async function fetchHistory(request: RequestJSON, filter: RecordFilter, signal: AbortSignal, cursor?: string) {
  return parseHistory(await request(historyPath(filter, cursor), readOptions(signal)), filter, cursor)
}
export async function fetchStats(request: RequestJSON, signal: AbortSignal) {
  return parseStats(await request('/api/v1/users/me/game-stats', readOptions(signal)))
}
export function appendHistory(previous: GameHistoryPage, next: GameHistoryPage): GameHistoryPage {
  const last = previous.items.at(-1)?.gameSessionId
  if (!previous.hasNext || previous.nextCursor !== last || !last
    || next.items.some(item => BigInt(item.gameSessionId) >= BigInt(last))) return invalid()
  return { ...next, items: [...previous.items, ...next.items] }
}
export function historyError(error: unknown) {
  if (error instanceof HistoryResponseError) return '전적 응답을 확인하지 못했어요. 잠시 후 다시 조회해 주세요.'
  if (error instanceof RestError && error.status === 401) return '로그인을 다시 확인해 주세요.'
  if (error instanceof RestError && error.code === 'INVALID_CURSOR') return '다음 내역을 확인할 수 없어요. 새로 조회해 주세요.'
  return '전적을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}
