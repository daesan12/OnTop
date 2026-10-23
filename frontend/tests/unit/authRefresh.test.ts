import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import {
  clearAuthSession,
  getAuthSession,
  restoreAuthSession,
} from '../../src/auth/authFlow'
beforeEach(() => clearAuthSession())
afterEach(() => vi.unstubAllGlobals())
it('shares forced refresh requests and keeps the existing default restore behavior', async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ accessToken: 'test' })),
  )
  vi.stubGlobal('fetch', fetch)
  await Promise.all([restoreAuthSession(true), restoreAuthSession(true)])
  expect(fetch).toHaveBeenCalledTimes(1)
  await restoreAuthSession()
  expect(fetch).toHaveBeenCalledTimes(1)
  await restoreAuthSession(true)
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('does not resurrect a session from a refresh response after logout', async () => {
  let respond!: (r: Response) => void
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((r) => {
        respond = r
      }),
  )
  const pending = restoreAuthSession(true)
  clearAuthSession()
  respond(new Response(JSON.stringify({ accessToken: 'late-secret' })))
  expect(await pending).toBe(false)
  expect(getAuthSession()).toBeNull()
})
