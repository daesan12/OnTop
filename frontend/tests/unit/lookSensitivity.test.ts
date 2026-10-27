import { afterEach, expect, it, vi } from 'vitest'

const key = 'ontap-look-sensitivity-v2'
function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { values.set(name, value) }),
  }
}
async function load() {
  vi.resetModules()
  return import('../../src/world/lookSensitivity')
}
afterEach(() => { vi.unstubAllGlobals() })

it('keeps a whole percentage between 1% and 200%', async () => {
  const { clampLookSensitivity, lookSensitivityLabel } = await load()
  expect(clampLookSensitivity(72.4)).toBe(72)
  expect(clampLookSensitivity(7)).toBe(7)
  expect(clampLookSensitivity(0)).toBe(1)
  expect(clampLookSensitivity(999)).toBe(200)
  expect(clampLookSensitivity(Number.NaN)).toBe(100)
  expect(lookSensitivityLabel(100)).toBe('100%')
})

it('turns 100% into 80% of the original rate for every view', async () => {
  vi.stubGlobal('localStorage', storage())
  const module = await load()
  expect(module.useLookSensitivity.getState().sensitivity).toBe(100)
  expect(module.lookScale()).toBeCloseTo(0.8)
  module.setLookSensitivity(50)
  expect(module.lookScale()).toBeCloseTo(0.4)
  module.setLookSensitivity(200)
  expect(module.lookScale()).toBeCloseTo(1.6)
})

it('scales seated, bench and telescope turning by the same setting', async () => {
  vi.stubGlobal('localStorage', storage())
  const { setLookSensitivity } = await load()
  const lobby = await import('../../src/features/tableLobby/state')
  const bench = await import('../../src/features/interactions/benchSpectator')
  const telescope = await import('../../src/features/telescopeView')
  const turns = () => {
    lobby.resetSeatedLook(); lobby.turnSeatedLook('seat', 0); lobby.turnSeatedLook('seat', 50)
    bench.benchLook.yaw = 0; bench.turnBenchLook(50)
    telescope.telescopeView.zoom = 4
    return { seated: lobby.seatedLook.yaw, bench: bench.benchLook.yaw, telescope: telescope.telescopeTurnRate() }
  }
  const normal = turns()
  expect(normal.seated).toBeCloseTo(-50 * 0.004 * 0.8)
  expect(normal.bench).toBeCloseTo(-50 * 0.004 * 0.8)
  expect(normal.telescope).toBeCloseTo(0.003 / 2 * 0.8)
  setLookSensitivity(50)
  const half = turns()
  expect(half.seated).toBeCloseTo(normal.seated / 2)
  expect(half.bench).toBeCloseTo(normal.bench / 2)
  expect(half.telescope).toBeCloseTo(normal.telescope / 2)
})

it('saves a change and restores it on the next visit', async () => {
  const saved = storage()
  vi.stubGlobal('localStorage', saved)
  ;(await load()).setLookSensitivity(60)
  expect(saved.values.get(key)).toBe('60')
  expect((await load()).useLookSensitivity.getState().sensitivity).toBe(60)
})

it('ignores damaged values and the old multiplier key', async () => {
  vi.stubGlobal('localStorage', storage({ [key]: 'fast', 'ontap-look-sensitivity-v1': '0.5' }))
  expect((await load()).useLookSensitivity.getState().sensitivity).toBe(100)
  vi.stubGlobal('localStorage', storage({ [key]: '700' }))
  expect((await load()).useLookSensitivity.getState().sensitivity).toBe(200)
})

it('still applies for this session when storage is blocked', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  })
  const module = await load()
  expect(module.useLookSensitivity.getState().sensitivity).toBe(100)
  module.setLookSensitivity(150)
  expect(module.lookScale()).toBeCloseTo(1.2)
})
