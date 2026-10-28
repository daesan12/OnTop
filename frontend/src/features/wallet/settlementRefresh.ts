import { create } from 'zustand'
import { parseResult } from '../../game/protocol'
import type { Envelope } from '../../network/protocol'

/** Invalidates the authoritative GET; rewards are never added to a local balance. */
export const useWalletSettlement = create(() => ({ owner: '', revision: 0 }))
let owner = ''
const seen = new Set<string>()

export function refreshWalletAfterSettlement(userId: string, receipt: string) {
  if (!userId || !receipt) return
  if (owner !== userId) { owner = userId; seen.clear() }
  if (seen.has(receipt)) return
  seen.add(receipt)
  if (seen.size > 64) seen.delete(seen.values().next().value!)
  useWalletSettlement.setState(s => ({ owner: userId, revision: s.revision + 1 }))
}

/** Late own settlements still refresh the wallet after the table UI has closed. */
export function receiveWalletSettlement(message: Envelope, userId: string) {
  if (message.type !== 'GAME_RESULT' || message.payload.settlementStatus !== 'SETTLED') return
  try {
    const result = parseResult(message.payload, userId)
    refreshWalletAfterSettlement(userId, `board:${result.gameSessionId}:${result.version}`)
  } catch { /* Invalid/foreign receipts cannot invalidate this user's wallet. */ }
}
