import { record } from '../../network/protocol'
import { RestError } from '../../network/restError'

export interface BalanceRankingEntry { rank: number; userId: string; nickname: string; coinBalance: number }
export interface ProfitRankingEntry { rank: number; userId: string; nickname: string; profit: number }
export interface WinsRankingEntry { rank: number; userId: string; nickname: string; winCount: number }
export interface ParkRankingSnapshot {
  balance: BalanceRankingEntry[]
  singleGameProfit: ProfitRankingEntry[]
  wins: WinsRankingEntry[]
  updatedAt: string
}

export interface RankingDisplayRow { rank: number; userId: string; nickname: string; value: string }
export interface RankingDisplayColumn {
  key: 'balance' | 'singleGameProfit' | 'wins'
  title: string
  description: string
  rows: RankingDisplayRow[]
}

const safeWhole = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const rank = (value: unknown): value is number => safeWhole(value) && value > 0
const userId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)
const nickname = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 40
const instant = (value: unknown): value is string => typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value))
const invalid = (): never => { throw new Error('랭킹 응답을 확인하지 못했어요. 다시 불러와 주세요.') }

function list<T>(value: unknown, parse: (item: unknown) => T & { rank: number; userId: string }): T[] {
  if (!Array.isArray(value) || value.length > 10) return invalid()
  const seen = new Set<string>()
  let previousRank = 0
  return value.map(raw => {
    const item = parse(raw)
    if (seen.has(item.userId) || item.rank < previousRank) return invalid()
    seen.add(item.userId)
    previousRank = item.rank
    return item
  })
}

function identity(value: unknown) {
  if (!record(value) || !rank(value.rank) || !userId(value.userId) || !nickname(value.nickname)) return invalid()
  return { rank: value.rank, userId: value.userId, nickname: value.nickname }
}

export function parseParkRanking(value: unknown): ParkRankingSnapshot {
  if (!record(value) || !instant(value.updatedAt)) return invalid()
  const balance = list(value.balance, item => {
    const base = identity(item)
    if (!record(item) || !safeWhole(item.coinBalance)) return invalid()
    return { ...base, coinBalance: item.coinBalance }
  })
  const singleGameProfit = list(value.singleGameProfit, item => {
    const base = identity(item)
    if (!record(item) || !safeWhole(item.profit)) return invalid()
    return { ...base, profit: item.profit }
  })
  const wins = list(value.wins, item => {
    const base = identity(item)
    if (!record(item) || !safeWhole(item.winCount)) return invalid()
    return { ...base, winCount: item.winCount }
  })
  return { balance, singleGameProfit, wins, updatedAt: value.updatedAt }
}

export async function fetchParkRanking(
  requestJSON: (path: string, init?: RequestInit) => Promise<unknown>,
  signal: AbortSignal,
) {
  return parseParkRanking(await requestJSON('/api/v1/rankings/park', { signal, cache: 'no-store' }))
}

const number = new Intl.NumberFormat('ko-KR')
const updatedAt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function rankingColumns(snapshot: ParkRankingSnapshot): RankingDisplayColumn[] {
  return [
    { key: 'balance', title: '보유량', description: '현재 보유한 엽전', rows: snapshot.balance.map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, value: `${number.format(item.coinBalance)}냥`,
    })) },
    { key: 'singleGameProfit', title: '승부사', description: '한 판에서 번 엽전 최고 기록', rows: snapshot.singleGameProfit.map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, value: `${number.format(item.profit)}냥`,
    })) },
    { key: 'wins', title: '승수', description: '보드게임에서 이긴 횟수', rows: snapshot.wins.map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, value: `${number.format(item.winCount)}승`,
    })) },
  ]
}

export function formatRankingUpdatedAt(value: string) {
  return updatedAt.format(new Date(value)).replace(/\. /g, '.').replace(/\.$/, '')
}

export function parkRankingError(error: unknown) {
  if (error instanceof RestError && error.code === 'RANKING_UNAVAILABLE') return '랭킹 집계를 준비 중이에요. 잠시 후 다시 확인해 주세요.'
  if (error instanceof RestError && error.status === 401) return '로그인을 다시 확인해 주세요.'
  return error instanceof Error && error.message ? error.message : '랭킹을 불러오지 못했어요. 다시 시도해 주세요.'
}
