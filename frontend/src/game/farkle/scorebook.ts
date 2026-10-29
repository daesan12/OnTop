import { scoreSelection } from './scoring'

export type ScoreRow = { id: string; faces: readonly number[]; label: string; score: string; patterns?: readonly (readonly number[])[] }
const matching = (count: number, start = 1) => Array.from({ length: 7 - start }, (_, i) => Array<number>(count).fill(i + start))
/** Display copy follows docs/farkle.md; final scoring stays in the existing server engine. */
export const SCORE_GROUPS: readonly { title: string; rows: readonly ScoreRow[] }[] = [
  { title: '기본 득점', rows: [
    { id: 'single-1', faces: [1], label: '1 한 개', score: '100점' },
    { id: 'single-5', faces: [5], label: '5 한 개', score: '50점' },
  ] },
  { title: '같은 눈 3개', rows: [
    { id: 'triple-1', faces: [1, 1, 1], label: '', score: '1,000점' },
    { id: 'triple-other', faces: [3, 3, 3], label: '2~6 같은 눈', score: '눈 × 100점', patterns: matching(3, 2) },
  ] },
  { title: '같은 눈 4개 이상', rows: [4, 5, 6].map((count, i) => ({
    id: `matching-${count}`, faces: Array<number>(count).fill(3), label: `${count}개`,
    score: `3개 점수 × ${[2, 4, 8][i]}`, patterns: matching(count),
  })) },
  { title: '연속된 눈', rows: [
    { id: 'straight-1-5', faces: [1, 2, 3, 4, 5], label: '', score: '500점' },
    { id: 'straight-2-6', faces: [2, 3, 4, 5, 6], label: '', score: '750점' },
    { id: 'straight-1-6', faces: [1, 2, 3, 4, 5, 6], label: '', score: '1,500점' },
  ] },
]

/** Highlight only patterns that can participate in an optimal, non-overlapping selection. */
export function selectedScoreRows(faces: readonly number[]) {
  const total = scoreSelection(faces)
  if (total === null) return []
  return SCORE_GROUPS.flatMap(group => group.rows).filter(row => (row.patterns ?? [row.faces]).some(pattern => {
    const rest = [...faces]
    for (const value of pattern) {
      const index = rest.indexOf(value)
      if (index < 0) return false
      rest.splice(index, 1)
    }
    const remainder = rest.length ? scoreSelection(rest) : 0
    return remainder !== null && (scoreSelection(pattern) ?? 0) + remainder === total
  })).map(row => row.id)
}
