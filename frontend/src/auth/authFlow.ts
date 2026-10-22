export type AuthSession =
  | { status: 'AUTHENTICATED'; accessToken: string }
  | { status: 'ONBOARDING_REQUIRED'; onboardingToken: string }

let currentSession: AuthSession | null = null
let callbackExchange: Promise<AuthSession> | null = null
let refreshRequest: Promise<boolean> | null = null

export function getAuthSession(): AuthSession | null {
  return currentSession
}

export function clearAuthSession(): void {
  currentSession = null
  callbackExchange = null
  refreshRequest = null
}

export function restoreAuthSession(): Promise<boolean> {
  if (currentSession?.status === 'AUTHENTICATED') return Promise.resolve(true)
  if (refreshRequest) return refreshRequest

  refreshRequest = fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  }).then(async (response) => {
    if (!response.ok) return false
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('accessToken' in body) || typeof body.accessToken !== 'string') {
      return false
    }
    currentSession = { status: 'AUTHENTICATED', accessToken: body.accessToken }
    return true
  }).catch(() => false).finally(() => {
    refreshRequest = null
  })

  return refreshRequest
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('공원에서 나가지 못했습니다. 잠시 후 다시 시도해 주세요.')
  clearAuthSession()
}

export function exchangeCallbackCode(): Promise<AuthSession> {
  if (callbackExchange) return callbackExchange

  const params = new URLSearchParams(window.location.hash.slice(1))
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  const codes = params.getAll('exchange_code')
  if (codes.length !== 1 || [...params.keys()].some((key) => key !== 'exchange_code')
      || !/^[A-Za-z0-9_-]{43}$/.test(codes[0])) {
    return Promise.reject(new Error('교환 코드를 확인할 수 없습니다. 다시 로그인해 주세요.'))
  }

  callbackExchange = fetch('/api/v1/auth/exchange', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchangeCode: codes[0] }),
  }).then(async (response) => {
    if (!response.ok) throw new Error('로그인을 완료하지 못했습니다. 다시 시도해 주세요.')
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('status' in body)) {
      throw new Error('로그인 응답을 확인할 수 없습니다.')
    }
    if (body.status === 'AUTHENTICATED' && 'accessToken' in body && typeof body.accessToken === 'string') {
      currentSession = { status: 'AUTHENTICATED', accessToken: body.accessToken }
    } else if (body.status === 'ONBOARDING_REQUIRED' && 'onboardingToken' in body
        && typeof body.onboardingToken === 'string') {
      currentSession = { status: 'ONBOARDING_REQUIRED', onboardingToken: body.onboardingToken }
    } else {
      throw new Error('로그인 응답을 확인할 수 없습니다.')
    }
    return currentSession
  })

  return callbackExchange
}
