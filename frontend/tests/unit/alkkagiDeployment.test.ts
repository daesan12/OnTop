import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('explicitly enabled production bundles expose the same two-player alkkagi contract', async () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_ALKKAGI_ENABLED', 'true')
  vi.resetModules()
  const model = await import('../../src/features/tableLobby/model')
  expect(model.TABLE_GAMES.find(game => game.code === 'ALKKAGI')).toMatchObject({ capacity: 2, playable: true })
  expect(model.gameSelection('ALKKAGI', 5)).toEqual({ gameCode: 'ALKKAGI', betAmountPerPlayer: 5 })
  expect(model.TABLE_GAMES.some(game => game.code === 'HALLI_GALLI')).toBe(true)
})

it.each(['', 'false'])('keeps alkkagi hidden and rejects selection when the flag is %j', async flag => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_ALKKAGI_ENABLED', flag)
  vi.resetModules()
  const model = await import('../../src/features/tableLobby/model')
  expect(model.TABLE_GAMES.some(game => game.code === 'ALKKAGI')).toBe(false)
  expect(() => model.gameSelection('ALKKAGI', 5)).toThrow()
})
