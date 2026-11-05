import {
  NICKNAME_INAPPROPRIATE_MESSAGE,
  NICKNAME_RESERVED_MESSAGE,
  nicknameServerProblem,
  type NicknameServerProblem,
} from '../features/user/nicknamePolicy'

export type AuthSession =
  | { status: 'AUTHENTICATED'; accessToken: string }
  | { status: 'ONBOARDING_REQUIRED'; onboardingToken: string }

export type CharacterGender = 'MALE' | 'FEMALE'

export class OnboardingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
  }
}

let sessionGeneration = 0
let currentSession: AuthSession | null = null
let callbackExchange: Promise<AuthSession> | null = null
let refreshRequest: Promise<boolean> | null = null
let initialRestore: Promise<boolean> | null = null

export function getAuthSession(): AuthSession | null {
  return currentSession
}

export function clearAuthSession(): void {
  ++sessionGeneration
  currentSession = null
  callbackExchange = null
  refreshRequest = null
  initialRestore = null
}

export function preloadAuthSession(): void {
  initialRestore ??= restoreAuthSession()
}

/** Reuse even an early failed result once the checking UI mounts. StrictMode's
 * two effects share it until the next microtask; later rechecks can retry. */
export function restoreInitialAuthSession(): Promise<boolean> {
  const request = initialRestore ?? restoreAuthSession()
  void request.then(() => { if (initialRestore === request) initialRestore = null })
  return request
}

export function restoreAuthSession(forceRefresh = false): Promise<boolean> {
  if (!forceRefresh && currentSession?.status === 'AUTHENTICATED') return Promise.resolve(true)
  if (refreshRequest) return refreshRequest

  const generation = sessionGeneration
  const request = fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  }).then(async (response) => {
    if (!response.ok || generation !== sessionGeneration) return false
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('accessToken' in body) || typeof body.accessToken !== 'string') {
      return false
    }
    if (generation !== sessionGeneration) return false
    currentSession = { status: 'AUTHENTICATED', accessToken: body.accessToken }
    return true
  }).catch(() => false).finally(() => {
    if (refreshRequest === request) refreshRequest = null
  })

  refreshRequest = request
  return request
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

export type OnboardingNicknameAvailability = 'available' | 'taken' | NicknameServerProblem | 'unavailable'

const ONBOARDING_EXPIRED_MESSAGE = '설정 시간이 만료되었어요. 다시 로그인해 주세요.'

function errorCode(body: unknown): string | null {
  return body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : null
}

/** GET /api/v1/users/nickname-availability with the onboarding Bearer. A check only: the server
 * neither consumes nor extends the onboarding token, and the result reserves nothing. */
export async function checkOnboardingNickname(nickname: string, signal?: AbortSignal): Promise<OnboardingNicknameAvailability> {
  if (currentSession?.status !== 'ONBOARDING_REQUIRED') {
    throw new OnboardingError(ONBOARDING_EXPIRED_MESSAGE, 'ONBOARDING_EXPIRED')
  }
  const generation = sessionGeneration
  let response: Response
  try {
    response = await fetch(`/api/v1/users/nickname-availability?nickname=${encodeURIComponent(nickname)}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${currentSession.onboardingToken}` },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    return 'unavailable'
  }
  const body: unknown = await response.json().catch(() => null)
  if (response.status === 401) {
    if (generation === sessionGeneration) clearAuthSession()
    throw new OnboardingError(ONBOARDING_EXPIRED_MESSAGE, 'ONBOARDING_EXPIRED')
  }
  if (response.ok) {
    const available = body && typeof body === 'object' && 'available' in body ? body.available : undefined
    return typeof available === 'boolean' ? (available ? 'available' : 'taken') : 'unavailable'
  }
  return nicknameServerProblem(errorCode(body)) ?? 'unavailable'
}

export async function completeOnboarding(nickname: string, characterGender: CharacterGender): Promise<void> {
  if (currentSession?.status !== 'ONBOARDING_REQUIRED') {
    throw new OnboardingError(ONBOARDING_EXPIRED_MESSAGE, 'ONBOARDING_EXPIRED')
  }

  const response = await fetch('/api/v1/users/onboarding', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.onboardingToken}`,
    },
    body: JSON.stringify({ nickname, characterGender }),
  })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const code = errorCode(body) ?? 'ONBOARDING_FAILED'
    if (response.status === 401) {
      clearAuthSession()
      throw new OnboardingError(ONBOARDING_EXPIRED_MESSAGE, 'ONBOARDING_EXPIRED')
    }
    if (code === 'USER_NICKNAME_ALREADY_EXISTS') {
      // A passed availability check reserves nothing: someone may register the name first.
      throw new OnboardingError('이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.', code)
    }
    if (code === 'USER_RESERVED_NICKNAME') {
      throw new OnboardingError(NICKNAME_RESERVED_MESSAGE, code)
    }
    if (code === 'USER_INAPPROPRIATE_NICKNAME') {
      throw new OnboardingError(NICKNAME_INAPPROPRIATE_MESSAGE, code)
    }
    if (code === 'USER_INVALID_NICKNAME') {
      throw new OnboardingError('한글, 영문, 숫자로 2~8자 입력해 주세요.', code)
    }
    if (code === 'USER_INVALID_CHARACTER_GENDER' || code === 'USER_INVALID_ONBOARDING_REQUEST') {
      throw new OnboardingError('입력한 정보를 확인하고 다시 시도해 주세요.', code)
    }
    if (code === 'USER_ALREADY_REGISTERED') {
      clearAuthSession()
      throw new OnboardingError('이미 가입된 계정이에요. 다시 로그인해 주세요.', code)
    }
    throw new OnboardingError('설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.', code)
  }

  if (!body || typeof body !== 'object' || !('accessToken' in body) || typeof body.accessToken !== 'string') {
    throw new OnboardingError('로그인 응답을 확인할 수 없어요. 다시 시도해 주세요.', 'INVALID_RESPONSE')
  }
  currentSession = { status: 'AUTHENTICATED', accessToken: body.accessToken }
  callbackExchange = null
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
