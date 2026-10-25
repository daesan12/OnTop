import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

export interface AdminFeedbackEntry { receiptId: string; authorUserId: number | null; channelId: string; text: string; acceptedAt: string }
export interface AdminFeedbackPage { items: AdminFeedbackEntry[]; nextCursor: string | null }
export class AdminFeedbackError extends Error {
  constructor(message: string, readonly code: string, readonly authEnded = false) { super(message) }
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n
const invalid = () => { throw new AdminFeedbackError('의견 목록 응답을 확인하지 못했어요. 다시 조회해주세요.', 'INVALID_RESPONSE') }
/** Existing BE contract only. No nickname lookup, local persistence, or public world broadcast. */
export function parseAdminFeedbackPage(value: unknown, cursor = ''): AdminFeedbackPage {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 20 || (cursor && !id(cursor))) return invalid()
  let previous = cursor ? BigInt(cursor) : 9223372036854775808n
  const items = value.items.map((item): AdminFeedbackEntry => {
    if (!record(item) || !id(item.receiptId) || BigInt(item.receiptId) >= previous
      || !(item.authorUserId === null || Number.isSafeInteger(item.authorUserId) && Number(item.authorUserId) > 0)
      || typeof item.channelId !== 'string' || !item.channelId || item.channelId.length > 120
      || typeof item.text !== 'string' || !item.text.length || item.text.length > 600
      || typeof item.acceptedAt !== 'string' || !Number.isFinite(Date.parse(item.acceptedAt))) return invalid()
    previous = BigInt(item.receiptId)
    return { receiptId: item.receiptId, authorUserId: item.authorUserId as number | null,
      channelId: item.channelId, text: item.text, acceptedAt: item.acceptedAt }
  })
  if (value.nextCursor !== null && (!id(value.nextCursor) || value.nextCursor !== items.at(-1)?.receiptId)) return invalid()
  return { items, nextCursor: value.nextCursor as string | null }
}
export async function loadAdminFeedback(cursor: string, signal: AbortSignal): Promise<AdminFeedbackPage> {
  if (cursor && !id(cursor)) throw new AdminFeedbackError('페이지를 다시 선택해주세요.', 'INVALID_CURSOR')
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new AdminFeedbackError('다시 로그인해주세요.', 'UNAUTHENTICATED', true)
  const current = () => !signal.aborted && getAuthSession() === owner
  const fetchOnce = () => fetch('/api/v1/admin/feedback?limit=20' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''), {
    method: 'GET', credentials: 'omit', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}` },
  })
  let response = await fetchOnce()
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('조회가 취소되었습니다.')
    if (!restored) throw new AdminFeedbackError('로그인이 만료되었어요. 다시 로그인해주세요.', 'UNAUTHENTICATED', true)
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw new AdminFeedbackError('다시 로그인해주세요.', 'UNAUTHENTICATED', true)
    response = await fetchOnce()
  }
  const body: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (!response.ok) {
    const code = record(body) && typeof body.code === 'string' ? body.code : 'HTTP_ERROR'
    if (response.status === 401) throw new AdminFeedbackError('다시 로그인해주세요.', code, true)
    if (response.status === 403) throw new AdminFeedbackError(code === 'FEEDBACK_ADMIN_REQUIRED'
      ? '소리함 조회 권한이 없어요. 관리자 등록을 확인해주세요.' : '이 환경에서는 관리자 조회가 허용되지 않았어요.', code)
    throw new AdminFeedbackError(response.status === 404 || response.status === 503
      ? '소리함 관리자 조회가 아직 준비되지 않았어요. 서버 설정을 확인한 뒤 다시 조회해주세요.'
      : '의견 목록을 가져오지 못했어요. 다시 조회해주세요.', code)
  }
  return parseAdminFeedbackPage(body, cursor)
}
