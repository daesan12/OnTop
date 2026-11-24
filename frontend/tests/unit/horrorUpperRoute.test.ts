import { describe, expect, it } from 'vitest'
import { catwalkVolumes, exitStair, interiorAccess, upperRoom, upperStair } from '../../park-renewal-preview/interiorAccess'
import { HORROR, HORROR_PORTALS, HORROR_SOLIDS, HORROR_UPPER_ARROWS } from '../../park-renewal-preview/horrorPlan'
import { HORROR_PENDANTS } from '../../park-renewal-preview/horrorGeometry'

const decks = catwalkVolumes.filter(v => v.material === 'stone')
  .map(v => ({ x0: v.center[0] - v.size[0] / 2, x1: v.center[0] + v.size[0] / 2, z0: v.center[2] - v.size[2] / 2, z1: v.center[2] + v.size[2] / 2, y: v.center[1] + .15 }))
const solid = (id: string) => HORROR_SOLIDS.find(s => s.id === id)!
const G = HORROR_PORTALS[1].floor

describe('the way up and out (S15P31B105-450)', () => {
  it('shuts the exit off from the landing: bars across the way, walls round its corner', () => {
    const bars = solid('exit-bars'), east = solid('exit-alcove-east'), south = solid('exit-alcove-south')
    const [ex, , ez] = interiorAccess.exit.from
    // You come up the ramp north of the bars; the exit door is south of them, inside the walls.
    expect(bars.z1).toBeLessThan(-84.4)
    expect(ez).toBeLessThan(bars.z0)
    expect(ex).toBeLessThan(east.x0)
    expect(ez).toBeGreaterThan(south.z1)
    for (const s of [bars, east]) expect(HORROR.floor + s.height).toBeGreaterThan(G + 2.5) // too high to jump
  })

  it('leaves the exit stair from the top room only, and lands it beside the exit door', () => {
    expect(exitStair.y1).toBe(upperRoom.floor)
    expect(exitStair.z1).toBe(upperRoom.z1)
    expect(exitStair.y0).toBe(G)
    expect(exitStair.z0).toBeGreaterThan(interiorAccess.exit.from[2])
    expect(exitStair.x + exitStair.width / 2).toBeLessThan(solid('exit-alcove-east').x0)
  })

  it('runs the third floor from the east stair over the bridge into the top room', () => {
    // The stair's top meets the landing at the head of the bridge; the narrow way ends at the room's door.
    expect(decks.some(d => d.y === upperStair.y1 && upperStair.z1 >= d.z0 - .01 && upperStair.z1 <= d.z1 + .01 && upperStair.x > d.x0 && upperStair.x < d.x1)).toBe(true)
    expect(decks.some(d => Math.abs(d.x0 - upperRoom.x1) < .01 && d.z0 <= upperRoom.z0 + .01 && d.z1 >= upperRoom.z1 - .01)).toBe(true)
    for (const d of decks) expect(d.y).toBe(upperRoom.floor)
  })

  it('keeps the bridge clear of the hanging lamps and the lift cage', () => {
    for (const d of decks) {
      for (const [x, z] of HORROR_PENDANTS) expect(x > d.x0 - 1 && x < d.x1 + 1 && z > d.z0 - 1 && z < d.z1 + 1, `pendant ${x},${z}`).toBe(false)
      const cage = solid('lift-cage')
      if (HORROR.floor + cage.height > d.y - 2) expect(cage.x1 < d.x0 || cage.x0 > d.x1 || cage.z1 < d.z0 || cage.z0 > d.z1).toBe(true)
    }
  })

  it('chalks the way: every arrow up there lies on a deck, a stair or the landing', () => {
    expect(HORROR_UPPER_ARROWS.length).toBeGreaterThan(6)
    for (const a of HORROR_UPPER_ARROWS) {
      const onDeck = decks.some(d => a.x > d.x0 && a.x < d.x1 && a.z > d.z0 && a.z < d.z1 && a.y === d.y)
      const inRoom = a.x > upperRoom.x0 && a.x < upperRoom.x1 && a.z > upperRoom.z0 && a.z < upperRoom.z1 && a.y === upperRoom.floor
      expect(onDeck || inRoom || a.y === G, `${a.x},${a.z}`).toBe(true)
    }
  })
})
