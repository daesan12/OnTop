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

it('treats the default 100% as 80% of the original turning rate', async () => {
  vi.stubGlobal('localStorage', storage())
  const module = await load()
  expect(module.useLookSensitivity.getState().sensitivity).toBe(100)
  expect(module.lookScale()).toBeCloseTo(0.8)
  module.setLookSensitivity(50)
  expect(module.lookScale()).toBeCloseTo(0.4)
  module.setLookSensitivity(200)
  expect(module.lookScale()).toBeCloseTo(1.6)
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
