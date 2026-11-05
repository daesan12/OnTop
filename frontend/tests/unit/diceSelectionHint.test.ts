import { describe, expect, it } from 'vitest'
import { selectionHint } from '../../src/game/farkle/selectionHint'
import { scoreSelection } from '../../src/game/farkle/scoring'
const dice = (values: number[]) => values.map((value, id) => ({ id, value, held: false }))

describe('incomplete Farkle selection guidance', () => {
  it('explains a partial triple and clears the hint after completing it', () => {
    const roll = dice([2, 2, 2, 3, 4, 5])
    expect(selectionHint(roll, [0])).toBe('눈이 2인 주사위 2개를 더 선택하세요.')
    expect(selectionHint(roll, [0, 1])).toBe('눈이 2인 주사위 1개를 더 선택하세요.')
    expect(selectionHint(roll, [0, 1, 2])).toBeNull()
    expect(selectionHint(roll, [])).toBeNull()
  })
  it('can complete a straight and never proposes a held die', () => {
    const roll = dice([1, 2, 3, 4, 5, 6])
    expect(selectionHint(roll, [1, 2, 3, 4])).toBe('눈이 1인 주사위 1개를 더 선택하세요.')
    roll[0]!.held = true; roll[5]!.held = true
    expect(selectionHint(roll, [1, 2, 3, 4])).toBe('선택을 일부 해제해 득점 조합을 만들어주세요.')
    expect(scoreSelection([2, 3, 4, 5])).toBeNull()
  })
})
