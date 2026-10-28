/** Cosmetic receipt ledger only. This never reads or modifies a wallet balance. */
export class RewardFlightLedger {
  private owner = ''
  private seen = new Set<string>()
  constructor(private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => sessionStorage) {}
  claim(owner: string, receipt: string, amount: number) {
    if (!owner || !receipt || receipt.length > 200 || !Number.isSafeInteger(amount) || amount <= 0) return false
    const key = `ontop.reward-flight.v1:${owner}`
    if (owner !== this.owner) {
      this.owner = owner; this.seen.clear()
      try {
        const saved: unknown = JSON.parse(this.storage().getItem(key) ?? '[]')
        if (Array.isArray(saved)) for (const item of saved.slice(-64))
          if (typeof item === 'string' && item.length <= 200) this.seen.add(item)
      } catch { /* Storage may be unavailable; in-memory deduplication still works. */ }
    }
    if (this.seen.has(receipt)) return false
    this.seen.add(receipt)
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!)
    try { this.storage().setItem(key, JSON.stringify([...this.seen])) } catch { /* Decorative state is optional. */ }
    return true
  }
}
export interface CoinPoint { x: number; y: number }
/** A bounded, staggered burst followed by a curved flight into the actual wallet icon. */
export function rewardCoinPose(from: CoinPoint, to: CoinPoint, elapsed: number, index: number) {
  const t = Math.max(0, Math.min(1, (elapsed - index * 45) / 1050))
  const burst = Math.min(1, t / .18), travel = Math.max(0, (t - .18) / .82)
  const ease = travel * travel * (3 - 2 * travel), angle = index * 2.4
  const start = { x: from.x + Math.cos(angle) * 30 * burst, y: from.y - (20 + Math.sin(angle) * 18) * burst }
  const control = { x: (from.x + to.x) / 2 + (index - 3) * 10, y: Math.max(20, Math.min(from.y - 140, to.y + 30)) }
  return {
    x: (1 - ease) ** 2 * start.x + 2 * (1 - ease) * ease * control.x + ease ** 2 * to.x,
    y: (1 - ease) ** 2 * start.y + 2 * (1 - ease) * ease * control.y + ease ** 2 * to.y,
    scale: (.65 + .45 * burst) * (1 - .65 * ease), rotation: index * 39 + t * 540,
    opacity: elapsed < index * 45 || t === 1 ? 0 : Math.min(1, burst * 4),
  }
}
