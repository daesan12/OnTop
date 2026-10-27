import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
async function enabled(mode: string, flag?: string) {
  vi.resetModules()
  vi.stubEnv('MODE', mode)
  vi.stubEnv('VITE_TABLET_LOBBY', flag)
  return (await import('../../src/features/tableLobby/tabletFeature')).TABLET_ENABLED
}
it.each(['development', 'production', 'frontend-test', 'tablet', 'test'])('%s enables seated tablets without an opt-in flag', async mode => {
  expect(await enabled(mode)).toBe(true)
})
it('treats an empty flag as the ordinary default', async () => {
  expect(await enabled('development', '')).toBe(true)
})
it.each(['development', 'production', 'tablet'])('%s retains an explicit AUTO compatibility opt-out', async mode => {
  expect(await enabled(mode, 'false')).toBe(false)
})
it.each(['facility-preview', 'bungeoppang-preview'])('%s preserves the isolated asset preview unless explicitly enabled', async mode => {
  expect(await enabled(mode)).toBe(false)
  expect(await enabled(mode, 'true')).toBe(true)
})
