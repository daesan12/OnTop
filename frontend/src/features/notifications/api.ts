import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

export type FeedbackStatus = 'RECEIVED' | 'REVIEWING' | 'RESOLVED'
export type RewardKind = 'COIN' | 'GACHA_TICKET'
export interface NotificationReward { kind: RewardKind; amount: number; expiresAt: string; claimedAt: string | null }
export interface NotificationItem { id: string; type: 'FEEDBACK_REPLY' | 'REWARD' | 'EVENT_WINNER'; title: string; createdAt: string; readAt: string | null; reward?: NotificationReward; eventWeekStartDate?: string }
export interface NotificationPage { items: NotificationItem[]; nextCursor: string | null; unreadCount: number }
export interface EventWinnerDetails { weekStartDate: string; awards: { winnerId: string; eventType: string; place: number; prizeName: string; deliveryStatus: 'PENDING' | 'DELIVERED' }[]; contactStatus: 'NOT_SUBMITTED' | 'SUBMITTED' | 'EXPIRED'; contactEdited: boolean; submissionDeadline: string; allPrizesDelivered: boolean; contactActionRequired: boolean; contactEditable: boolean }
export interface NotificationDetail extends NotificationItem { body: string; feedbackId: string | null; feedbackText: string | null; feedbackStatus: FeedbackStatus | null; event?: EventWinnerDetails }
export interface RewardReceipt { notificationId: string; kind: RewardKind; amount: number; claimedAt: string; balanceAfter: number | null; ticketsAfter: number | null }
export const statusLabels: Record<FeedbackStatus, string> = { RECEIVED: '접수', REVIEWING: '검토 중', RESOLVED: '반영 완료' }
export const isFeedbackStatus = (v: unknown): v is FeedbackStatus => v === 'RECEIVED' || v === 'REVIEWING' || v === 'RESOLVED'
export const isNotificationId = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n
const winnerId = (value: unknown): string | null => {
  if (isNotificationId(value)) return value
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null
}
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const invalid = (): never => { throw new InboxError('알림 응답을 확인하지 못했어요. 다시 확인해주세요.') }
export class InboxError extends Error {
  constructor(message: string, readonly status = 0, readonly code = '') { super(message) }
}
function item(v: unknown): NotificationItem {
  if (!record(v) || !isNotificationId(v.id) || (v.type !== 'FEEDBACK_REPLY' && v.type !== 'REWARD' && v.type !== 'EVENT_WINNER')
    || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 100 || !date(v.createdAt)
    || !(v.readAt === null || date(v.readAt))) return invalid()
  const result: NotificationItem = { id: v.id, type: v.type, title: v.title, createdAt: v.createdAt, readAt: v.readAt }
  if (v.type === 'EVENT_WINNER') {
    if (typeof v.eventWeekStartDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.eventWeekStartDate)) return invalid()
    result.eventWeekStartDate = v.eventWeekStartDate
  }
  if (v.type === 'REWARD') {
    const reward = v.reward
    if (!record(reward) || (reward.kind !== 'COIN' && reward.kind !== 'GACHA_TICKET')
      || !Number.isSafeInteger(reward.amount) || Number(reward.amount) <= 0 || !date(reward.expiresAt)
      || !(reward.claimedAt === null || date(reward.claimedAt))) return invalid()
    result.reward = { kind: reward.kind, amount: Number(reward.amount), expiresAt: reward.expiresAt, claimedAt: reward.claimedAt }
  }
  return result
}
export function parseNotificationPage(v: unknown, cursor = ''): NotificationPage {
  if (!record(v) || !Array.isArray(v.items) || v.items.length > 20 || (cursor && !isNotificationId(cursor))
    || !Number.isSafeInteger(v.unreadCount) || Number(v.unreadCount) < 0) return invalid()
  const items = v.items.map(item)
  let previous = cursor ? BigInt(cursor) : 9223372036854775808n
  for (const entry of items) { if (BigInt(entry.id) >= previous) return invalid(); previous = BigInt(entry.id) }
  if (v.nextCursor !== null && (!isNotificationId(v.nextCursor) || v.nextCursor !== items.at(-1)?.id)) return invalid()
  return { items, nextCursor: v.nextCursor as string | null, unreadCount: Number(v.unreadCount) }
}
export function parseNotificationDetail(v: unknown): NotificationDetail {
  const base = item(v)
  if (base.type === 'EVENT_WINNER') {
    if (!record(v) || typeof v.body !== 'string' || !v.body.trim() || !record(v.event)
      || v.event.weekStartDate !== base.eventWeekStartDate || !Array.isArray(v.event.awards)
      || v.event.awards.length === 0 || v.event.awards.length > 100
      || !['NOT_SUBMITTED', 'SUBMITTED', 'EXPIRED'].includes(String(v.event.contactStatus))
      || typeof v.event.contactEdited !== 'boolean' || !date(v.event.submissionDeadline) || typeof v.event.allPrizesDelivered !== 'boolean'
      || typeof v.event.contactActionRequired !== 'boolean' || typeof v.event.contactEditable !== 'boolean') return invalid()
    const awards = v.event.awards.map(award => {
      if (!record(award)) return invalid()
      const id = winnerId(award.winnerId)
      if (id === null || typeof award.eventType !== 'string'
        || !Number.isSafeInteger(award.place) || Number(award.place) < 1
        || typeof award.prizeName !== 'string' || !award.prizeName.trim()
        || (award.deliveryStatus !== 'PENDING' && award.deliveryStatus !== 'DELIVERED')) return invalid()
      return { winnerId: id, eventType: award.eventType, place: Number(award.place), prizeName: award.prizeName,
        deliveryStatus: award.deliveryStatus as 'PENDING' | 'DELIVERED' }
    })
    return { ...base, body: v.body, feedbackId: null, feedbackText: null, feedbackStatus: null,
      event: { weekStartDate: v.event.weekStartDate as string, awards, contactStatus: v.event.contactStatus as EventWinnerDetails['contactStatus'], contactEdited: v.event.contactEdited as boolean,
        submissionDeadline: v.event.submissionDeadline as string,
        allPrizesDelivered: v.event.allPrizesDelivered as boolean, contactActionRequired: v.event.contactActionRequired as boolean, contactEditable: v.event.contactEditable as boolean } }
  }
  if (base.type === 'REWARD') {
    if (!record(v) || typeof v.body !== 'string' || !v.body.trim() || v.body.length > 1000) return invalid()
    return { ...base, body: v.body, feedbackId: null, feedbackText: null, feedbackStatus: null }
  }
  if (!record(v) || typeof v.body !== 'string' || !v.body.trim() || v.body.length > 2000
    || !isNotificationId(v.feedbackId) || typeof v.feedbackText !== 'string' || v.feedbackText.length > 600
    || !isFeedbackStatus(v.feedbackStatus)) return invalid()
  return { ...base, body: v.body, feedbackId: v.feedbackId, feedbackText: v.feedbackText, feedbackStatus: v.feedbackStatus }
}
/** 인증 모듈을 재사용한다. 개인 응답은 디스크/스토리지에 저장하지 않는다. */
export async function inboxRequest(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<unknown> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new InboxError('다시 로그인해주세요.', 401)
  const current = () => !signal.aborted && getAuthSession() === owner
  const send = () => fetch(path, { method, credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body) })
  let response = await send()
  if (!current()) throw new InboxError('요청이 취소되었습니다.')
  if (response.status === 401) {
    if (!await restoreAuthSession(true)) throw new InboxError('다시 로그인해주세요.', 401)
    if (signal.aborted) throw new InboxError('요청이 취소되었습니다.')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw new InboxError('다시 로그인해주세요.', 401)
    response = await send()
  }
  const value: unknown = await response.json().catch(() => null)
  if (!current()) throw new InboxError('요청이 취소되었습니다.')
  if (!response.ok) {
    const code = record(value) && typeof value.code === 'string' ? value.code : ''
    throw new InboxError(response.status === 401 ? '다시 로그인해주세요.' : response.status === 403 ? '운영 관리자 권한이 필요합니다.'
      : code === 'REWARD_EXPIRED' ? '수령 기한이 지난 보상이에요.'
      : code === 'REWARD_CAPACITY_EXCEEDED' ? '보유 가능한 수량을 초과해 수령하지 못했어요.'
      : code === 'FEEDBACK_RECIPIENT_UNAVAILABLE' || code === 'REWARD_RECIPIENT_UNAVAILABLE' ? '탈퇴한 회원에게는 보낼 수 없어요.'
        : response.status === 404 ? '만료되었거나 찾을 수 없는 알림이에요.'
          : response.status === 409 ? '내용이 변경됐어요. 새로고침 후 다시 확인해주세요.'
            : '처리하지 못했어요. 입력을 유지했으니 다시 시도해주세요.', response.status, code)
  }
  return value
}
export const rewardLabel = (reward: Pick<NotificationReward, 'kind' | 'amount'>) =>
  reward.kind === 'COIN' ? `엽전 ${reward.amount.toLocaleString('ko-KR')}냥` : `뽑기권 ${reward.amount.toLocaleString('ko-KR')}장`

