import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

export interface DailyMetric {
  date: string
  activeUsers: number
  newUsers: number
  connections: number
  players: number
}

export interface FunnelMetric {
  date: string
  onboarded: number
  channelJoined: number
  tableJoined: number
  gameStarted: number
  gameCompleted: number
}

export interface GameMetric {
  date: string
  gameCode: string
  started: number
  ended: number
  completed: number
  forfeits: number
  participants: number
  durationSeconds: number
  timedGames: number
}

export interface AnalyticsSnapshot {
  schemaVersion: 1
  dataAsOf: string
  generatedAt: string
  daily: DailyMetric[]
  funnel: FunnelMetric[]
  games: GameMetric[]
}

export type AnalyticsErrorKind = 'unauthenticated' | 'forbidden' | 'not_ready' | 'failed' | 'invalid'

export class AdminAnalyticsError extends Error {
  constructor(message: string, readonly kind: AnalyticsErrorKind) { super(message) }
}

const invalid = (): never => { throw new AdminAnalyticsError('집계 응답을 확인할 수 없습니다. 다시 조회해주세요.', 'invalid') }
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
const instant = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/.test(value)
  && Number.isFinite(Date.parse(value))

function parseRows<T>(value: unknown, parse: (row: unknown) => T, key: (row: T) => string): T[] {
  if (!Array.isArray(value) || value.length > 10_000) return invalid()
  const rows = value.map(parse)
  const keys = rows.map(key)
  if (new Set(keys).size !== keys.length) return invalid()
  return rows
}

export function parseAdminAnalytics(value: unknown): AnalyticsSnapshot {
  if (!record(value) || value.schemaVersion !== 1 || !instant(value.dataAsOf) || !instant(value.generatedAt)) return invalid()
  const daily = parseRows(value.daily, (row): DailyMetric => {
    if (!record(row) || !date(row.date) || !count(row.activeUsers) || !count(row.newUsers)
      || !count(row.connections) || !count(row.players)) return invalid()
    return { date: row.date, activeUsers: row.activeUsers, newUsers: row.newUsers,
      connections: row.connections, players: row.players }
  }, row => row.date)
  const funnel = parseRows(value.funnel, (row): FunnelMetric => {
    if (!record(row) || !date(row.date) || !count(row.onboarded) || !count(row.channelJoined)
      || !count(row.tableJoined) || !count(row.gameStarted) || !count(row.gameCompleted)) return invalid()
    return { date: row.date, onboarded: row.onboarded, channelJoined: row.channelJoined,
      tableJoined: row.tableJoined, gameStarted: row.gameStarted, gameCompleted: row.gameCompleted }
  }, row => row.date)
  const games = parseRows(value.games, (row): GameMetric => {
    if (!record(row) || !date(row.date) || typeof row.gameCode !== 'string'
      || !/^[A-Z][A-Z0-9_]{0,31}$/.test(row.gameCode) || !count(row.started) || !count(row.ended)
      || !count(row.completed) || !count(row.forfeits) || !count(row.participants)
      || !count(row.durationSeconds) || !count(row.timedGames)) return invalid()
    return { date: row.date, gameCode: row.gameCode, started: row.started, ended: row.ended,
      completed: row.completed, forfeits: row.forfeits, participants: row.participants,
      durationSeconds: row.durationSeconds, timedGames: row.timedGames }
  }, row => `${row.date}:${row.gameCode}`)
  return { schemaVersion: 1, dataAsOf: value.dataAsOf, generatedAt: value.generatedAt, daily, funnel, games }
}

export async function loadAdminAnalytics(signal: AbortSignal): Promise<AnalyticsSnapshot> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new AdminAnalyticsError('다시 로그인해주세요.', 'unauthenticated')
  const current = () => !signal.aborted && getAuthSession() === owner
  const fetchOnce = () => fetch('/api/v1/admin/analytics/summary', {
    method: 'GET', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}` },
  })

  let response = await fetchOnce()
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('조회가 취소되었습니다.')
    if (!restored) throw new AdminAnalyticsError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw new AdminAnalyticsError('다시 로그인해주세요.', 'unauthenticated')
    response = await fetchOnce()
  }
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) throw new AdminAnalyticsError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
  if (response.status === 403) throw new AdminAnalyticsError('분석 조회 권한이 없습니다. 관리자 등록을 확인해주세요.', 'forbidden')
  if (response.status === 503) throw new AdminAnalyticsError('집계 파일이 아직 게시되지 않았습니다.', 'not_ready')
  if (response.status === 404) throw new AdminAnalyticsError('집계 API가 아직 배포되지 않았습니다.', 'not_ready')
  if (!response.ok) throw new AdminAnalyticsError('집계를 가져오지 못했습니다. 다시 조회해주세요.', 'failed')
  const body: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('조회가 취소되었습니다.')
  return parseAdminAnalytics(body)
}

export const isStaleSnapshot = (dataAsOf: string, now = Date.now()): boolean =>
  now - Date.parse(dataAsOf) > 36 * 60 * 60 * 1000

export const kstDate = (instantValue: string): string =>
  new Date(Date.parse(instantValue) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

export const shiftDate = (day: string, offset: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

export function periodRows<T extends { date: string }>(rows: T[], from: string, to: string): T[] {
  if (!date(from) || !date(to) || from > to) return []
  return rows.filter(row => row.date >= from && row.date <= to)
}

export type GameTotal = Omit<GameMetric, 'date'>

export function groupGames(rows: GameMetric[]): GameTotal[] {
  const grouped = new Map<string, GameTotal>()
  for (const row of rows) {
    const previous = grouped.get(row.gameCode) ?? {
      gameCode: row.gameCode, started: 0, ended: 0, completed: 0, forfeits: 0,
      participants: 0, durationSeconds: 0, timedGames: 0,
    }
    grouped.set(row.gameCode, {
      gameCode: row.gameCode,
      started: previous.started + row.started,
      ended: previous.ended + row.ended,
      completed: previous.completed + row.completed,
      forfeits: previous.forfeits + row.forfeits,
      participants: previous.participants + row.participants,
      durationSeconds: previous.durationSeconds + row.durationSeconds,
      timedGames: previous.timedGames + row.timedGames,
    })
  }
  return [...grouped.values()].sort((a, b) => a.gameCode.localeCompare(b.gameCode))
}

export function selectAnalyticsPeriod(snapshot: AnalyticsSnapshot, from: string, to: string) {
  const daily = periodRows(snapshot.daily, from, to).sort((a, b) => a.date.localeCompare(b.date))
  const funnelRows = periodRows(snapshot.funnel, from, to)
  const games = groupGames(periodRows(snapshot.games, from, to))
  return {
    daily, games, funnelRows,
    newUsers: daily.reduce((total, row) => total + row.newUsers, 0),
    connections: daily.reduce((total, row) => total + row.connections, 0),
    gameStarts: games.reduce((total, row) => total + row.started, 0),
    funnel: {
      onboarded: funnelRows.reduce((total, row) => total + row.onboarded, 0),
      channelJoined: funnelRows.reduce((total, row) => total + row.channelJoined, 0),
      tableJoined: funnelRows.reduce((total, row) => total + row.tableJoined, 0),
      gameStarted: funnelRows.reduce((total, row) => total + row.gameStarted, 0),
      gameCompleted: funnelRows.reduce((total, row) => total + row.gameCompleted, 0),
    },
  }
}
