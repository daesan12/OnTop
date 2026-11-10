import { expect, it } from 'vitest'
import { spendableBalance, walletBalance, walletSnapshot } from '../../src/features/wallet/balance'

it('accepts zero and the actual total balance while preserving the reservation contract', () => {
  expect(walletBalance({ balance: 0, reservedBalance: 0, availableBalance: 0 })).toBe(0)
  expect(walletBalance({ balance: 100, reservedBalance: 30, availableBalance: 70 })).toBe(100)
})
it('예약 직후 사용 가능 잔액을 표시하고 패배·승리·무효 정산 때 예약금을 이중 차감하지 않는다', () => {
  const snapshot = walletSnapshot({ balance: 100, reservedBalance: 30, availableBalance: 70 })
  expect(spendableBalance(snapshot)).toBe(70)
  expect(snapshot.balance).toBe(100)
  expect(spendableBalance({ balance: 70, reservedBalance: 0 })).toBe(70)
  expect(spendableBalance({ balance: 130, reservedBalance: 0 })).toBe(130)
  expect(spendableBalance({ balance: 100, reservedBalance: 0 })).toBe(100)
  expect(spendableBalance(null)).toBeNull()
  expect(spendableBalance({ balance: null })).toBeNull()
})
it.each([null, {}, { balance: 10 }, { balance: '100', reservedBalance: 0, availableBalance: 100 },
  { balance: 10, reservedBalance: 11, availableBalance: -1 }, { balance: 10, reservedBalance: 2, availableBalance: 10 },
  { balance: Number.MAX_SAFE_INTEGER + 1, reservedBalance: 0, availableBalance: Number.MAX_SAFE_INTEGER + 1 }])(
  'rejects an unknown or inconsistent balance instead of reporting zero: %j', value => expect(() => walletBalance(value)).toThrow(),
)
