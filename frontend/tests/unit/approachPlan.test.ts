import { describe, expect, it } from 'vitest'
import { approachPlan } from '../../park-renewal-preview/approachPlan'

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

describe('approachPlan (steps walking up behind you)', () => {
  for (const seed of [1, 7, 42, 999]) {
    const { steps, strikeAt, resume } = approachPlan(seeded(seed))
    const gaps = steps.slice(1).map((s, i) => s.t - steps[i]!.t)
    const walk = steps.filter(s => !s.burst), rush = steps.filter(s => s.burst)

    it(`starts far and slow, ends at your back (seed ${seed})`, () => {
      expect(steps[0]!.t).toBe(0)
      expect(steps[0]!.near).toBeLessThan(.1)
      expect(gaps[0]).toBeGreaterThan(1.2)
      expect(steps.at(-1)!.near).toBe(1)
      expect(strikeAt).toBeGreaterThan(steps.at(-1)!.t)
      expect(strikeAt).toBeGreaterThan(18)
      expect(strikeAt).toBeLessThan(27)
    })

    it(`gets louder and quicker all the way (seed ${seed})`, () => {
      for (let i = 1; i < steps.length; i++) expect(steps[i]!.near).toBeGreaterThan(steps[i - 1]!.near)
      const walkGaps = gaps.slice(0, walk.length - 1)
      for (let i = 1; i < walkGaps.length; i++) if (i !== resume - 1) expect(walkGaps[i]!).toBeLessThan(walkGaps[i - 1]!)
    })

    it(`stops once for a few seconds, then comes on again nearer (seed ${seed})`, () => {
      expect(gaps[resume - 1]!).toBeGreaterThan(2.4)
      expect(gaps.filter(g => g > 1.7)).toHaveLength(1)
      expect(steps[resume]!.near - steps[resume - 1]!.near).toBeGreaterThan(.05)
    })

    it(`runs on past you and away if you keep the rule (seed ${seed})`, () => {
      const { passBy } = approachPlan(seeded(seed))
      expect(passBy[0]!.t).toBeCloseTo(strikeAt)
      for (let i = 1; i < passBy.length; i++) {
        expect(passBy[i]!.near).toBeLessThan(passBy[i - 1]!.near)
        expect(passBy[i]!.t).toBeGreaterThan(passBy[i - 1]!.t)
      }
      expect(passBy.at(-1)!.near).toBeLessThan(.3)
    })

    it(`then breaks into a run, all at once (seed ${seed})`, () => {
      expect(rush.length).toBeGreaterThanOrEqual(30)
      expect(rush.at(-1)!.t - rush[0]!.t).toBeGreaterThan(2)
      for (const g of gaps.slice(walk.length)) expect(g).toBeLessThan(.12)
      // The jump into the run is sudden: the last walking gap is well over twice a running one.
      const lastWalk = gaps[walk.length - 2]!
      expect(lastWalk).toBeGreaterThan(.3)
      expect(gaps[walk.length - 1]!).toBeLessThan(.2)
    })
  }
})
