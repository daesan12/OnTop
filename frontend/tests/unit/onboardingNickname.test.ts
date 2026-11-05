import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkOnboardingNickname,
  clearAuthSession,
  completeOnboarding,
  exchangeCallbackCode,
  getAuthSession,
  OnboardingError,
  type OnboardingNicknameAvailability,
} from '../../src/auth/authFlow'
import {
  blocksSubmit,
  createNicknameChecker,
  localNicknameCheck,
  nicknameCheckFromOnboardingError,
  nicknameFeedback,
} from '../../src/onboarding/nicknameCheck'

const ONBOARDING_TOKEN = 'ob_' + 'a'.repeat(43)

async function startOnboarding() {
  vi.stubGlobal('window', {
    location: { hash: '#exchange_code=' + 'A'.repeat(43), pathname: '/auth/callback', search: '' },
    history: { state: null, replaceState: () => undefined },
  })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'ONBOARDING_REQUIRED', onboardingToken: ONBOARDING_TOKEN })))
  await exchangeCallbackCode()
}

function respondWith(response: Response | (() => Promise<Response>)) {
  const fetch = vi.fn(typeof response === 'function' ? response : async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const error = (status: number, code: string) => Response.json({ code, message: 'server message' }, { status })

beforeEach(() => clearAuthSession())
afterEach(() => vi.unstubAllGlobals())

describe('checkOnboardingNickname', () => {
  beforeEach(startOnboarding)

  it('asks the existing availability API with the onboarding Bearer and keeps the token', async () => {
    const fetch = respondWith(Response.json({ nickname: '산책자', available: true }))
    expect(await checkOnboardingNickname('산책자')).toBe('available')
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/users/nickname-availability?nickname=' + encodeURIComponent('산책자'))
    expect(init.method).toBeUndefined()
    expect(init.cache).toBe('no-store')
    expect(init.headers).toEqual({ Authorization: `Bearer ${ONBOARDING_TOKEN}` })
    expect(getAuthSession()).toEqual({ status: 'ONBOARDING_REQUIRED', onboardingToken: ONBOARDING_TOKEN })
  })

  it('separates a taken name from an available one', async () => {
    respondWith(Response.json({ nickname: '온탑고수', available: false }))
    expect(await checkOnboardingNickname('온탑고수')).toBe('taken')
  })

  it('maps the server format and reserved-name rejections', async () => {
    respondWith(error(400, 'USER_RESERVED_NICKNAME'))
    expect(await checkOnboardingNickname('gm123')).toBe('reserved')
    respondWith(error(400, 'USER_INVALID_NICKNAME'))
    expect(await checkOnboardingNickname('가!')).toBe('format')
  })

  it('reports server, network and malformed answers as unavailable without ending onboarding', async () => {
    respondWith(error(503, 'USER_ONBOARDING_UNAVAILABLE'))
    expect(await checkOnboardingNickname('산책자')).toBe('unavailable')
    respondWith(async () => { throw new TypeError('offline') })
    expect(await checkOnboardingNickname('산책자')).toBe('unavailable')
    respondWith(Response.json({ available: 'yes' }))
    expect(await checkOnboardingNickname('산책자')).toBe('unavailable')
    expect(getAuthSession()?.status).toBe('ONBOARDING_REQUIRED')
  })

  it('treats 401 as an expired onboarding token', async () => {
    respondWith(error(401, 'AUTH_INVALID_ONBOARDING_TOKEN'))
    await expect(checkOnboardingNickname('산책자')).rejects.toMatchObject({ code: 'ONBOARDING_EXPIRED' })
    expect(getAuthSession()).toBeNull()
  })
})

describe('completeOnboarding', () => {
  beforeEach(startOnboarding)

  it('saves without a prior check, so the server still validates the nickname finally', async () => {
    const fetch = respondWith(Response.json({ accessToken: 'access' }, { status: 201 }))
    await completeOnboarding('산책자', 'FEMALE')
    expect(fetch).toHaveBeenCalledOnce()
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/users/onboarding')
  })

  it.each([
    [409, 'USER_NICKNAME_ALREADY_EXISTS', '이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.'],
    [400, 'USER_RESERVED_NICKNAME', 'GM으로 시작하는 닉네임은 사용할 수 없어요.'],
    [400, 'USER_INVALID_NICKNAME', '한글, 영문, 숫자로 2~8자 입력해 주세요.'],
    [400, 'USER_INVALID_CHARACTER_GENDER', '입력한 정보를 확인하고 다시 시도해 주세요.'],
    [503, 'USER_ONBOARDING_UNAVAILABLE', '설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'],
  ])('keeps the %s %s rejection distinct', async (status, code, message) => {
    respondWith(error(status, code))
    const rejection = await completeOnboarding('산책자', 'MALE').catch((caught: unknown) => caught)
    expect(rejection).toBeInstanceOf(OnboardingError)
    expect(rejection).toMatchObject({ code, message })
    // A nickname conflict keeps the same onboarding token for a retry.
    expect(getAuthSession()?.status).toBe('ONBOARDING_REQUIRED')
  })

  it('shows a final-save conflict after a passed check as a taken nickname', async () => {
    respondWith(Response.json({ nickname: '산책자', available: true }))
    expect(await checkOnboardingNickname('산책자')).toBe('available')
    respondWith(error(409, 'USER_NICKNAME_ALREADY_EXISTS'))
    const rejection = await completeOnboarding('산책자', 'MALE').then(() => null, (caught: OnboardingError) => caught)
    const check = nicknameCheckFromOnboardingError('산책자', rejection?.code ?? '')
    expect(check).toEqual({ value: '산책자', status: 'taken' })
    expect(nicknameFeedback('산책자', check)).toEqual({ message: '이미 사용 중인 닉네임이에요.', tone: 'error' })
    expect(blocksSubmit('산책자', check)).toBe(true)
  })
})

describe('createNicknameChecker', () => {
  function deferred() {
    const calls: { nickname: string; signal: AbortSignal; resolve: (value: OnboardingNicknameAvailability) => void; reject: (error: unknown) => void }[] = []
    const request = (nickname: string, signal: AbortSignal) => new Promise<OnboardingNicknameAvailability>((resolve, reject) => {
      calls.push({ nickname, signal, resolve, reject })
    })
    return { calls, request }
  }

  it('drops a late answer once a newer check started and aborts the old request', async () => {
    const { calls, request } = deferred()
    const checker = createNicknameChecker(request)
    const first = checker.check('산책자')
    const second = checker.check('산책왕')
    expect(calls[0].signal.aborted).toBe(true)
    calls[1].resolve('available')
    calls[0].resolve('taken')
    expect(await first).toBeNull()
    expect(await second).toEqual({ value: '산책왕', status: 'available' })
  })

  it('ignores an answer after cancel (nickname edited)', async () => {
    const { calls, request } = deferred()
    const checker = createNicknameChecker(request)
    const pending = checker.check('산책자')
    checker.cancel()
    calls[0].resolve('available')
    expect(await pending).toBeNull()
  })

  it('turns an unexpected failure into unavailable and allows a retry', async () => {
    const { calls, request } = deferred()
    const checker = createNicknameChecker(request)
    const failed = checker.check('산책자')
    calls[0].reject(new Error('boom'))
    expect(await failed).toEqual({ value: '산책자', status: 'unavailable' })
    const retried = checker.check('산책자')
    calls[1].resolve('available')
    expect(await retried).toEqual({ value: '산책자', status: 'available' })
  })

  it('rethrows token expiry only for the latest check', async () => {
    const { calls, request } = deferred()
    const checker = createNicknameChecker(request)
    const stale = checker.check('산책자')
    const latest = checker.check('산책왕')
    calls[0].reject(new OnboardingError('expired', 'ONBOARDING_EXPIRED'))
    expect(await stale).toBeNull()
    calls[1].reject(new OnboardingError('expired', 'ONBOARDING_EXPIRED'))
    await expect(latest).rejects.toMatchObject({ code: 'ONBOARDING_EXPIRED' })
  })
})

describe('nickname feedback', () => {
  it('asks for a check before the server answered', () => {
    expect(nicknameFeedback('산책자', null)).toEqual({ message: '중복 확인이 필요해요.', tone: 'info' })
    expect(nicknameFeedback('', null)).toBeNull()
  })

  it('shows each server answer for the value it checked', () => {
    expect(nicknameFeedback('산책자', { value: '산책자', status: 'checking' })?.message).toBe('닉네임 확인 중…')
    expect(nicknameFeedback('산책자', { value: '산책자', status: 'available' })).toEqual({ message: '사용 가능한 닉네임이에요.', tone: 'ok' })
    expect(nicknameFeedback('산책자', { value: '산책자', status: 'taken' })?.message).toBe('이미 사용 중인 닉네임이에요.')
    expect(nicknameFeedback('산책자', { value: '산책자', status: 'unavailable' })?.message).toBe('닉네임을 확인하지 못했어요. 다시 시도해 주세요.')
  })

  it('invalidates a result as soon as the nickname changes', () => {
    const available = { value: '산책자', status: 'available' as const }
    expect(nicknameFeedback('산책자1', available)?.message).toBe('중복 확인이 필요해요.')
    const taken = { value: '산책자', status: 'taken' as const }
    expect(blocksSubmit('산책자1', taken)).toBe(false)
  })

  it('keeps the local format rules and the reserved GM prefix message', () => {
    expect(localNicknameCheck('가')).toEqual({ value: '가', status: 'format' })
    expect(localNicknameCheck('가 나')).toEqual({ value: '가 나', status: 'format' })
    expect(localNicknameCheck('Gm관리')).toEqual({ value: 'Gm관리', status: 'reserved' })
    expect(localNicknameCheck('게임GM')).toBeNull()
    expect(nicknameFeedback('gm', null)?.message).toBe('GM으로 시작하는 닉네임은 사용할 수 없어요.')
    expect(nicknameFeedback('가', null)).toBeNull()
    expect(nicknameFeedback('가', { value: '가', status: 'format' })?.message).toBe('한글, 영문, 숫자로 2~8자 입력해 주세요.')
  })

  it('never requires a check to submit, but blocks a known rejection', () => {
    expect(blocksSubmit('산책자', null)).toBe(false)
    expect(blocksSubmit('산책자', { value: '산책자', status: 'checking' })).toBe(false)
    expect(blocksSubmit('산책자', { value: '산책자', status: 'unavailable' })).toBe(false)
    expect(blocksSubmit('산책자', { value: '산책자', status: 'taken' })).toBe(true)
    expect(blocksSubmit('가', null)).toBe(true)
  })
})
