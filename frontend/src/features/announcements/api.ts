import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

export interface Announcement {
  id: string; title: string; text: string; published: boolean; displayOrder: number
  startsAt: string | null; endsAt: string | null; version: number; updatedAt: string
}
export type AnnouncementDraft = Omit<Announcement, 'id' | 'version' | 'updatedAt'> & { expectedVersion: number }
export interface PublicNotice { id: string; text: string; endsAt: string | null; version: number }
export interface NoticeFeed { serverTime: string; refreshAt: string; announcements: PublicNotice[] }
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const optionalDate = (v: unknown) => v === null || date(v)
const number = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
const id = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)

export class AnnouncementError extends Error {
  constructor(message: string, readonly status = 0) { super(message) }
}

async function request(path: string, signal: AbortSignal, method = 'GET', body?: unknown) {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new AnnouncementError('다시 로그인해주세요.', 401)
  const send = () => fetch(path, { method, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    credentials: 'omit', cache: 'no-store', headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const current = () => !signal.aborted && getAuthSession() === owner
  let response = await send()
  if (!current()) throw new AnnouncementError('요청이 취소되었습니다.')
  if (response.status === 401) {
    if (!await restoreAuthSession(true)) throw new AnnouncementError('다시 로그인해주세요.', 401)
    if (signal.aborted) throw new AnnouncementError('요청이 취소되었습니다.')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw new AnnouncementError('다시 로그인해주세요.', 401)
    response = await send()
  }
  if (!current()) throw new AnnouncementError('요청이 취소되었습니다.')
  if (!response.ok) throw new AnnouncementError(response.status === 401 ? '다시 로그인해주세요.' : response.status === 403 ? '운영 관리자 권한이 필요합니다.'
    : response.status === 409 ? '다른 관리자가 변경했습니다. 목록을 새로 조회하고 다시 수정해주세요.'
      : response.status === 400 ? '제목·내용·게시 기간·표시 순서를 확인해주세요.' : '공지를 처리하지 못했어요. 입력을 보관했으니 다시 확인해주세요.', response.status)
  return response.status === 204 ? null : response.json()
}

export function parseNoticeFeed(v: unknown): NoticeFeed {
  if (!record(v) || !date(v.serverTime) || !date(v.refreshAt) || !Array.isArray(v.announcements)
    || v.announcements.some(a => !record(a) || !id(a.id) || typeof a.text !== 'string' || !a.text.trim()
      || a.text.length > 1000 || !optionalDate(a.endsAt) || !number(a.version))) throw new AnnouncementError('공지 응답을 확인하지 못했습니다.')
  return v as unknown as NoticeFeed
}
export async function loadNotices(signal: AbortSignal) { return parseNoticeFeed(await request('/api/v1/announcements', signal)) }
const root = '/api/v1/admin/operations/announcements'
export async function listAnnouncements(signal: AbortSignal): Promise<Announcement[]> {
  const values: unknown = await request(root, signal)
  if (!Array.isArray(values) || values.some(a => !record(a) || !id(a.id) || typeof a.title !== 'string'
    || typeof a.text !== 'string' || typeof a.published !== 'boolean' || !number(a.displayOrder)
    || !number(a.version) || !optionalDate(a.startsAt) || !optionalDate(a.endsAt) || !date(a.updatedAt))) throw new AnnouncementError('공지 목록을 확인하지 못했습니다.')
  return values as Announcement[]
}
export async function saveAnnouncement(id: string, draft: AnnouncementDraft, creating: boolean, signal: AbortSignal) {
  await request(`${root}/${id}`, signal, creating ? 'POST' : 'PUT', draft)
}
export async function deleteAnnouncement(value: Announcement, signal: AbortSignal) {
  await request(`${root}/${value.id}?version=${value.version}`, signal, 'DELETE')
}

export function visibleNotices(feed: NoticeFeed, elapsedMs: number) {
  const now = Date.parse(feed.serverTime) + Math.max(0, elapsedMs)
  return feed.announcements.filter(item => item.endsAt === null || Date.parse(item.endsAt) > now)
}
