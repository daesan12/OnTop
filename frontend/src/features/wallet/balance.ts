/** Existing GET /api/v1/wallets/me contract. Unknown/invalid is never a zero balance. */
export function walletSnapshot(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('잔액 응답을 확인하지 못했어요.')
  const p = value as Record<string, unknown>
  for (const key of ['balance', 'reservedBalance', 'availableBalance']) {
    if (!Number.isSafeInteger(p[key]) || (p[key] as number) < 0) throw new Error('잔액 응답을 확인하지 못했어요.')
  }
  if ((p.balance as number) - (p.reservedBalance as number) !== p.availableBalance) throw new Error('잔액 응답을 확인하지 못했어요.')
  return { balance: p.balance as number, reservedBalance: p.reservedBalance as number, availableBalance: p.availableBalance as number }
}

export const walletBalance = (value: unknown): number => walletSnapshot(value).balance

/** 총액은 정산·획득음에 보존하고, HUD는 서버가 예약한 판돈을 제외한다. */
export const spendableBalance = (account: { balance: number | null; reservedBalance?: number } | null) =>
  account?.balance == null ? null : account.balance - (account.reservedBalance ?? 0)
