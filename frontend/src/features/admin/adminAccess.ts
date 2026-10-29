import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'

export interface AdminAccess { canRead: boolean; canGrant: boolean }

export class AdminAccessError extends Error {
  constructor(message: string, readonly kind: 'unauthenticated' | 'forbidden' | 'unavailable') {
    super(message)
  }
}

export async function loadAdminAccess(signal: AbortSignal): Promise<AdminAccess> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') {
    throw new AdminAccessError('로그인이 필요합니다. 다시 로그인해주세요.', 'unauthenticated')
  }
  const current = () => !signal.aborted && getAuthSession() === owner
  const fetchOnce = () => fetch('/api/v1/admin/me', {
    method: 'GET', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}` },
  })

  let response = await fetchOnce()
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('조회가 취소되었습니다.')
    if (!restored) throw new AdminAccessError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') {
      throw new AdminAccessError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
    }
    response = await fetchOnce()
  }
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) {
    throw new AdminAccessError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
  }
  if (response.status === 403) {
    throw new AdminAccessError('관리자 권한이 없습니다.', 'forbidden')
  }
  if (!response.ok) {
    throw new AdminAccessError('관리자 권한을 확인하지 못했습니다. 다시 시도해주세요.', 'unavailable')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (!body || typeof body !== 'object' || !('canRead' in body) || !('canGrant' in body)
    || typeof body.canRead !== 'boolean' || typeof body.canGrant !== 'boolean') {
    throw new AdminAccessError('관리자 권한 응답을 확인하지 못했습니다. 다시 시도해주세요.', 'unavailable')
  }
  return { canRead: body.canRead, canGrant: body.canGrant }
}
