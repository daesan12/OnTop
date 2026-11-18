import { describe, expect, it } from 'vitest'
import { pickStyle, stagePlan, standDistance, styleFrame, stylesFor } from '../../park-renewal-preview/encounterStaging'
import { AMBUSHERS, InteriorVisit, POPPERS } from '../../park-renewal-preview/interiorEvents'

describe('ambush: a creature right behind you, and you are spun round into it', () => {
  const plan = stagePlan('ambush', 3600)

  it('is over in moments: turned round in a third of a second, on you just after', () => {
    expect(plan.show).toBe(0)
    expect(plan.rush).toBeLessThan(.4)
    expect(plan.dark).toBeLessThan(1)
    expect(standDistance(plan, 9, 0)).toBeLessThan(1.5)
  })

  it('holds you and drags you round from the first frame, and shows the creature itself', () => {
    for (const t of [0, .1, plan.rush, plan.dark - .05]) {
      const f = styleFrame(plan, 9, t, 1.3)
      expect(f.held).toBe(true)
      expect(f.drag).toBeGreaterThan(20)
      expect(f.visible).toBe(true)
    }
    const after = styleFrame(plan, 9, plan.dark + .1, 1.3)
    expect(after.held).toBe(false)
    expect(after.visible).toBe(false)
    expect(styleFrame(plan, 9, plan.dark - .05, 1.3).lunge).toBeGreaterThan(.8)
  })

  it('is never drawn for an ordinary encounter', () => {
    for (let id = 1; id <= 12; id++) {
      expect(stylesFor(id)).not.toContain('ambush')
      for (let r = 0; r < 1; r += .05) expect(pickStyle(id, undefined, () => r)).not.toBe('ambush')
    }
  })
})

describe('InteriorVisit.ambush', () => {
  it('sets the creature on you as the active scare, but not over another one unless forced', () => {
    const visit = new InteriorVisit(() => .5)
    expect(visit.ambush(9, 'ambush', [0, 7.6, -70], false, 1000)).toBe(true)
    expect(visit.active?.id).toBe(9)
    expect(visit.active?.plan.style).toBe('ambush')
    expect(visit.ambush(10, 'pop', [0, 7.6, -70], false, 1100)).toBe(false)
    expect(visit.active?.id).toBe(9)
    expect(visit.ambush(10, 'ambush', [0, 7.6, -70], true, 1200)).toBe(true)
    expect(visit.active?.id).toBe(10)
  })

  it('comes from the free-standing figures (and the leaning face, in front)', () => {
    expect([...AMBUSHERS]).toEqual([9, 10])
    expect(POPPERS).toEqual(expect.arrayContaining([...AMBUSHERS]))
  })
})
