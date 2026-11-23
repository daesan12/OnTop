/** The server uses zero for unlimited daily rewards; positive values describe older receipts. */
export const MINIGAME_DAILY_CAP = 0
export const validDailyBudget = (earned: unknown, cap: unknown): cap is number => Number.isSafeInteger(earned) && Number(earned) >= 0
  && Number.isSafeInteger(cap) && Number(cap) >= 0 && (cap === 0 || Number(earned) <= Number(cap))
export const dailyEarningsText = (earned: number | null | undefined, cap = MINIGAME_DAILY_CAP) =>
  cap > 0 ? `${earned ?? '—'} / ${cap}냥` : `${earned ?? '—'}냥 · 일일 제한 없음`
