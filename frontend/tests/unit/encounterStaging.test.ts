import { describe, expect, it } from 'vitest'
import { EYE_HEIGHT, STAGE, encounterDistance, encounterScale, placeInView, stageFrame } from '../../park-renewal-preview/encounterStaging'

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

  it('makes every creature larger than life and keeps it a few steps away', () => {
    for (let id = 1; id <= 12; id++) {
      expect(encounterScale(id)).toBeGreaterThanOrEqual(1.1)
      expect(encounterDistance(id)).toBeGreaterThanOrEqual(2)
      expect(encounterDistance(id)).toBeLessThanOrEqual(4)
    }
  })
})
