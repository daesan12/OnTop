import { describe, expect, it } from 'vitest'
import { RAMP, rampEyeLayout } from '../../park-renewal-preview/rampEyesPlan'
import { InteriorVisit } from '../../park-renewal-preview/interiorEvents'

describe('the eyes along the climb to the gallery (S15P31B105-450)', () => {
  it('lines both inner walls of the ramp, facing in, from knee height to over your head', () => {
    const eyes = rampEyeLayout()
    expect(eyes.length).toBeGreaterThan(90)
    expect(eyes.length).toBeLessThan(200)
    for (const e of eyes) {
      expect(e.nx === 1 ? e.x - RAMP.x0 : RAMP.x1 - e.x).toBeLessThan(.05)
      expect(e.z).toBeLessThan(RAMP.z0)
      expect(e.z).toBeGreaterThan(RAMP.z1)
      expect(e.h).toBeGreaterThan(.3)
      expect(e.h).toBeLessThan(3.5)
    }
    expect(eyes.filter(e => e.nx === 1).length).toBeGreaterThan(40)
    expect(eyes.filter(e => e.nx === -1).length).toBeGreaterThan(40)
    expect(RAMP.top).toBeGreaterThan(RAMP.z1)
  })

  it('no longer draws the eyes as a scare that pops up', () => {
    for (let seed = 1; seed < 40; seed++) {
      let s = seed
      const visit = new InteriorVisit(() => (s = (s * 16807) % 2147483647) / 2147483647)
      visit.update('me:room', { x: 16, y: 7.6, z: -78 }, 0)
      expect(visit.selected).toHaveLength(4)
      expect(visit.selected).not.toContain(12)
    }
  })
})
