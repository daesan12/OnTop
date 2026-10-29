import { describe, expect, it } from 'vitest'
import { DIE_PIPS } from '../../src/game/farkle/DiceFace'
import { SCORE_GROUPS, selectedScoreRows } from '../../src/game/farkle/scorebook'
import { hourglassAngle, hourglassMotion, sandRemaining } from '../../src/game/farkle/hourglassMotion'

describe('the scorebook explains the existing optimal selection', () => {
  it('renders correct, distinct pip positions for each face', () => {
    for (let face = 1; face <= 6; face++) {
      expect(DIE_PIPS[face]).toHaveLength(face)
      expect(new Set(DIE_PIPS[face]).size).toBe(face)
      expect(DIE_PIPS[face]!.every(pip => pip >= 0 && pip <= 8)).toBe(true)
    }
    expect(DIE_PIPS[6]).toEqual([0, 2, 3, 5, 6, 8])
  })
  it('highlights the actual optimal groups rather than consuming the same die twice', () => {
    expect(selectedScoreRows([1, 1, 1, 5])).toEqual(['single-5', 'triple-1'])
    expect(selectedScoreRows([1, 1, 1, 1])).toEqual(['matching-4'])
    expect(selectedScoreRows([2, 3])).toEqual([])
    expect(selectedScoreRows([1, 2, 3, 4, 5, 6])).toEqual(['straight-1-6'])
    expect(selectedScoreRows([5, 5, 5])).toEqual(['triple-other'])
    expect(SCORE_GROUPS.flatMap(g => g.rows).find(row => row.id === 'matching-6')!.score).toBe('3개 점수 × 8')
  })
})
describe('hourglass follows confirmed turns without extending their deadline', () => {
  it('does not flip on load or a same-turn snapshot, but flips once per new turn', () => {
    const first = hourglassMotion(null, 'game', 7, 'a', 100)
    expect(first.flips).toBe(0)
    expect(hourglassMotion(first, 'game', 7, 'a', 500)).toBe(first)
    const second = hourglassMotion(first, 'game', 8, 'b', 600)
    expect(second.flips).toBe(1)
    expect(hourglassAngle(second, 600)).toBe(0)
    expect(hourglassAngle(second, 1025)).toBeCloseTo(Math.PI / 2)
    expect(hourglassAngle(second, 1450)).toBeCloseTo(Math.PI)
    expect(hourglassMotion(second, 'game', 8, 'b', 1700)).toBe(second)
    expect(hourglassMotion(second, 'game', 7, 'a', 1800)).toBe(second)
    expect(hourglassMotion(second, 'game', 9, 'a', 2000).flips).toBe(2)
    expect(hourglassMotion(second, 'new-game', 1, 'a', 2000).flips).toBe(0)
    const skipped = hourglassMotion(second, 'game', 10, 'b', 3000)
    expect(skipped.flips).toBe(3)
    expect(hourglassAngle(skipped, 5000)).toBeCloseTo(3 * Math.PI)
  })
  it('clamps sand at the original deadline and safely handles missing/invalid timing', () => {
    const deadline = '2026-10-28T00:00:30.000Z', start = Date.parse(deadline) - 30000
    expect(sandRemaining(deadline, 30000, start)).toBe(1)
    expect(sandRemaining(deadline, 30000, start + 15000)).toBe(.5)
    expect(sandRemaining(deadline, 30000, start + 30000)).toBe(0)
    expect(sandRemaining(deadline, 30000, start + 45000)).toBe(0)
    expect(sandRemaining(null, 30000, start)).toBe(0)
    expect(sandRemaining('bad', 0, start)).toBe(0)
  })
})
