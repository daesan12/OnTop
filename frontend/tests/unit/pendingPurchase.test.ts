import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keepPendingPurchase, readPendingPurchase } from '../../src/features/shop/pendingPurchase'
const attempt = { key: 'same-key', itemId: 1, quantity: 2, name: '검증 소비 아이템' }
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
})
afterEach(() => vi.unstubAllGlobals())
describe('unfinished purchase recovery', () => {
  it('recovers the exact operation for the same account, isolates another account and clears acknowledged operations', () => {
    keepPendingPurchase('101', attempt)
    expect(readPendingPurchase('101')).toEqual(attempt)
    expect(readPendingPurchase('102')).toBeNull()
    expect(JSON.stringify([...storage.values()])).not.toMatch(/Bearer|accessToken|balance/)
    keepPendingPurchase('101', null)
    expect(readPendingPurchase('101')).toBeNull()
  })
  it('rejects corrupt or modified operations instead of generating or silently substituting a new purchase', () => {
    for (const bad of ['not json', JSON.stringify({ ...attempt, quantity: -1 }), JSON.stringify({ ...attempt, itemId: '1' }), JSON.stringify({ ...attempt, key: 'bad key' })]) {
      storage.set('ontop.shop.pending.v1:101', bad)
      expect(readPendingPurchase('101')).toBeNull()
    }
  })
  it('does not crash purchases when browser storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('disabled') }, setItem: () => { throw new Error('disabled') }, removeItem: () => { throw new Error('disabled') } })
    expect(() => keepPendingPurchase('101', attempt)).not.toThrow()
    expect(readPendingPurchase('101')).toBeNull()
  })
})
