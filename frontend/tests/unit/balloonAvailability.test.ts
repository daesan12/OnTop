import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

it.each([
  ['dev.on-top.world', 'park-integration', false, 'true', '0', true],
  ['dev.on-top.world', 'park-integration', false, 'false', '0', false],
  ['www.on-top.world', 'park-integration', false, 'true', '1', true],
  ['www.on-top.world', 'park-integration', false, 'false', '1', false],
  ['on-top.world', 'park-integration', false, 'true', '1', false],
  ['dev.on-top.world.example.com', 'park-integration', false, 'true', '1', false],
  ['localhost', 'park-renewal-integration', true, 'false', '1', true],
  ['127.0.0.1', 'park-renewal-integration', true, 'false', '0', false],
  ['localhost', 'park-renewal-integration', false, 'false', '1', false],
] as const)('limits balloon access on %s in %s (dev=%s, renewal=%s, local=%s)', async (
  hostname, mode, development, renewal, local, enabled,
) => {
  vi.stubGlobal('location', new URL('https://' + hostname + '/park'))
  vi.stubEnv('MODE', mode)
  vi.stubEnv('DEV', development)
  vi.stubEnv('VITE_PARK_RENEWAL_ENABLED', renewal)
  vi.stubEnv('VITE_LOCAL_BALLOON', local)
  const { BALLOON_RIDE_ENABLED } = await import('../../src/park/mapSelection')
  expect(BALLOON_RIDE_ENABLED).toBe(enabled)
})
