import type { LedgerCategory, LedgerCard } from './protocol'

/** Preview only; the server records the authoritative points. Mirrors DiceLedgerScoring.java. */
export function categoryScore(category: LedgerCategory, faces: readonly number[]): number {
  if (faces.length !== 5) return 0
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const face of faces) counts[face]!++
  const sum = faces.reduce((a, b) => a + b, 0)
  const upper = ['ONES', 'TWOS', 'THREES', 'FOURS', 'FIVES', 'SIXES'].indexOf(category)
  if (upper >= 0) return counts[upper + 1]! * (upper + 1)
  let run = 0, best = 0
  for (let face = 1; face <= 6; face++) { run = counts[face]! > 0 ? run + 1 : 0; best = Math.max(best, run) }
  switch (category) {
    case 'CHOICE': return sum
    case 'FOUR_OF_A_KIND': { const face = counts.findIndex(count => count >= 4); return face > 0 ? face * 4 : 0 }
    case 'FULL_HOUSE': return counts.includes(5) || (counts.includes(3) && counts.includes(2)) ? sum : 0
    case 'SMALL_STRAIGHT': return best >= 4 ? 15 : 0
    case 'LARGE_STRAIGHT': return best === 5 ? 30 : 0
    case 'FIVE_OF_A_KIND': return counts.includes(5) ? 50 : 0
    default: return 0
  }
}

/** Remaining upper points needed for the bonus; 0 once reached. */
export function bonusRemaining(card: LedgerCard, threshold: number) {
  return Math.max(0, threshold - card.upperSubtotal)
}
