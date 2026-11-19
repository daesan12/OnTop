import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

export type EventKind = 'raffle' | 'bungeoppang' | 'jumpmap' | 'asset'
export type EventSection = 'raffle' | 'minigames' | 'asset'
export type WinnerType = 'RAFFLE' | 'BUNGEOPPANG' | 'JUMPMAP' | 'ASSET_VALUE'
export type ContactStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'EXPIRED'
export type DeliveryStatus = 'PENDING' | 'DELIVERED'

export const firstMinigameWeek = '2026-11-02'
export const assetWeek = '2026-11-09'
export const eventKinds: readonly EventSection[] = ['raffle', 'minigames', 'asset']
export const eventLabels: Record<EventSection, string> = {
  raffle: '응모권 추첨', minigames: '미니게임 1위', asset: '엽전 보유량 순위',
}
export const legacyMinigameLabels = { bungeoppang: '붕어빵', jumpmap: '점프맵' } as const
export const winnerLabels: Record<WinnerType, string> = {
  RAFFLE: '응모권', BUNGEOPPANG: '붕어빵', JUMPMAP: '점프맵', ASSET_VALUE: '엽전 보유량',
}

export interface EventWinner {
  userId: number
  nickname: string | null
  place: number
  prizeName: string
  evidence: string
}
export interface RaffleReview {
  drawId: number
  week: string
  attemptNumber: number
  drawnAt: string
  rerollReason: string | null
  candidateCount: number
  excludedGmCount: number
  expectedPrizeCount: number
  awardedPrizeCount: number
  vacantPrizeCount: number
  picks: EventWinner[]
}
export interface EventRound {
  kind: EventKind
  week: string
  endsAt: string
  announcesAt: string
  finalized: boolean
  candidateCount: number | null
  excludedGmCount: number | null
  expectedPrizeCount: number
  awardedPrizeCount: number
  vacantPrizeCount: number
  winners: EventWinner[]
}
export interface AssetPreviewRank {
  place: number
  userId: number
  nickname: string
  sourceRecordId: string
  coinBalance: number
  firstReachedAt: string
}
export interface AssetPreview {
  week: string
  startsAt: string
  endsAt: string
  announcesAt: string
  candidateCount: number
  excludedGmCount: number
  ranks: AssetPreviewRank[]
}
export interface AdminEventWinner {
  winnerId: number
  userId: number
  nickname: string | null
  weekStart: string
  eventType: WinnerType
  place: number
  prizeName: string
  contactStatus: ContactStatus
  maskedPhone: string | null
  contactExpiresAt: string | null
  deliveryStatus: DeliveryStatus
  deliveredByUserId: number | null
  deliveredAt: string | null
}
export interface AdminWinnersPage {
  winners: AdminEventWinner[]
  limit: number
  offset: number
  hasMore: boolean
}
export interface RevealedContact { winnerId: number; phone: string; expiresAt: string }
export interface DeliveryReceipt {
  winnerId: number
  userId: number
  deliveredByUserId: number
  deliveredAt: string
  alreadyDelivered: boolean
}

type ErrorKind = 'unauthenticated' | 'forbidden' | 'not-found' | 'not-ready' | 'unavailable' | 'uncertain' | 'invalid'
export class AdminEventsError extends Error {
  constructor(message: string, readonly code: string, readonly kind: ErrorKind) { super(message) }
}

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const positive = (value: unknown): value is number => integer(value) && value > 0
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const invalid = (): never => { throw new AdminEventsError('이벤트 응답을 확인하지 못했습니다. 다시 조회해주세요.', 'INVALID_RESPONSE', 'invalid') }

