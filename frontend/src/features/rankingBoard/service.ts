import { record } from '../../network/protocol'
import { RestError } from '../../network/restError'

export interface BalanceRankingEntry { rank: number; userId: string; nickname: string; coinBalance: number }
export interface BungeoppangChampion { userId: string; nickname: string; score: number; maxCombo: number; completedAt: string }
export interface JumpmapChampion { userId: string; nickname: string; finishMs: number; completedAt: string }
export interface ParkRankingSnapshot {
  balance: BalanceRankingEntry[]
  bungeoppangChampion: BungeoppangChampion | null
  jumpmapChampion: JumpmapChampion | null
  updatedAt: string
}

export interface RankingDisplayRow { rank: number; userId: string; nickname: string; value: string }
export interface RankingDisplayColumn {
  key: 'balance' | 'bungeoppang' | 'jumpmap'
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

function championIdentity(value: unknown) {
  if (!record(value) || !userId(value.userId) || !nickname(value.nickname) || !instant(value.completedAt)) return invalid()
  return { userId: value.userId, nickname: value.nickname, completedAt: value.completedAt }
}

export function parseParkRanking(value: unknown): ParkRankingSnapshot {
  if (!record(value) || !instant(value.updatedAt)) return invalid()
  const balance = list(value.balance, item => {
    const base = identity(item)
    if (!record(item) || !safeWhole(item.coinBalance)) return invalid()
    return { ...base, coinBalance: item.coinBalance }
  })
  const bungeoppangChampion = value.bungeoppangChampion === null ? null : (() => {
    const base = championIdentity(value.bungeoppangChampion)
    if (!record(value.bungeoppangChampion) || !safeWhole(value.bungeoppangChampion.score)
      || !safeWhole(value.bungeoppangChampion.maxCombo)) return invalid()
    return { ...base, score: value.bungeoppangChampion.score, maxCombo: value.bungeoppangChampion.maxCombo }
  })()
  const jumpmapChampion = value.jumpmapChampion === null ? null : (() => {
    const base = championIdentity(value.jumpmapChampion)
    if (!record(value.jumpmapChampion) || !safeWhole(value.jumpmapChampion.finishMs)
      || value.jumpmapChampion.finishMs === 0) return invalid()
    return { ...base, finishMs: value.jumpmapChampion.finishMs }
  })()
  return { balance, bungeoppangChampion, jumpmapChampion, updatedAt: value.updatedAt }
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
  const bungeoppang = snapshot.bungeoppangChampion
  const jumpmap = snapshot.jumpmapChampion
  return [
    { key: 'balance', title: '보유량', description: '현재 보유 엽전 순', rows: snapshot.balance.map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, value: `${number.format(item.coinBalance)}냥`,
    })) },
    { key: 'bungeoppang', title: '붕어빵 굽기', description: '점수 · 최대 콤보 · 먼저 완료', rows: bungeoppang ? [{
      rank: 1, userId: bungeoppang.userId, nickname: bungeoppang.nickname, value: `${number.format(bungeoppang.score)}점`,
    }] : [] },
    { key: 'jumpmap', title: '점프맵', description: '최단 기록 · 먼저 완료', rows: jumpmap ? [{
      rank: 1, userId: jumpmap.userId, nickname: jumpmap.nickname, value: formatJumpmapFinish(jumpmap.finishMs),
    }] : [] },
  ]
}

export function formatJumpmapFinish(value: number) {
  const minutes = Math.floor(value / 60_000)
  const seconds = Math.floor(value % 60_000 / 1_000)
  const milliseconds = value % 1_000
  return `${minutes}분 ${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}초`
}

export function formatRankingUpdatedAt(value: string) {
  const parts = Object.fromEntries(updatedAt.formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

export function parkRankingError(error: unknown) {
  if (error instanceof RestError && error.code === 'RANKING_UNAVAILABLE') return '랭킹 집계를 준비 중이에요. 잠시 후 다시 확인해 주세요.'
  if (error instanceof RestError && error.status === 401) return '로그인을 다시 확인해 주세요.'
  return error instanceof Error && error.message ? error.message : '랭킹을 불러오지 못했어요. 다시 시도해 주세요.'
}