export function parseRewardReceipt(value: unknown, id: string): RewardReceipt {
  if (!record(value) || value.notificationId !== id || !isNotificationId(id)
    || (value.kind !== 'COIN' && value.kind !== 'GACHA_TICKET') || !Number.isSafeInteger(value.amount)
    || Number(value.amount) <= 0 || !date(value.claimedAt)) return invalid()
  const amount = value.kind === 'COIN' ? value.balanceAfter : value.ticketsAfter
  if (!Number.isSafeInteger(amount) || Number(amount) < 0
    || (value.kind === 'COIN' ? value.ticketsAfter : value.balanceAfter) !== null) return invalid()
  return value as unknown as RewardReceipt
}

export async function claimReward(id: string, signal: AbortSignal) {
  if (!isNotificationId(id)) return invalid()
  return parseRewardReceipt(await inboxRequest(`/api/v1/notifications/${id}/claim`, signal, 'POST'), id)
}

export interface RewardGrantInput { operationId: string; userId: string; kind: RewardKind; amount: number; title: string; text: string; expiresAt: string }
export async function sendReward(input: RewardGrantInput, signal: AbortSignal) {
  const value = await inboxRequest('/api/v1/admin/wallet-grants/rewards', signal, 'POST', input)
  if (!record(value) || value.operationId !== input.operationId || !isNotificationId(value.notificationId) || !date(value.createdAt)) return invalid()
  return { operationId: value.operationId, notificationId: value.notificationId, createdAt: value.createdAt }
}
export async function loadNotifications(cursor: string, signal: AbortSignal) {
  return parseNotificationPage(await inboxRequest('/api/v1/notifications?limit=20' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''), signal), cursor)
}
export async function readNotification(id: string, signal: AbortSignal) {
  if (!isNotificationId(id)) return invalid()
  const value = parseNotificationDetail(await inboxRequest(`/api/v1/notifications/${id}/read`, signal, 'PATCH'))
  if (value.id !== id || value.readAt === null) return invalid()
  return value
}
export function sendFeedbackReply(id: string, body: { operationId: string; text: string; status: FeedbackStatus; expectedVersion: number }, signal: AbortSignal) {
  if (!isNotificationId(id)) return invalid()
  return inboxRequest(`/api/v1/admin/operations/feedback/${id}/replies`, signal, 'POST', body)
}
export function saveFeedbackStatus(id: string, status: FeedbackStatus, expectedVersion: number, signal: AbortSignal) {
  if (!isNotificationId(id)) return invalid()
  return inboxRequest(`/api/v1/admin/operations/feedback/${id}/status`, signal, 'PATCH', { status, expectedVersion })
}

