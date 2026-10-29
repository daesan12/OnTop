import { record } from '../../network/protocol'
import type { PurchaseAttempt } from './contracts'

// Only an unfinished operation, scoped to this tab/account. Never auth, balance or inventory.
const key = (owner: string) => `ontop.shop.pending.v1:${encodeURIComponent(owner)}`
export function readPendingPurchase(owner: string): PurchaseAttempt | null {
  try {
    const raw = sessionStorage.getItem(key(owner))
    if (!raw || raw.length > 4000) return null
    const value: unknown = JSON.parse(raw)
    if (!record(value) || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.key)
      || !Number.isSafeInteger(value.itemId) || Number(value.itemId) < 1 || !Number.isInteger(value.quantity)
      || Number(value.quantity) < 1 || Number(value.quantity) > 2147483647 || typeof value.name !== 'string'
      || !value.name.trim() || value.name.length > 600) return null
    return { key: value.key, itemId: Number(value.itemId), quantity: Number(value.quantity), name: value.name }
  } catch { return null }
}
export function keepPendingPurchase(owner: string, attempt: PurchaseAttempt | null) {
  try {
    if (attempt) sessionStorage.setItem(key(owner), JSON.stringify(attempt))
    else if (owner) sessionStorage.removeItem(key(owner))
  } catch { /* Storage restrictions retain the in-memory attempt for this visit. */ }
}
