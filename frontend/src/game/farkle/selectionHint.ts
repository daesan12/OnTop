import type { Farkle } from '../protocol'
import { selectionScore } from './scoring'

/** Explain the smallest completion using this roll only; never auto-select dice. */
export function selectionHint(dice: Farkle['dice'], ids: readonly number[]): string | null {
  if (!ids.length || selectionScore(dice, ids) !== null) return null
  const remaining = dice.filter(die => !die.held && !ids.includes(die.id))
  let best: Farkle['dice'] | null = null
  for (let mask = 1; mask < 1 << remaining.length; mask++) {
    const extra = remaining.filter((_, i) => mask & 1 << i)
    if ((!best || extra.length < best.length) && selectionScore(dice, [...ids, ...extra.map(die => die.id)]) !== null) best = extra
  }
  if (!best) return '선택을 일부 해제해 득점 조합을 만들어주세요.'
  const counts = new Map<number, number>()
  best.forEach(die => counts.set(die.value, (counts.get(die.value) ?? 0) + 1))
  if (counts.size === 1) {
    const [value, count] = [...counts][0]!
    return `눈이 ${value}인 주사위 ${count}개를 더 선택하세요.`
  }
  return `${[...counts].map(([value, count]) => `${value} 눈 ${count}개`).join(' · ')}를 더 선택하세요.`
}
