import type { Farkle } from '../protocol'

/** Selection preview only. The existing Java engine validates and commits all scores. */
export function scoreSelection(faces: readonly number[]): number | null {
  if (!faces.length || faces.length > 6 || !faces.every(n => Number.isInteger(n) && n >= 1 && n <= 6)) return null
  const memo = new Map<number, number>([[0, 0]])
  const groupScore = (mask: number) => {
    const values = faces.filter((_, i) => mask & (1 << i)).sort((a, b) => a - b)
    const n = values.length, first = values[0]!
    if (n === 1) return first === 1 ? 100 : first === 5 ? 50 : 0
    if (n >= 3 && values.every(v => v === first)) return (first === 1 ? 1000 : first * 100) * 2 ** (n - 3)
    if (n >= 5 && values.every((v, i) => v === first + i)) return n === 6 ? 1500 : first === 1 ? 500 : 750
    return 0
  }
  const solve = (mask: number): number => {
    if (memo.has(mask)) return memo.get(mask)!
    let best = -1
    for (let subset = mask; subset; subset = (subset - 1) & mask) {
      if (!(subset & (mask & -mask))) continue
      const points = groupScore(subset)
      if (points) { const rest = solve(mask ^ subset); if (rest >= 0) best = Math.max(best, points + rest) }
    }
    memo.set(mask, best)
    return best
  }
  const points = solve((1 << faces.length) - 1)
  return points > 0 ? points : null
}
export function selectionScore(dice: Farkle['dice'], ids: readonly number[]) {
  if (!ids.length || ids.length > 6 || new Set(ids).size !== ids.length || !ids.every(Number.isInteger)) return null
  const selected = ids.map(id => dice.find(d => d.id === id && !d.held))
  return selected.every(d => !!d) ? scoreSelection(selected.map(d => d!.value)) : null
}
export function eligibleDice(dice: Farkle['dice']) {
  const loose = dice.filter(d => !d.held), eligible = new Set<number>()
  for (let mask = 1; mask < (1 << loose.length); mask++) {
    const selected = loose.filter((_, i) => mask & (1 << i))
    if (scoreSelection(selected.map(d => d.value))) selected.forEach(d => eligible.add(d.id))
  }
  return [...eligible]
}
export function validDiceAction(state: Farkle, kind: 'roll' | 'bank', selectedIds: readonly number[]) {
  if (!['roll', 'bank'].includes(kind)) return false
  return state.stage === 'AWAITING_ROLL' ? kind === 'roll' && selectedIds.length === 0
    : state.stage === 'SELECTING' && selectionScore(state.dice, selectedIds) !== null
}
