import { record } from '../../network/protocol'
import { AdminEventsError, request } from './adminEvents'

export interface WeeklyGame {
  gameCode: string
  displayName: string
  rankingRuleVersion: string
  weekStartDate: string
  startsAt: string
  endsAt: string
  announcesAt: string
  prizeName: string
  enabled: boolean
  finalizedAt: string | null
}
export interface WeeklyRank {
  place: number
  userId: number
  nickname: string
  sourceRecordId: string
  sourceValue: number
  secondaryValue: number
  achievedAt: string
}
export interface WeeklyWinner {
  userId: number
  nickname: string
  sourceRecordId: string
  sourceValue: number
  sourceAchievedAt: string
  prizeName: string
}
export interface WeeklyRanking {
  game: WeeklyGame
  status: 'PROVISIONAL' | 'READY' | 'FINALIZED'
  candidateCount: number
  excludedGmCount: number
  ranks: WeeklyRank[]
  winner: WeeklyWinner | null
}

const invalid = (): never => { throw new AdminEventsError('미니게임 행사 응답을 확인하지 못했습니다. 다시 조회해주세요.', 'INVALID_RESPONSE', 'invalid') }
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const positive = (value: unknown): value is number => integer(value) && value > 0
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const code = (value: unknown): value is string => typeof value === 'string'
  && /^(?:BUNGEOPPANG|JUMPMAP|MG_[A-Z0-9_]{1,21})$/.test(value)
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

export function parseWeeklyGame(value: unknown, week: string): WeeklyGame {
  if (!record(value) || !code(value.gameCode) || !text(value.displayName)
    || !text(value.rankingRuleVersion) || value.weekStartDate !== week
    || !instant(value.startsAt) || !instant(value.endsAt) || !instant(value.announcesAt)
    || !text(value.prizeName) || typeof value.enabled !== 'boolean'
    || !(value.finalizedAt === null || instant(value.finalizedAt))) return invalid()
  return { gameCode: value.gameCode, displayName: value.displayName,
    rankingRuleVersion: value.rankingRuleVersion, weekStartDate: week,
    startsAt: value.startsAt, endsAt: value.endsAt, announcesAt: value.announcesAt,
    prizeName: value.prizeName, enabled: value.enabled, finalizedAt: value.finalizedAt }
}

export function parseWeeklyGames(value: unknown, week: string): WeeklyGame[] {
  if (!Array.isArray(value)) return invalid()
  const games = value.map(item => parseWeeklyGame(item, week)).filter(game => game.enabled)
  if (new Set(games.map(game => game.gameCode)).size !== games.length) return invalid()
  return games
}

export function parseWeeklyRanking(value: unknown, week: string, gameCode: string): WeeklyRanking {
  if (!record(value) || !record(value.game) || !Array.isArray(value.ranks)
    || !['PROVISIONAL', 'READY', 'FINALIZED'].includes(String(value.status))
    || !integer(value.candidateCount) || !integer(value.excludedGmCount)
    || value.excludedGmCount > value.candidateCount) return invalid()
  const game = parseWeeklyGame(value.game, week)
  if (game.gameCode !== gameCode || !game.enabled) return invalid()
  const ranks = value.ranks.map((item): WeeklyRank => {
    if (!record(item) || !positive(item.place) || !positive(item.userId)
      || !text(item.nickname) || !text(item.sourceRecordId)
      || !integer(item.sourceValue) || !integer(item.secondaryValue)
      || !instant(item.achievedAt)) return invalid()
    return { place: item.place, userId: item.userId, nickname: item.nickname,
      sourceRecordId: item.sourceRecordId, sourceValue: item.sourceValue,
      secondaryValue: item.secondaryValue, achievedAt: item.achievedAt }
  })
  let winner: WeeklyWinner | null = null
  if (value.winner != null) {
    const item = value.winner
    if (!record(item) || !positive(item.userId) || !text(item.nickname)
      || !text(item.sourceRecordId) || !integer(item.sourceValue)
      || !instant(item.sourceAchievedAt) || !text(item.prizeName)) return invalid()
    winner = { userId: item.userId, nickname: item.nickname,
      sourceRecordId: item.sourceRecordId, sourceValue: item.sourceValue,
      sourceAchievedAt: item.sourceAchievedAt, prizeName: item.prizeName }
  }
  if (value.status === 'FINALIZED' ? !game.finalizedAt || ranks.length > 0
    : !!game.finalizedAt || winner !== null) return invalid()
  return { game, status: value.status as WeeklyRanking['status'],
    candidateCount: value.candidateCount, excludedGmCount: value.excludedGmCount,
    ranks, winner }
}

const base = (week: string) => `/api/v1/admin/events/minigames/rounds/${week}/games`
const gamePath = (week: string, gameCode: string) => `${base(week)}/${encodeURIComponent(gameCode)}`

export function loadWeeklyGames(week: string, signal: AbortSignal): Promise<WeeklyGame[]> {
  return request(base(week), 'GET', signal, value => parseWeeklyGames(value, week))
}

export function loadWeeklyRanking(week: string, gameCode: string, signal: AbortSignal): Promise<WeeklyRanking> {
  return request(`${gamePath(week, gameCode)}/ranking`, 'GET', signal,
    value => parseWeeklyRanking(value, week, gameCode))
}

export function confirmWeeklyRanking(week: string, gameCode: string, preview: WeeklyRanking,
  signal: AbortSignal): Promise<WeeklyRanking> {
  return request(`${gamePath(week, gameCode)}/finalize`, 'POST', signal,
    value => parseWeeklyRanking(value, week, gameCode), {
      candidateCount: preview.candidateCount,
      excludedGmCount: preview.excludedGmCount,
      expectedSourceRecordId: preview.ranks[0]?.sourceRecordId ?? null,
    })
}