export function isMondayWeek(value: string): boolean {
  if (!date(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    && parsed.getUTCDay() === 1
}

export function kstMonday(now = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const utc = new Date(`${day}T00:00:00Z`)
  utc.setUTCDate(utc.getUTCDate() - (utc.getUTCDay() + 6) % 7)
  return utc.toISOString().slice(0, 10)
}

export function schedule(week: string, kind: EventKind) {
  if (!isMondayWeek(week)) throw new AdminEventsError('KST 월요일 날짜를 선택해주세요.', 'EVENT_INVALID_WEEK', 'invalid')
  const next = new Date(`${week}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 7)
  const nextWeek = next.toISOString().slice(0, 10)
  if (kind === 'asset' && week === assetWeek) return {
    startsAt: '2026-11-09T09:00:00+09:00',
    endsAt: '2026-11-19T00:00:00+09:00',
    eligibleAt: '2026-11-19T00:05:00+09:00',
    announcesAt: '2026-11-19T09:00:00+09:00',
  }
  return {
    startsAt: `${week}T09:00:00+09:00`,
    endsAt: `${nextWeek}T00:00:00+09:00`,
    eligibleAt: `${nextWeek}T00:0${kind === 'raffle' ? '0' : '5'}:00+09:00`,
    announcesAt: `${nextWeek}T09:00:00+09:00`,
  }
}

export function supportsWeek(kind: EventKind, week: string): boolean {
  return kind === 'raffle' ? week >= firstMinigameWeek
    : kind === 'asset' ? week === assetWeek : week === firstMinigameWeek
}

function roundPath(kind: EventKind, week: string) {
  if (kind === 'raffle') return `/api/v1/admin/raffles/rounds/${week}`
  if (kind === 'asset') return `/api/v1/admin/events/assets/rounds/${week}`
  return `/api/v1/admin/events/minigames/${kind}/rounds/${week}`
}

function parseWinner(value: unknown, kind: EventKind): EventWinner {
  if (!record(value) || !positive(value.userId) || typeof value.prizeName !== 'string' || !value.prizeName) return invalid()
  const nickname = typeof value.nickname === 'string' && value.nickname.trim() ? value.nickname.trim() : null
  if (kind === 'raffle') {
    if (!positive(value.place) || !positive(value.ticketNumber)) return invalid()
    return { userId: value.userId, nickname, place: value.place, prizeName: value.prizeName,
      evidence: `응모권 #${value.ticketNumber}` }
  }
  if (typeof value.sourceRecordId !== 'string' || !value.sourceRecordId || !integer(value.sourceValue)) return invalid()
  const place = kind === 'asset' ? value.place : 1
  if (!positive(place)) return invalid()
  const detail = kind === 'asset' ? `${value.sourceValue.toLocaleString('ko-KR')}냥`
    : kind === 'jumpmap' ? `완주 기록 ${value.sourceValue}` : `점수 ${value.sourceValue.toLocaleString('ko-KR')}`
  return { userId: value.userId, nickname, place, prizeName: value.prizeName,
    evidence: `${detail} · 기록 ${value.sourceRecordId}` }
}

export function parseRaffleReview(value: unknown, week: string): RaffleReview {
  if (!record(value) || value.weekStartDate !== week || value.status !== 'REVIEW'
    || !positive(value.drawId) || !positive(value.attemptNumber) || !instant(value.drawnAt)
    || !(value.rerollReason === null || typeof value.rerollReason === 'string')
    || !integer(value.candidateCount) || !integer(value.excludedGmCount)
    || value.excludedGmCount > value.candidateCount
    || !integer(value.expectedPrizeCount) || !integer(value.awardedPrizeCount)
    || !integer(value.vacantPrizeCount) || !Array.isArray(value.picks)) return invalid()
  const picks = value.picks.map(item => parseWinner(item, 'raffle'))
  if (picks.length !== value.awardedPrizeCount
    || picks.length + value.vacantPrizeCount !== value.expectedPrizeCount) return invalid()
  return { drawId: value.drawId, week, attemptNumber: value.attemptNumber,
    drawnAt: value.drawnAt, rerollReason: value.rerollReason,
    candidateCount: value.candidateCount, excludedGmCount: value.excludedGmCount,
    expectedPrizeCount: value.expectedPrizeCount, awardedPrizeCount: value.awardedPrizeCount,
    vacantPrizeCount: value.vacantPrizeCount, picks }
}

export function parseEventRound(value: unknown, kind: EventKind, week: string): EventRound {
  if (!record(value) || value.weekStartDate !== week || !instant(value.announcesAt)
    || typeof value.finalized !== 'boolean') return invalid()
  const fallback = schedule(week, kind)
  if (kind === 'raffle') {
    if (!Array.isArray(value.winners) || !integer(value.expectedPrizeCount)
      || !integer(value.awardedPrizeCount) || !integer(value.vacantPrizeCount)) return invalid()
    const winners = value.winners.map(item => parseWinner(item, kind))
    if (winners.length !== value.awardedPrizeCount
      || value.awardedPrizeCount + value.vacantPrizeCount !== value.expectedPrizeCount
      || (integer(value.candidateCount) && integer(value.excludedGmCount)
        && value.excludedGmCount > value.candidateCount)) return invalid()
    return { kind, week, endsAt: fallback.endsAt, announcesAt: value.announcesAt,
      finalized: value.finalized,
      candidateCount: integer(value.candidateCount) ? value.candidateCount : null,
      excludedGmCount: integer(value.excludedGmCount) ? value.excludedGmCount : null,
      expectedPrizeCount: value.expectedPrizeCount, awardedPrizeCount: value.awardedPrizeCount,
      vacantPrizeCount: value.vacantPrizeCount, winners }
  }
  if (!instant(value.endsAt) || !integer(value.candidateCount) || !integer(value.excludedGmCount)
    || value.excludedGmCount > value.candidateCount) return invalid()
  const rawWinners = kind === 'asset' ? value.winners : value.winner == null ? [] : [value.winner]
  if (!Array.isArray(rawWinners)) return invalid()
  const winners = rawWinners.map(item => parseWinner(item, kind))
  const expectedPrizeCount = kind === 'asset' ? 3 : 1
  if (winners.length > expectedPrizeCount) return invalid()
  return { kind, week, endsAt: value.endsAt, announcesAt: value.announcesAt,
    finalized: value.finalized, candidateCount: value.finalized ? value.candidateCount : null,
    excludedGmCount: value.finalized ? value.excludedGmCount : null,
    expectedPrizeCount, awardedPrizeCount: winners.length,
    vacantPrizeCount: expectedPrizeCount - winners.length, winners }
}

export function parseAssetPreview(value: unknown, week: string): AssetPreview {
  if (!record(value) || value.eventType !== 'ASSET_VALUE' || value.valuationBasis !== 'COIN_BALANCE'
    || value.weekStartDate !== week || value.status !== 'READY'
    || !instant(value.startsAt) || !instant(value.endsAt) || !instant(value.announcesAt)
    || !integer(value.candidateCount) || !integer(value.excludedGmCount)
    || value.excludedGmCount > value.candidateCount || !Array.isArray(value.ranks)) return invalid()
  const ranks = value.ranks.map((item): AssetPreviewRank => {
    if (!record(item) || !positive(item.place) || !positive(item.userId) || typeof item.nickname !== 'string'
      || !item.nickname.trim() || typeof item.sourceRecordId !== 'string' || !item.sourceRecordId
      || !integer(item.coinBalance) || !instant(item.firstReachedAt)) return invalid()
    return { place: item.place, userId: item.userId, nickname: item.nickname,
      sourceRecordId: item.sourceRecordId, coinBalance: item.coinBalance,
      firstReachedAt: item.firstReachedAt }
  })
  if (ranks.length > 3 || ranks.some((rank, index) => rank.place !== index + 1)) return invalid()
  return { week, startsAt: value.startsAt, endsAt: value.endsAt, announcesAt: value.announcesAt,
    candidateCount: value.candidateCount, excludedGmCount: value.excludedGmCount, ranks }
}

export function parseAdminWinners(value: unknown): AdminWinnersPage {
  if (!record(value) || !Array.isArray(value.winners) || !integer(value.limit) || !integer(value.offset)
    || typeof value.hasMore !== 'boolean') return invalid()
  const winners = value.winners.map((item): AdminEventWinner => {
    if (!record(item) || !positive(item.winnerId) || !positive(item.userId) || !date(item.weekStart)
      || !['RAFFLE', 'BUNGEOPPANG', 'JUMPMAP', 'ASSET_VALUE'].includes(String(item.eventType))
      || !positive(item.place) || typeof item.prizeName !== 'string' || !item.prizeName
      || !['NOT_SUBMITTED', 'SUBMITTED', 'EXPIRED'].includes(String(item.contactStatus))
      || !(item.maskedPhone === null || typeof item.maskedPhone === 'string')
      || !(item.contactExpiresAt === null || instant(item.contactExpiresAt))
      || !(item.nickname == null || typeof item.nickname === 'string')
      || !['PENDING', 'DELIVERED'].includes(String(item.deliveryStatus))
      || !(item.deliveredByUserId == null || positive(item.deliveredByUserId))
      || !(item.deliveredAt == null || instant(item.deliveredAt))
      || (item.deliveryStatus === 'DELIVERED') !== (item.deliveredAt != null)
      || (item.deliveryStatus === 'DELIVERED') !== (item.deliveredByUserId != null)) return invalid()
    return { winnerId: item.winnerId, userId: item.userId, weekStart: item.weekStart,
      nickname: typeof item.nickname === 'string' && item.nickname.trim() ? item.nickname.trim() : null,
      eventType: item.eventType as WinnerType, place: item.place, prizeName: item.prizeName,
      contactStatus: item.contactStatus as ContactStatus, maskedPhone: item.maskedPhone,
      contactExpiresAt: item.contactExpiresAt,
      deliveryStatus: item.deliveryStatus as DeliveryStatus,
      deliveredByUserId: item.deliveredByUserId ?? null,
      deliveredAt: item.deliveredAt ?? null }
  })
  if (winners.length > value.limit) return invalid()
  return { winners, limit: value.limit, offset: value.offset, hasMore: value.hasMore }
}

export function parseRevealedContact(value: unknown): RevealedContact {
  if (!record(value) || !positive(value.winnerId) || typeof value.phone !== 'string'
    || !/^01(?:0\d{8}|[16789]\d{7,8})$/.test(value.phone) || !instant(value.expiresAt)) return invalid()
  return { winnerId: value.winnerId, phone: value.phone, expiresAt: value.expiresAt }
}

export function parseDeliveryReceipt(value: unknown, winnerId: number, userId: number): DeliveryReceipt {
  if (!record(value) || value.winnerId !== winnerId || value.userId !== userId
    || value.deliveryStatus !== 'DELIVERED' || !positive(value.deliveredByUserId)
    || !instant(value.deliveredAt) || typeof value.alreadyDelivered !== 'boolean') return invalid()
  return { winnerId, userId, deliveredByUserId: value.deliveredByUserId,
    deliveredAt: value.deliveredAt, alreadyDelivered: value.alreadyDelivered }
}

export async function request<T>(path: string, method: 'GET' | 'POST' | 'PUT', signal: AbortSignal,
  parse: (value: unknown) => T, payload?: Record<string, unknown>): Promise<T> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new AdminEventsError('다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
  const current = () => !signal.aborted && getAuthSession() === owner
  const fetchOnce = () => fetch(path, { method, credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(method === 'GET' ? 20_000 : 120_000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const send = async () => {
    try { return await fetchOnce() } catch (cause) {
      if (signal.aborted) throw cause
      throw new AdminEventsError(method === 'PUT'
        ? '서버의 지급 결과를 확인하지 못했습니다. 목록을 다시 조회해주세요.'
        : method === 'POST' ? '서버의 확정 결과를 확인하지 못했습니다. 결과를 다시 조회해주세요.'
          : '서버에 연결하지 못했습니다. 다시 조회해주세요.', 'NETWORK_ERROR',
      method !== 'GET' ? 'uncertain' : 'unavailable')
    }
  }
  let response = await send()
  if (!current()) throw new Error('요청이 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('요청이 취소되었습니다.')
    if (!restored) throw new AdminEventsError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw new AdminEventsError('다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
    response = await send()
  }
  const body: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('요청이 취소되었습니다.')
  if (!response.ok) {
    const code = record(body) && typeof body.code === 'string' ? body.code : 'HTTP_ERROR'
    const message = record(body) && typeof body.message === 'string' ? body.message : ''
    if (response.status === 401) throw new AdminEventsError('다시 로그인해주세요.', code, 'unauthenticated')
    if (response.status === 403) throw new AdminEventsError('이벤트 관리 권한이 없습니다.', code, 'forbidden')
    if (response.status === 404) throw new AdminEventsError(message || (
      ['RAFFLE_ROUND_NOT_FOUND', 'EVENT_ROUND_NOT_FOUND'].includes(code)
        ? '해당 회차가 없습니다.' : '이벤트 API 경로를 찾지 못했습니다. 배포 상태를 확인해주세요.'), code, 'not-found')
    if (response.status === 409) throw new AdminEventsError(message || '아직 결과를 확정할 수 없습니다.', code, 'not-ready')
    throw new AdminEventsError(message || '이벤트 정보를 확인하지 못했습니다. 서버 설정을 확인해주세요.', code, 'unavailable')
  }
  return parse(body)
}

export async function loadEventRound(kind: EventKind, week: string, signal: AbortSignal): Promise<EventRound | null> {
  try { return await request(roundPath(kind, week), 'GET', signal, value => parseEventRound(value, kind, week)) }
  catch (cause) {
    if (cause instanceof AdminEventsError && cause.kind === 'not-found'
      && ['RAFFLE_ROUND_NOT_FOUND', 'EVENT_ROUND_NOT_FOUND'].includes(cause.code)) return null
    throw cause
  }
}

export function finalizeEventRound(kind: EventKind, week: string, signal: AbortSignal): Promise<EventRound> {
  return request(`${roundPath(kind, week)}/finalize`, 'POST', signal, value => parseEventRound(value, kind, week))
}

export function loadAssetPreview(week: string, signal: AbortSignal): Promise<AssetPreview> {
  return request(`${roundPath('asset', week)}/preview`, 'GET', signal,
    value => parseAssetPreview(value, week))
}

export function confirmAssetPreview(week: string, preview: AssetPreview,
  signal: AbortSignal): Promise<EventRound> {
  return request(`${roundPath('asset', week)}/finalize`, 'POST', signal,
    value => parseEventRound(value, 'asset', week), {
      candidateCount: preview.candidateCount,
      excludedGmCount: preview.excludedGmCount,
      expectedSourceRecordIds: preview.ranks.map(rank => rank.sourceRecordId),
    })
}

export async function loadCurrentRaffleReview(week: string, signal: AbortSignal): Promise<RaffleReview | null> {
  try {
    return await request(`${roundPath('raffle', week)}/draws/current`, 'GET', signal,
      value => parseRaffleReview(value, week))
  } catch (cause) {
    if (cause instanceof AdminEventsError && cause.kind === 'not-found'
      && ['RAFFLE_REVIEW_NOT_FOUND', 'RAFFLE_ROUND_NOT_FOUND'].includes(cause.code)) return null
    throw cause
  }
}

export function createRaffleReview(week: string, signal: AbortSignal): Promise<RaffleReview> {
  return request(`${roundPath('raffle', week)}/draws`, 'POST', signal,
    value => parseRaffleReview(value, week))
}

export function rerollRaffleReview(week: string, expectedDrawId: number, reason: string,
  signal: AbortSignal): Promise<RaffleReview> {
  return request(`${roundPath('raffle', week)}/draws/reroll`, 'POST', signal,
    value => parseRaffleReview(value, week), { expectedDrawId, reason })
}

export function confirmRaffleReview(week: string, drawId: number,
  signal: AbortSignal): Promise<EventRound> {
  return request(`${roundPath('raffle', week)}/finalize`, 'POST', signal,
    value => parseEventRound(value, 'raffle', week), { drawId })
}

export function loadEventWinners(week: string, type: WinnerType | '', contactStatus: ContactStatus | '',
  offset: number, signal: AbortSignal): Promise<AdminWinnersPage> {
  const query = new URLSearchParams({ weekStart: week, limit: '20', offset: String(offset) })
  if (type) query.set('type', type)
  if (contactStatus) query.set('contactStatus', contactStatus)
  return request(`/api/v1/admin/events/winners?${query}`, 'GET', signal, parseAdminWinners)
}

export function revealEventContact(winnerId: number, signal: AbortSignal): Promise<RevealedContact> {
  return request(`/api/v1/admin/events/winners/${winnerId}/contact`, 'GET', signal, parseRevealedContact)
}

export function confirmEventDelivery(winnerId: number, userId: number,
  signal: AbortSignal): Promise<DeliveryReceipt> {
  return request(`/api/v1/admin/events/winners/${winnerId}/delivery`, 'PUT', signal,
    value => parseDeliveryReceipt(value, winnerId, userId), { expectedUserId: userId })
}
