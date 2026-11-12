import { describe, expect, it } from 'vitest'
import { approachAngle, headingToward, modelRole, smoothFactor } from '../../src/ai-lab/sceneMath'

describe('AI local scene presentation', () => {
  it('uses persona role rather than a hardcoded actor name', () => {
    expect(modelRole('POLICE', 'new-officer')).toBe('POLICE')
    expect(modelRole('GUIDE', 'police')).toBe('GUIDE')
    expect(modelRole(undefined, 'police')).toBe('POLICE')
  })
  it('rotates along the short arc at the wrap boundary', () => {
    const before = Math.PI - .05
    expect(approachAngle(before, -Math.PI + .05, .5)).toBeCloseTo(Math.PI)
    expect(headingToward(0, 0, 1.2)).toBe(1.2)
    expect(headingToward(1, 0, 0)).toBeCloseTo(Math.PI / 2)
  })
  it('uses elapsed time for equivalent 30 and 60 Hz smoothing and caps long pauses', () => {
    const thirty = (1 - smoothFactor(1 / 30)) ** 30
    const sixty = (1 - smoothFactor(1 / 60)) ** 60
    expect(thirty).toBeCloseTo(sixty, 8)
    expect(smoothFactor(10)).toBe(smoothFactor(.1))
    expect(smoothFactor(-1)).toBe(0)
  })
})
