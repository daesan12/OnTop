import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

export type FeedbackStatus = 'RECEIVED' | 'REVIEWING' | 'RESOLVED'
export interface NotificationItem { id: string; type: 'FEEDBACK_REPLY'; title: string; createdAt: string; readAt: string | null }
export interface NotificationPage { items: NotificationItem[]; nextCursor: string | null; unreadCount: number }
export interface NotificationDetail extends NotificationItem { body: string; feedbackId: string; feedbackText: string; feedbackStatus: FeedbackStatus }
export const statusLabels: Record<FeedbackStatus, string> = { RECEIVED: '접수', REVIEWING: '검토 중', RESOLVED: '반영 완료' }
export const isFeedbackStatus = (v: unknown): v is FeedbackStatus => v === 'RECEIVED' || v === 'REVIEWING' || v === 'RESOLVED'
export const isNotificationId = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const invalid = (): never => { throw new InboxError('알림 응답을 확인하지 못했어요. 다시 확인해주세요.') }
export class InboxError extends Error {
  constructor(message: string, readonly status = 0, readonly code = '') { super(message) }
}
function item(v: unknown): NotificationItem {
  if (!record(v) || !isNotificationId(v.id) || v.type !== 'FEEDBACK_REPLY'
    || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 100 || !date(v.createdAt)
    || !(v.readAt === null || date(v.readAt))) return invalid()
  return { id: v.id, type: v.type, title: v.title, createdAt: v.createdAt, readAt: v.readAt }
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
      : code === 'FEEDBACK_RECIPIENT_UNAVAILABLE' ? '탈퇴한 작성자에게는 답변을 보낼 수 없어요.'
        : response.status === 404 ? '만료되었거나 찾을 수 없는 알림이에요.'
          : response.status === 409 ? '내용이 변경됐어요. 새로고침 후 다시 확인해주세요.'
            : '처리하지 못했어요. 입력을 유지했으니 다시 시도해주세요.', response.status, code)
  }
  return value
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
