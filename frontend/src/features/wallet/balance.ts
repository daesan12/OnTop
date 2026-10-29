/** Existing GET /api/v1/wallets/me contract. Unknown/invalid is never a zero balance. */
export function walletBalance(value: unknown): number {
  if (!value || typeof value !== 'object') throw new Error('잔액 응답을 확인하지 못했어요.')
  const p = value as Record<string, unknown>
  for (const key of ['balance', 'reservedBalance', 'availableBalance']) {
    if (!Number.isSafeInteger(p[key]) || (p[key] as number) < 0) throw new Error('잔액 응답을 확인하지 못했어요.')
  }
  if ((p.balance as number) - (p.reservedBalance as number) !== p.availableBalance) throw new Error('잔액 응답을 확인하지 못했어요.')
  return p.balance as number
}
