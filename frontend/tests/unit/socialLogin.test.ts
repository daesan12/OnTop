import { expect, it } from 'vitest'
import { socialAuthorizeUrl, type SocialProvider } from '../../src/auth/socialLogin'

it.each(['naver', 'ssafy'] as const)('uses the same-origin %s BE authorize route without OAuth query parameters', provider => {
  const url = new URL(socialAuthorizeUrl(provider, 'https://dev.on-top.world', false))
  expect(url.origin).toBe('https://dev.on-top.world')
  expect(url.pathname).toBe(`/api/v1/auth/${provider}/authorize`)
  expect(url.search).toBe('')
  expect(url.hash).toBe('')
})
it.each(['naver', 'ssafy'] as const)('keeps %s OAuth on the existing localhost cookie host during local development', provider => {
  expect(socialAuthorizeUrl(provider, 'http://127.0.0.1:5197', true))
    .toBe(`http://localhost:5197/api/v1/auth/${provider}/authorize`)
  expect(socialAuthorizeUrl(provider, 'http://localhost:5197', true))
    .toBe(`http://localhost:5197/api/v1/auth/${provider}/authorize`)
})
it('does not rewrite a deployed origin and cannot use an arbitrary provider path', () => {
  expect(socialAuthorizeUrl('naver', 'https://www.on-top.world', false))
    .toBe('https://www.on-top.world/api/v1/auth/naver/authorize')
  expect(() => socialAuthorizeUrl('../../other' as SocialProvider, 'https://dev.on-top.world')).toThrow()
})
