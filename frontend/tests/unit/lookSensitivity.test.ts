import { afterEach, expect, it, vi } from 'vitest'

const key = 'ontap-look-sensitivity-v1'
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

it('keeps the value on a 0.1 step inside the allowed range', async () => {
  const { clampLookSensitivity } = await load()
  expect(clampLookSensitivity(0.74)).toBe(0.7)
  expect(clampLookSensitivity(0.75)).toBe(0.8)
  expect(clampLookSensitivity(0.05)).toBe(0.2)
  expect(clampLookSensitivity(9)).toBe(2)
  expect(clampLookSensitivity(Number.NaN)).toBe(1)
})

it('saves a change and restores it on the next visit', async () => {
  const saved = storage()
  vi.stubGlobal('localStorage', saved)
  const first = await load()
  expect(first.lookSensitivity()).toBe(1)
  first.setLookSensitivity(0.6)
  expect(first.lookSensitivity()).toBe(0.6)
  expect(saved.values.get(key)).toBe('0.6')

  const next = await load()
  expect(next.lookSensitivity()).toBe(0.6)
})

it('ignores a damaged saved value', async () => {
  vi.stubGlobal('localStorage', storage({ [key]: 'fast' }))
  expect((await load()).lookSensitivity()).toBe(1)
  vi.stubGlobal('localStorage', storage({ [key]: '7' }))
  expect((await load()).lookSensitivity()).toBe(2)
})

it('still applies for this session when storage is blocked', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  })
  const module = await load()
  expect(module.lookSensitivity()).toBe(1)
  module.setLookSensitivity(1.5)
  expect(module.lookSensitivity()).toBe(1.5)
})
