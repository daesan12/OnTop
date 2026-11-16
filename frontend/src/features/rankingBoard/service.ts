import { record } from '../../network/protocol'
import { RestError } from '../../network/restError'

export interface BalanceRankingEntry { rank: number; userId: string; nickname: string; coinBalance: number; gameMaster: boolean; equipmentValue?: number; totalAssets?: number }
export interface MoleRankingEntry { rank: number; userId: string; nickname: string; score: number; maxCombo: number; completedAt: string; gameMaster: boolean }
export interface SpeedMoleRankingEntry { rank: number; userId: string; nickname: string; score: number; misses: number; completedAt: string; gameMaster: boolean }
export interface JumpRopeRankingEntry { rank: number; userId: string; nickname: string; score: number; misses: number; completedAt: string; gameMaster: boolean }
export interface JumpmapRankingEntry { rank: number; userId: string; nickname: string; finishMs: number; completedAt: string; gameMaster: boolean }
export interface SkewerRankingEntry { rank: number; gameId: string; chefUserId: string; chefNickname: string; serverUserId: string; serverNickname: string; score: number; playMode: 'PC' | 'VR'; completedAt: string; chefGameMaster: boolean; serverGameMaster: boolean }
export interface ParkRankingSnapshot {
  jumpmap?: JumpmapRankingEntry[]
  bungeoppang?: MoleRankingEntry[]
  skewer?: SkewerRankingEntry[]
  jumpRopeStartsAt?: string
  jumpRopeEndsAtExclusive?: string
  balance: BalanceRankingEntry[]
  mole: MoleRankingEntry[]
  speedMole: SpeedMoleRankingEntry[]
  jumpRope: JumpRopeRankingEntry[]
  updatedAt: string
}

