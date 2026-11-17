import { describe, expect, it } from 'vitest'
import { EYE_HEIGHT, STAGE, STAGE_STYLES, encounterDistance, encounterScale, pickStyle, placeInView, stageFrame, stagePlan, standDistance, styleFrame, stylesFor } from '../../park-renewal-preview/encounterStaging'

describe('underground encounter staging (S15P31B105-450)', () => {
  it('builds up in the dark, shows the creature, rushes, then cuts to black', () => {
    const build = stageFrame(9, STAGE.reveal / 2, 3.6)
    expect(build.visible).toBe(false)
    expect(build.light).toBeLessThan(1)
    const shown = stageFrame(9, (STAGE.reveal + STAGE.lunge) / 2, 3.6)
    expect(shown.visible).toBe(true)
    expect(shown.reveal).toBeGreaterThan(0)
    expect(shown.advance).toBe(0)
    const rush = stageFrame(9, STAGE.blackout - .001, 3.6)
    expect(rush.visible).toBe(true)
    expect(rush.advance).toBeGreaterThan(2.5)
    expect(stageFrame(9, .99, 3.6)).toMatchObject({ visible: false, light: 0 })
  })

  it('brings a tall face down to eye level and a low hanging one up', () => {
    for (const id of [2, 9, 10]) {
      const end = stageFrame(id, STAGE.blackout - .001, 3)
      expect(end.rise).toBeLessThan(0)
    }
    expect(stageFrame(3, STAGE.blackout - .001, 3).rise).toBeGreaterThan(0)
    expect(EYE_HEIGHT).toBe(1.5)
  })

  it('stands the creature in the line of sight, never behind a column', () => {
    const open = () => true
    expect(placeInView([0, 0], [0, -1], 3, open, [9, 9])).toEqual([0, -3])
    // A column 2 m ahead: it must stand in front of it, not behind.
    const column = (x: number, z: number) => !(Math.abs(x) < .8 && z < -2 && z > -3.6)
    const [x, z] = placeInView([0, 0], [0, -1], 3.4, column, [9, 9])
    expect(x).toBeCloseTo(0)
    expect(z).toBeGreaterThan(-2)
    // No room at all: back to the anchor.
    expect(placeInView([0, 0], [0, -1], 3, () => false, [9, 9])).toEqual([9, 9])
  })

  it('never plays the same kind of scare twice in a row, and keeps walls and faces out of the stalk', () => {
    const seen = new Set<string>()
    let last: ReturnType<typeof pickStyle> | undefined
    let seed = 1
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 400; i++) {
      const style = pickStyle(9, last, random)
      expect(style).not.toBe(last)
      seen.add(style); last = style
    }
    expect([...seen].sort()).toEqual([...STAGE_STYLES].sort())
    for (const id of [1, 4, 5, 6, 8, 11, 12]) expect(stylesFor(id)).toEqual(['pop', 'fakeout', 'reveal'])
  })

  it('pops with no warning at all', () => {
    const plan = stagePlan('pop', 3600)
    const first = styleFrame(plan, 9, .02, 1.75)
    expect(first.visible).toBe(true)
    expect(first.light).toBeGreaterThan(1)
    expect(first.held).toBe(true)
    expect(plan.duration).toBeLessThan(1500)
    expect(styleFrame(plan, 9, plan.dark + .1, 1.75)).toMatchObject({ visible: false, light: 0 })
  })

  it('fakes it: build-up, the light comes back, then the pop', () => {
    const plan = stagePlan('fakeout', 3600, () => .5)
    expect(styleFrame(plan, 2, plan.calm / 2, 1.75).visible).toBe(false)
    const calm = styleFrame(plan, 2, (plan.calm + plan.show) / 2, 1.75)
    expect(calm).toMatchObject({ visible: false, light: 1 })
    expect(styleFrame(plan, 2, plan.show + .02, 1.75).visible).toBe(true)
  })

  it('stalks closer at every blink of the lamps', () => {
    const plan = stagePlan('stalk', 3600, () => .5)
    const distances = [0, ...plan.jumps.map(j => j + .2)].map(t => standDistance(plan, 7, t))
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeLessThan(distances[i - 1]!)
    expect(distances[0]).toBeGreaterThan(8)
    const blink = styleFrame(plan, 7, plan.jumps[0]!, 9)
    expect(blink).toMatchObject({ visible: false, light: 0 })
  })

  it('breathes behind you, then turns you round to face it', () => {
    const plan = stagePlan('behind', 3600)
    const early = styleFrame(plan, 8, 1, 1.7)
    expect(early).toMatchObject({ behind: true, drag: 0, held: false })
    const turning = styleFrame(plan, 8, plan.rush - .3, 1.7)
    expect(turning.drag).toBeGreaterThan(10)
    expect(turning.held).toBe(true)
    expect(styleFrame(plan, 8, plan.rush + .1, 1.7).behind).toBe(false)
  })

  it('keeps the long look as it was', () => {
    const plan = stagePlan('reveal', 3600)
    expect(plan.duration).toBe(3600)
    expect(styleFrame(plan, 9, 3.6 * STAGE.reveal / 2, 3.6).visible).toBe(false)
    expect(styleFrame(plan, 9, 3.6 * (STAGE.reveal + STAGE.lunge) / 2, 3.6).visible).toBe(true)
  })

  it('makes every creature larger than life and keeps it a few steps away', () => {
    for (let id = 1; id <= 12; id++) {
      expect(encounterScale(id)).toBeGreaterThanOrEqual(1.1)
      expect(encounterDistance(id)).toBeGreaterThanOrEqual(2)
      expect(encounterDistance(id)).toBeLessThanOrEqual(4)
    }
  })
})