export interface RewardRecipient { userId: string; nickname: string }
export interface RewardHistoryEntry { notificationId: string; title: string; kind: RewardKind; amount: number; createdAt: string; expiresAt: string; claimedAt: string | null; status: 'PENDING' | 'CLAIMED' | 'EXPIRED' }
export interface RewardHistoryPage { items: RewardHistoryEntry[]; nextCursor: string | null }
export async function findRewardRecipients(query: string, signal: AbortSignal): Promise<RewardRecipient[]> {
  const value = await inboxRequest('/api/v1/admin/wallet-grants/rewards/recipients?query=' + encodeURIComponent(query), signal)
  if (!Array.isArray(value) || value.length > 20) return invalid()
  return value.map(v => {
    if (!record(v) || !isNotificationId(v.userId) || typeof v.nickname !== 'string' || !v.nickname.trim()) return invalid()
    return { userId: v.userId, nickname: v.nickname }
  })
}
export async function loadRewardHistory(userId: string, cursor: string, signal: AbortSignal): Promise<RewardHistoryPage> {
  if (!isNotificationId(userId) || (cursor && !isNotificationId(cursor))) return invalid()
  const value = await inboxRequest('/api/v1/admin/wallet-grants/rewards?userId=' + userId + (cursor ? '&cursor=' + cursor : ''), signal)
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 20) return invalid()
  let previous = cursor ? BigInt(cursor) : 9223372036854775808n
  const items = value.items.map(v => {
    if (!record(v) || !isNotificationId(v.notificationId) || BigInt(v.notificationId) >= previous
      || typeof v.title !== 'string' || (v.kind !== 'COIN' && v.kind !== 'GACHA_TICKET')
      || !Number.isSafeInteger(v.amount) || Number(v.amount) <= 0 || !date(v.createdAt) || !date(v.expiresAt)
      || !(v.claimedAt === null || date(v.claimedAt)) || !['PENDING','CLAIMED','EXPIRED'].includes(String(v.status))
      || ((v.status === 'CLAIMED') !== (v.claimedAt !== null))) return invalid()
    previous = BigInt(v.notificationId)
    return v as unknown as RewardHistoryEntry
  })
  if (value.nextCursor !== null && (!isNotificationId(value.nextCursor) || value.nextCursor !== items.at(-1)?.notificationId)) return invalid()
  return { items, nextCursor: value.nextCursor as string | null }
}