export interface RankingDisplayRow { rank: number; userId: string; nickname: string; value: string; gameMaster: boolean; members?: { nickname: string; vr: boolean; gameMaster: boolean }[] }
export interface RankingDisplayColumn {
  key: 'balance' | 'mole' | 'speedMole' | 'jumpRope' | 'jumpmap' | 'bungeoppang' | 'skewer'
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

function identity(value: Record<string, unknown>) {
  if (!rank(value.rank) || !userId(value.userId) || !nickname(value.nickname)
    || (value.gameMaster !== undefined && typeof value.gameMaster !== 'boolean')) return invalid()
  return { rank: value.rank, userId: value.userId, nickname: value.nickname, gameMaster: value.gameMaster === true }
}

function gameIdentity(value: Record<string, unknown>) {
  const base = identity(value)
  if (!instant(value.completedAt)) return invalid()
  return { ...base, completedAt: value.completedAt }
}

export function parseParkRanking(value: unknown): ParkRankingSnapshot {
  if (!record(value) || !instant(value.updatedAt)) return invalid()
  const balance = list(value.balance, item => {
    if (!record(item)) return invalid()
    const base = identity(item)
    if (!safeWhole(item.coinBalance)) return invalid()
    if (item.equipmentValue !== undefined || item.totalAssets !== undefined) {
      if (!safeWhole(item.equipmentValue) || !safeWhole(item.totalAssets)
        || !Number.isSafeInteger(item.coinBalance + item.equipmentValue) || item.totalAssets !== item.coinBalance + item.equipmentValue) return invalid()
      return { ...base, coinBalance: item.coinBalance, equipmentValue: item.equipmentValue, totalAssets: item.totalAssets }
    }
    return { ...base, coinBalance: item.coinBalance }
  })
  const mole = list(value.mole, item => {
    if (!record(item)) return invalid()
    const base = gameIdentity(item)
    if (!safeWhole(item.score) || !safeWhole(item.maxCombo)) return invalid()
    return { ...base, score: item.score, maxCombo: item.maxCombo }
  })
  const speedMole = list(value.speedMole, item => {
    if (!record(item)) return invalid()
    const base = gameIdentity(item)
    if (!safeWhole(item.score) || !safeWhole(item.misses)) return invalid()
    return { ...base, score: item.score, misses: item.misses }
  })
  // 줄넘기 열을 아직 보내지 않는 이전 서버의 응답은 빈 열로 받는다. 필드가 있으면 다른 열과 같게 검증한다.
  const jumpRope = value.jumpRope === undefined ? [] : list(value.jumpRope, item => {
    if (!record(item)) return invalid()
    const base = gameIdentity(item)
    if (!safeWhole(item.score) || !safeWhole(item.misses)) return invalid()
    return { ...base, score: item.score, misses: item.misses }
  })
  const jumpmap = value.jumpmap === undefined ? [] : list(value.jumpmap, item => {
    if (!record(item) || !rank(item.finishMs)) return invalid()
    return { ...gameIdentity(item), finishMs: item.finishMs }
  })
  const bungeoppang = value.bungeoppang === undefined ? [] : list(value.bungeoppang, item => {
    if (!record(item) || !safeWhole(item.score) || !safeWhole(item.maxCombo)) return invalid()
    return { ...gameIdentity(item), score: item.score, maxCombo: item.maxCombo }
  })
  const skewer = value.skewer === undefined ? [] : list(value.skewer, item => {
    if (!record(item) || !rank(item.rank) || typeof item.gameId !== 'string' || !item.gameId
      || !userId(item.chefUserId) || !userId(item.serverUserId) || item.chefUserId === item.serverUserId
      || !nickname(item.chefNickname) || !nickname(item.serverNickname) || !safeWhole(item.score)
      || !['PC', 'VR'].includes(String(item.playMode)) || !instant(item.completedAt)
      || typeof item.chefGameMaster !== 'boolean' || typeof item.serverGameMaster !== 'boolean') return invalid()
    return { ...(item as unknown as SkewerRankingEntry), userId: [item.chefUserId, item.serverUserId].sort().join(':') }
  }).map(({ userId: _team, ...item }) => item)
  const startsAt = value.jumpRopeStartsAt, endsAt = value.jumpRopeEndsAtExclusive
  if ((startsAt !== undefined || endsAt !== undefined) && (!instant(startsAt) || !instant(endsAt) || Date.parse(startsAt) >= Date.parse(endsAt))) return invalid()
  return { balance, mole, speedMole, jumpRope, jumpmap, bungeoppang, skewer,
    jumpRopeStartsAt: startsAt as string | undefined, jumpRopeEndsAtExclusive: endsAt as string | undefined, updatedAt: value.updatedAt }
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
    { key: 'balance', title: '총자산', description: '보유 엽전 + 의상 가치', rows: snapshot.balance.map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, gameMaster: item.gameMaster, value: `${number.format(item.totalAssets ?? item.coinBalance)}냥`,
    })) },
    { key: 'mole', title: '두더지 잡기', description: '점수 · 최대 콤보 · 먼저 달성', rows: snapshot.mole.map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, gameMaster: item.gameMaster, value: `${number.format(item.score)}점`,
    })) },
    { key: 'speedMole', title: '스피드 두더지 잡기', description: '점수 · 적은 실수 · 먼저 달성', rows: snapshot.speedMole.map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, gameMaster: item.gameMaster, value: `${number.format(item.score)}점`,
    })) },
    { key: 'jumpRope', title: '구구구 줄넘기', description: snapshot.jumpRopeStartsAt ? (Date.parse(snapshot.updatedAt) < Date.parse(snapshot.jumpRopeStartsAt) ? '집계 예정 · 11/16 14:00부터' : '11/16 14:00 ~ 11/18 23:59 · 한국 시간') : '기간 집계 준비 중', rows: (snapshot.jumpRopeStartsAt ? snapshot.jumpRope : []).map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, gameMaster: item.gameMaster, value: `${number.format(item.score)}점`,
    })) },
    { key: 'jumpmap', title: '점프맵', description: '완주 시간 · 먼저 달성', rows: (snapshot.jumpmap ?? []).map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, gameMaster: item.gameMaster, value: formatFinishTime(item.finishMs),
    })) },
    { key: 'bungeoppang', title: '붕어빵 굽기', description: '점수 · 최대 콤보 · 먼저 달성', rows: (snapshot.bungeoppang ?? []).map(item => ({
      rank: item.rank, userId: item.userId, nickname: item.nickname, gameMaster: item.gameMaster, value: `${number.format(item.score)}점`,
    })) },
    { key: 'skewer', title: '온탑 꼬치왕', description: 'PC·VR 통합 · 두 사람의 최고 팀 점수', rows: (snapshot.skewer ?? []).map(item => ({
      rank: item.rank, userId: [item.chefUserId, item.serverUserId].sort().join(':'), nickname: `${item.chefNickname} · ${item.serverNickname}`,
      gameMaster: false, value: `${number.format(item.score)}점`,
      members: [{ nickname: item.chefNickname, gameMaster: item.chefGameMaster, vr: item.playMode === 'VR' },
        { nickname: item.serverNickname, gameMaster: item.serverGameMaster, vr: item.playMode === 'VR' }],
    })) },
  ]
}

export function formatFinishTime(ms: number) {
  return `${Math.floor(ms / 60000)}:${(ms % 60000 / 1000).toFixed(3).padStart(6, '0')}`
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
