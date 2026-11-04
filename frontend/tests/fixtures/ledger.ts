import { LEDGER_CATEGORIES, type DiceLedger, type LedgerCard, type LedgerCategory, type LedgerDie } from '../../src/game/ledger/protocol'
/** Explicit public contract data for tests, never a local rules/RNG engine. */
export const ledgerDice = (faces: number[], held: number[] = []): LedgerDie[] => faces.map((value, id) => ({ id, value, held: held.includes(id) }))
export function ledgerCard(userId: string, scores: Partial<Record<LedgerCategory, number>> = {}): LedgerCard {
  const filled = Object.fromEntries(LEDGER_CATEGORIES.map(c => [c, scores[c] ?? null])) as LedgerCard['scores']
  const upperSubtotal = LEDGER_CATEGORIES.slice(0, 6).reduce((sum, c) => sum + (filled[c] ?? 0), 0)
  const upperBonus = upperSubtotal >= 63 ? 35 : 0
  return { userId, forfeited: false, scores: filled, upperSubtotal, upperBonus,
    total: Object.values(filled).reduce<number>((sum, v) => sum + (v ?? 0), 0) + upperBonus }
}
export function ledgerState(count: 2 | 3 | 4 = 2): DiceLedger & { categories: string[] } {
  return { gameCode: 'DICE_LEDGER', status: 'PLAYING', turnTimeLimitMs: 20000, maxRolls: 3, upperBonusThreshold: 63, upperBonus: 35,
    turnUserId: '101', turnId: 1, round: 1, rollCount: 0, rollId: 0, lastEvent: 'START',
    turnDeadline: new Date(Date.now() + 20000).toISOString(), categories: [...LEDGER_CATEGORIES],
    players: Array.from({ length: count }, (_, i) => ledgerCard(String(101 + i))), dice: [], lastScored: null,
    winnerUserIds: [], endReason: null, endedAt: null }
}
