import { FORTUNE_GAMES, parseFortuneNickname } from './model'

export const FORTUNE_COOLDOWN_MS = 3 * 60 * 60 * 1000
export const fortuneReceiptKey = (owner: string) => `ontop:fortune:reading:v1:${encodeURIComponent(owner)}`
export type FortuneReceipt = { version: 1; nickname: string; gameId: string; selectedIndex: number; issuedAt: number; nextAllowedAt: number }

/** Local prototype persistence only. Production eligibility must be checked by the authenticated server. */
export function readFortuneReceipt(owner: string): FortuneReceipt | null {
  if (!owner) return null
  const raw = globalThis.localStorage.getItem(fortuneReceiptKey(owner))
  if (!raw) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value !== 'object') return null
  const r = value as Partial<FortuneReceipt>
  if (r.version !== 1 || typeof r.nickname !== 'string' || !parseFortuneNickname(r.nickname)
    || !FORTUNE_GAMES.some(game => game.id === r.gameId) || !Number.isInteger(r.selectedIndex)
    || r.selectedIndex! < 0 || r.selectedIndex! > 2 || !Number.isSafeInteger(r.issuedAt) || r.issuedAt! <= 0
    || r.nextAllowedAt !== r.issuedAt! + FORTUNE_COOLDOWN_MS || !Number.isSafeInteger(r.nextAllowedAt)
    || !Number.isFinite(new Date(r.nextAllowedAt!).getTime())) return null
  return r as FortuneReceipt
}
export function saveFortuneReceipt(owner: string, receipt: FortuneReceipt) {
  if (!owner) throw new Error('운세를 이용할 계정을 확인해주세요.')
  globalThis.localStorage.setItem(fortuneReceiptKey(owner), JSON.stringify(receipt))
}
export const fortuneWaitLabel = (remaining: number) => {
  const seconds = Math.max(0, Math.ceil(remaining / 1000))
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
