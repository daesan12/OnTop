import { describe, expect, it } from 'vitest'
import { EYE_HEIGHT, SIDE, STAGE, STAGE_STYLES, lungeStop, strobe, encounterDistance, encounterScale, pickStyle, placeInView, stageFrame, stagePlan, standDistance, styleFrame, stylesFor } from '../../park-renewal-preview/encounterStaging'

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
    for (const id of [1, 8, 11, 12]) expect(stylesFor(id)).toEqual(['pop', 'fakeout', 'reveal'])
  })

  it('gives the statue, the beast, the shadow and the runner a scare of their own', () => {
    expect(stylesFor(2)).toEqual(['statue'])
    expect(stylesFor(4)).toEqual(['pounce'])
    expect(stylesFor(5)).toEqual(['grab'])
    expect(stylesFor(6)).toEqual(['shadow'])
    expect(stylesFor(7)).toContain('sprint')
    // A creature with one way to happen still gets it after another creature used it.
    expect(pickStyle(4, 'pounce')).toBe('pounce')
  })

  it('never freezes you before it strikes: the hold and the scare land together', () => {
    for (const style of ['stalk', 'statue', 'reveal', 'pounce', 'sprint', 'fakeout'] as const) {
      const plan = stagePlan(style, 3600, () => .5)
      const strike = style === 'fakeout' ? plan.show : plan.rush
      expect(styleFrame(plan, 9, Math.max(0, strike - .05), 3).held).toBe(false)
      expect(styleFrame(plan, 9, strike + .02, 3).held).toBe(true)
    }
  })

  it('shadow: what stands behind you, on the wall ahead; it turns you round to face it', () => {
    const plan = stagePlan('shadow', 3600)
    const early = styleFrame(plan, 6, 1, 2.6)
    expect(early).toMatchObject({ visible: true, held: false, drag: 0 })
    expect(styleFrame(plan, 6, plan.rush - .3, 2.6)).toMatchObject({ held: true, drag: 18 })
    // At the strike the shadow is gone (a face fills the screen instead) and the lights are out.
    expect(styleFrame(plan, 6, plan.rush + .05, 2.6)).toMatchObject({ visible: false, light: 0 })
  })

  it('pounce: out of sight to one side, then a leap that ends at your face', () => {
    const plan = stagePlan('pounce', 3600)
    expect(SIDE.pounce).toBeGreaterThan(1)
    expect(styleFrame(plan, 4, .2, 3).drag).toBe(0)
    expect(standDistance(plan, 4, 0)).toBeGreaterThan(2.5)
    const crouch = styleFrame(plan, 4, plan.rush / 2, 3)
    expect(crouch).toMatchObject({ visible: true, advance: 0 })
    expect(crouch.rise).toBeLessThan(0)
    const mid = styleFrame(plan, 4, (plan.rush + plan.dark) / 2, 3)
    expect(mid.rise).toBeGreaterThan(0)
    // It stops with its jaws (a metre ahead of its feet) at your face, not its body through the camera.
    expect(styleFrame(plan, 4, plan.dark - .001, 3).advance).toBeCloseTo(3 - lungeStop(4), 1)
    expect(lungeStop(4)).toBeGreaterThan(1.5)
  })

  it('sprint: only ever seen in the strobe, closer at every flash, in the dark between', () => {
    const plan = stagePlan('sprint', 3600)
    const flashes = [.1, .4, .7, 1, 1.3].map(t => styleFrame(plan, 7, t, 11))
    for (const f of flashes) expect(f).toMatchObject({ visible: true })
    for (let i = 1; i < flashes.length; i++) expect(flashes[i]!.advance).toBeGreaterThan(flashes[i - 1]!.advance)
    expect(styleFrame(plan, 7, .3, 11)).toMatchObject({ visible: false })
    expect(styleFrame(plan, 7, .3, 11).light).toBeLessThan(.1)
    expect(strobe(.1)).toBe(true)
  })

  it('grab: an arm out of the wall beside you; you are turned to it just before it reaches you', () => {
    const plan = stagePlan('grab', 3600)
    expect(styleFrame(plan, 5, .3, 1.6)).toMatchObject({ visible: true, drag: 0, held: false, advance: 0 })
    expect(styleFrame(plan, 5, plan.rush - .1, 1.6).drag).toBeGreaterThan(10)
    expect(styleFrame(plan, 5, plan.rush + .1, 1.6).held).toBe(true)
  })

  it('sprint: from the far end of the hall at a steady run', () => {
    const plan = stagePlan('sprint', 3600)
    expect(standDistance(plan, 7, 0)).toBeGreaterThan(10)
    const a = styleFrame(plan, 7, plan.rush + (plan.dark - plan.rush) * .25, 12)
    const b = styleFrame(plan, 7, plan.rush + (plan.dark - plan.rush) * .5, 12)
    expect(b.advance / a.advance).toBeCloseTo(2, 1)
  })

  it('statue: closer at each blink and each look away, its face coming down to eye level', () => {
    const plan = stagePlan('statue', 3600, () => .5)
    expect(standDistance(plan, 2, 0, 6.5, 1)).toBeLessThan(standDistance(plan, 2, 0, 6.5, 0))
    expect(standDistance(plan, 2, plan.jumps[0]! + .2, 6.5)).toBeLessThan(standDistance(plan, 2, 0, 6.5))
    expect(styleFrame(plan, 2, plan.jumps[0]!, 6.5).visible).toBe(false)
    const early = styleFrame(plan, 2, .5, 6.5).rise, late = styleFrame(plan, 2, plan.jumps[2]! + .2, 6.5).rise
    expect(late).toBeLessThan(early)
    expect(styleFrame(plan, 2, .5, 6.5).drag).toBe(0)
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
