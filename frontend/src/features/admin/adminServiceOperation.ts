import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import {
  parseServiceOperationStatus,
  type ServiceOperationMode,
  type ServiceOperationStatus,
} from '../operation/serviceOperation'
import { record } from '../../network/protocol'

export interface AdminServiceOperationCommand {
  mode: ServiceOperationMode
  notice: string
  expectedOpenAt: string | null
  expectedVersion: number
}

type OperationErrorKind = 'unauthenticated' | 'forbidden' | 'invalid' | 'conflict' | 'unavailable' | 'uncertain'

export class AdminServiceOperationError extends Error {
  constructor(message: string, readonly code: string, readonly kind: OperationErrorKind) { super(message) }
  get authEnded() { return this.kind === 'unauthenticated' }
  get requiresRefresh() { return this.kind === 'conflict' || this.kind === 'uncertain' }
}

const errorCode = (value: unknown) => record(value) && typeof value.code === 'string' ? value.code : 'HTTP_ERROR'

function responseError(status: number, value: unknown, method: 'GET' | 'PUT') {
  const code = errorCode(value)
  if (status === 401) return new AdminServiceOperationError('로그인이 만료되었습니다. 다시 로그인해주세요.', code, 'unauthenticated')
  if (status === 403) return new AdminServiceOperationError('운영 관리자 권한이 없습니다. 관리자 권한 설정을 확인해주세요.', code, 'forbidden')
  if (status === 400) return new AdminServiceOperationError('점검 안내와 현재보다 뒤인 재개 예정 시각을 확인해주세요.', code, 'invalid')
  if (status === 409) return new AdminServiceOperationError('다른 관리자가 먼저 운영 상태를 변경했습니다. 최신 상태를 다시 확인해주세요.', code, 'conflict')
  return new AdminServiceOperationError(method === 'PUT'
    ? '변경 결과를 확인하지 못했습니다. 최신 운영 상태를 다시 조회해주세요.'
    : '운영 상태를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', code, method === 'PUT' ? 'uncertain' : 'unavailable')
}

async function request(method: 'GET' | 'PUT', signal: AbortSignal, body?: AdminServiceOperationCommand) {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') {
    throw new AdminServiceOperationError('로그인이 필요합니다. 다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
  }
  const current = () => !signal.aborted && getAuthSession() === owner
  const send = () => fetch('/api/v1/admin/operations/status', {
    method,
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: {
      Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let response: Response
  try { response = await send() } catch (cause) {
    if (signal.aborted) throw cause
    throw new AdminServiceOperationError(method === 'PUT'
      ? '서버 연결이 끊겨 변경 결과를 확인하지 못했습니다. 최신 상태를 다시 조회해주세요.'
      : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 'NETWORK_ERROR', method === 'PUT' ? 'uncertain' : 'unavailable')
  }
  if (!current()) throw new Error('요청이 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('요청이 취소되었습니다.')
    if (!restored) throw new AdminServiceOperationError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') {
      throw new AdminServiceOperationError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'UNAUTHENTICATED', 'unauthenticated')
    }
    try { response = await send() } catch (cause) {
      if (signal.aborted) throw cause
      throw new AdminServiceOperationError(method === 'PUT'
        ? '서버 연결이 끊겨 변경 결과를 확인하지 못했습니다. 최신 상태를 다시 조회해주세요.'
        : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 'NETWORK_ERROR', method === 'PUT' ? 'uncertain' : 'unavailable')
    }
  }
  const value: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('요청이 취소되었습니다.')
  if (!response.ok) throw responseError(response.status, value, method)
  try { return parseServiceOperationStatus(value) } catch {
    throw new AdminServiceOperationError('운영 상태 응답을 확인하지 못했습니다. 다시 조회해주세요.', 'INVALID_RESPONSE', 'unavailable')
  }
}

export function loadAdminServiceOperation(signal: AbortSignal): Promise<ServiceOperationStatus> {
  return request('GET', signal)
}

export async function updateAdminServiceOperation(command: AdminServiceOperationCommand, signal: AbortSignal) {
  const value = await request('PUT', signal, command)
  if (value.mode !== command.mode || value.version !== command.expectedVersion + 1
    || (command.mode === 'NORMAL' && (value.notice !== '' || value.expectedOpenAt !== null))
    || (command.mode !== 'NORMAL' && (value.notice !== command.notice
      || value.expectedOpenAt === null || Date.parse(value.expectedOpenAt) !== Date.parse(command.expectedOpenAt!)))) {
    throw new AdminServiceOperationError(
      '변경된 운영 상태가 요청과 일치하지 않습니다. 최신 상태를 다시 조회해주세요.',
      'INVALID_RESPONSE',
      'uncertain',
    )
  }
  return value
}
