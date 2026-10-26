import { expect, it } from 'vitest'
import { walletBalance } from '../../src/features/wallet/balance'

it('accepts zero and the actual total balance while preserving the reservation contract', () => {
  expect(walletBalance({ balance: 0, reservedBalance: 0, availableBalance: 0 })).toBe(0)
  expect(walletBalance({ balance: 100, reservedBalance: 30, availableBalance: 70 })).toBe(100)
})
it.each([null, {}, { balance: 10 }, { balance: '100', reservedBalance: 0, availableBalance: 100 },
  { balance: 10, reservedBalance: 11, availableBalance: -1 }, { balance: 10, reservedBalance: 2, availableBalance: 10 },
  { balance: Number.MAX_SAFE_INTEGER + 1, reservedBalance: 0, availableBalance: Number.MAX_SAFE_INTEGER + 1 }])(
  'rejects an unknown or inconsistent balance instead of reporting zero: %j', value => expect(() => walletBalance(value)).toThrow(),
)
