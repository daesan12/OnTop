import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

export interface AdminWalletGrantPreview {
  amountPerMember: number
  reason: string
  recipientCount: number
  missingWalletCount: number
  totalAmount: number
  executable: boolean
}

export interface AdminWalletGrantCommand {
  requestId: string
  amountPerMember: number
  reason: string
  expectedRecipientCount: number
}

export interface AdminWalletGrantResult {
  batchId: number
  requestId: string
  amountPerMember: number
  reason: string
  recipientCount: number
  totalAmount: number
  executedAt: string
}

type GrantErrorKind = 'unauthenticated' | 'forbidden' | 'invalid' | 'changed' | 'conflict'
  | 'unavailable' | 'uncertain'

export class AdminWalletGrantError extends Error {
  constructor(message: string, readonly code: string, readonly kind: GrantErrorKind) { super(message) }
  get authEnded() { return this.kind === 'unauthenticated' }
  get requiresPreview() { return this.kind === 'changed' }
  get retryable() { return this.kind === 'unavailable' || this.kind === 'uncertain' }
}

const positiveSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const nonNegativeSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const invalidResponse = () => {
  throw new AdminWalletGrantError('엽전 지급 응답을 확인하지 못했습니다. 다시 조회해주세요.', 'INVALID_RESPONSE', 'unavailable')
}

export function parseAdminWalletGrantPreview(value: unknown): AdminWalletGrantPreview {
  if (!record(value) || !positiveSafeInteger(value.amountPerMember)
    || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 200
    || !nonNegativeSafeInteger(value.recipientCount) || !nonNegativeSafeInteger(value.missingWalletCount)
    || !nonNegativeSafeInteger(value.totalAmount) || typeof value.executable !== 'boolean'
    || value.totalAmount !== value.amountPerMember * value.recipientCount
    || value.executable !== (value.recipientCount > 0 && value.missingWalletCount === 0)) return invalidResponse()
  return {
    amountPerMember: value.amountPerMember,
    reason: value.reason,
    recipientCount: value.recipientCount,
    missingWalletCount: value.missingWalletCount,
    totalAmount: value.totalAmount,
    executable: value.executable,
  }
}

export function parseAdminWalletGrantResult(value: unknown): AdminWalletGrantResult {
  if (!record(value) || !positiveSafeInteger(value.batchId) || !uuid(value.requestId)
    || !positiveSafeInteger(value.amountPerMember) || typeof value.reason !== 'string'
    || !value.reason.trim() || value.reason.length > 200 || !positiveSafeInteger(value.recipientCount)
    || !nonNegativeSafeInteger(value.totalAmount) || value.totalAmount !== value.amountPerMember * value.recipientCount
    || typeof value.executedAt !== 'string' || !Number.isFinite(Date.parse(value.executedAt))) return invalidResponse()
  return {
    batchId: value.batchId,
    requestId: value.requestId,
    amountPerMember: value.amountPerMember,
    reason: value.reason,
    recipientCount: value.recipientCount,
    totalAmount: value.totalAmount,
    executedAt: value.executedAt,
  }
}

function errorBody(value: unknown) {
  return record(value) && typeof value.code === 'string' ? value.code : 'HTTP_ERROR'
}

function requestError(status: number, body: unknown, operation: 'preview' | 'execute') {
  const code = errorBody(body)
  if (status === 401) return new AdminWalletGrantError('로그인이 만료되었습니다. 다시 로그인해주세요.', code, 'unauthenticated')
  if (status === 403) return new AdminWalletGrantError('엽전 지급 권한이 없습니다. 관리자 권한 설정을 확인해주세요.', code, 'forbidden')
  if (status === 400) return new AdminWalletGrantError('지급액과 지급 사유를 다시 확인해주세요.', code, 'invalid')
  if (status === 409) {
    if (['ADMIN_WALLET_GRANT_TARGET_CHANGED', 'ADMIN_WALLET_GRANT_WALLETS_NOT_READY',
      'ADMIN_WALLET_GRANT_NO_RECIPIENTS', 'ADMIN_MEMBER_STATE_CHANGED',
      'ADMIN_WALLET_GRANT_WALLET_STATE_INVALID'].includes(code)) {
      return new AdminWalletGrantError('회원 또는 지갑 상태가 바뀌었습니다. 미리보기를 다시 확인해주세요.', code, 'changed')
    }
    return new AdminWalletGrantError('같은 요청 ID가 다른 지급 내용에 사용되었습니다. 새로 미리보기해주세요.', code, 'conflict')
  }
  return new AdminWalletGrantError(operation === 'execute'
    ? '지급 결과를 확인하지 못했습니다. 같은 요청으로 결과를 다시 확인해주세요.'
    : '엽전 지급 미리보기를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', code, 'unavailable')
}

async function post<T>(path: string, body: object, operation: 'preview' | 'execute', signal: AbortSignal,
  parse: (value: unknown) => T): Promise<T> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') {
    throw new AdminWalletGrantError('로그인이 필요합니다. 다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
  }
  const current = () => !signal.aborted && getAuthSession() === owner
  const fetchOnce = () => fetch(path, {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let response: Response
  try { response = await fetchOnce() } catch (cause) {
    if (signal.aborted) throw cause
    throw new AdminWalletGrantError(operation === 'execute'
      ? '연결이 끊겨 지급 결과를 확인하지 못했습니다. 같은 요청으로 결과를 다시 확인해주세요.'
      : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 'NETWORK_ERROR', operation === 'execute' ? 'uncertain' : 'unavailable')
  }
  if (!current()) throw new Error('요청이 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('요청이 취소되었습니다.')
    if (!restored) throw new AdminWalletGrantError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') {
      throw new AdminWalletGrantError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
    }
    try { response = await fetchOnce() } catch (cause) {
      if (signal.aborted) throw cause
      throw new AdminWalletGrantError(operation === 'execute'
        ? '연결이 끊겨 지급 결과를 확인하지 못했습니다. 같은 요청으로 결과를 다시 확인해주세요.'
        : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 'NETWORK_ERROR', operation === 'execute' ? 'uncertain' : 'unavailable')
    }
  }
  const value: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('요청이 취소되었습니다.')
  if (!response.ok) throw requestError(response.status, value, operation)
  return parse(value)
}

export async function previewAdminWalletGrant(amountPerMember: number, reason: string, signal: AbortSignal) {
  const value = await post('/api/v1/admin/wallet-grants/preview', { amountPerMember, reason }, 'preview', signal,
    parseAdminWalletGrantPreview)
  if (value.amountPerMember !== amountPerMember || value.reason !== reason) return invalidResponse()
  return value
}

export async function executeAdminWalletGrant(command: AdminWalletGrantCommand, signal: AbortSignal) {
  const value = await post('/api/v1/admin/wallet-grants', command, 'execute', signal, parseAdminWalletGrantResult)
  if (value.requestId !== command.requestId || value.amountPerMember !== command.amountPerMember
    || value.reason !== command.reason || value.recipientCount !== command.expectedRecipientCount) return invalidResponse()
  return value
}
