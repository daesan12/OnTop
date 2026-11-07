import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'

export type ContactStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'EXPIRED'
export type AwardType = 'RAFFLE' | 'BUNGEOPPANG' | 'JUMPMAP' | 'ASSET_VALUE'

export interface Winning {
  winnerId: number
  weekStart: string
  eventType: AwardType
  place: number
  prizeName: string
  announcedAt: string
  submissionDeadline: string
  contactStatus: ContactStatus
  maskedPhone: string | null
  contactExpiresAt: string | null
}

export interface ContactReceipt {
  weekStart: string
  status: 'SUBMITTED'
  maskedPhone: string
  expiresAt: string
  submissionDeadline: string
}

export class WinnerContactsError extends Error {
  constructor(message: string, readonly code: string) { super(message) }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const validInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const validWeek = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const validMask = (value: unknown): value is string => typeof value === 'string' && /^\*{3}-\*{4}-\d{4}$/.test(value)
const invalid = (): never => { throw new WinnerContactsError('당첨 내역 응답을 확인하지 못했습니다. 다시 조회해주세요.', 'INVALID_RESPONSE') }

export const awardLabels: Record<AwardType, string> = {
  RAFFLE: '응모권 추첨', BUNGEOPPANG: '붕어빵', JUMPMAP: '점프맵', ASSET_VALUE: '엽전 보유량',
}

export function parseWinnings(value: unknown): Winning[] {
  if (!Array.isArray(value)) return invalid()
  return value.map((row: unknown) => {
    if (!isRecord(row) || !Number.isSafeInteger(row.winnerId) || Number(row.winnerId) <= 0
      || !validWeek(row.weekStart) || !Object.hasOwn(awardLabels, String(row.eventType))
      || !Number.isSafeInteger(row.place) || Number(row.place) <= 0 || typeof row.prizeName !== 'string'
      || !validInstant(row.announcedAt) || !validInstant(row.submissionDeadline)
      || !['NOT_SUBMITTED', 'SUBMITTED', 'EXPIRED'].includes(String(row.contactStatus))
      || !(row.maskedPhone === null || validMask(row.maskedPhone))
      || (row.contactStatus === 'SUBMITTED' && !validMask(row.maskedPhone))
      || !(row.contactExpiresAt === null || validInstant(row.contactExpiresAt))) return invalid()
    return {
      winnerId: row.winnerId as number, weekStart: row.weekStart as string,
      eventType: row.eventType as AwardType, place: row.place as number,
      prizeName: row.prizeName as string, announcedAt: row.announcedAt as string,
      submissionDeadline: row.submissionDeadline as string, contactStatus: row.contactStatus as ContactStatus,
      maskedPhone: row.maskedPhone as string | null, contactExpiresAt: row.contactExpiresAt as string | null,
    }
  })
}

export function parseReceipt(value: unknown, week: string): ContactReceipt {
  if (!isRecord(value) || value.weekStart !== week || value.status !== 'SUBMITTED'
    || !validMask(value.maskedPhone) || !validInstant(value.expiresAt)
    || !validInstant(value.submissionDeadline)) return invalid()
  return { weekStart: week, status: 'SUBMITTED', maskedPhone: value.maskedPhone,
    expiresAt: value.expiresAt, submissionDeadline: value.submissionDeadline }
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '')
  return /^010\d{8}$|^01[16789]\d{7,8}$/.test(digits) ? digits : null
}

export function groupWinnings(items: Winning[]): { weekStart: string; awards: Winning[]; deadline: string; status: ContactStatus; maskedPhone: string | null; expiresAt: string | null }[] {
  const weeks = new Map<string, Winning[]>()
  for (const item of items) weeks.set(item.weekStart, [...(weeks.get(item.weekStart) ?? []), item])
  return [...weeks].sort(([a], [b]) => b.localeCompare(a)).map(([weekStart, awards]) => ({
    weekStart, awards, deadline: awards.reduce((latest, item) => item.submissionDeadline > latest ? item.submissionDeadline : latest, awards[0]!.submissionDeadline),
    status: awards[0]!.contactStatus, maskedPhone: awards[0]!.maskedPhone, expiresAt: awards[0]!.contactExpiresAt,
  }))
}

export function canSubmit(status: ContactStatus, deadline: string, now = Date.now()): boolean {
  return status !== 'EXPIRED' && now < Date.parse(deadline)
}

async function request(path: string, method: 'GET' | 'PUT', signal: AbortSignal, phone?: string): Promise<unknown> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new WinnerContactsError('다시 로그인해주세요.', 'UNAUTHENTICATED')
  const send = async () => {
    try {
      return await fetch(path, { method, credentials: 'omit', cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}`,
          ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
        ...(method === 'PUT' ? { body: JSON.stringify({ phone }) } : {}),
      })
    } catch (cause) {
      if (signal.aborted) throw cause
      throw new WinnerContactsError(method === 'PUT'
        ? '제출 결과를 확인하지 못했습니다. 당첨 내역을 새로 조회한 뒤 다시 시도해주세요.'
        : '당첨 내역을 불러오지 못했습니다. 다시 시도해주세요.', 'NETWORK_ERROR')
    }
  }
  let response = await send()
  if (signal.aborted || getAuthSession() !== owner) throw new Error('요청이 취소되었습니다.')
  if (response.status === 401) {
    if (!await restoreAuthSession(true)) throw new WinnerContactsError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'UNAUTHENTICATED')
    owner = getAuthSession()
    if (signal.aborted || owner?.status !== 'AUTHENTICATED') throw new WinnerContactsError('다시 로그인해주세요.', 'UNAUTHENTICATED')
    response = await send()
  }
  const body: unknown = await response.json().catch(() => null)
  if (signal.aborted || getAuthSession() !== owner) throw new Error('요청이 취소되었습니다.')
  if (!response.ok) {
    const code = isRecord(body) && typeof body.code === 'string' ? body.code : 'HTTP_ERROR'
    const message = isRecord(body) && typeof body.message === 'string' ? body.message : ''
    throw new WinnerContactsError(message || (response.status === 404
      ? '당첨 내역 API를 찾지 못했습니다. 배포 상태를 확인해주세요.' : '연락처를 처리하지 못했습니다. 다시 시도해주세요.'), code)
  }
  return body
}

export async function loadMyWinnings(signal: AbortSignal): Promise<Winning[]> {
  const result: Winning[] = []
  for (let offset = 0; ; offset += 100) {
    const page = parseWinnings(await request(`/api/v1/events/winnings/me?limit=100&offset=${offset}`, 'GET', signal))
    result.push(...page)
    if (page.length < 100) return result
  }
}

export async function submitContact(week: string, phone: string, signal: AbortSignal): Promise<ContactReceipt> {
  return parseReceipt(await request(`/api/v1/events/winnings/weeks/${week}/contact`, 'PUT', signal, phone), week)
}
