import { describe, expect, it } from 'vitest'
import { PARK_DATA, PARK_LAYOUT } from '../../src/map/park'
import { vrEntrance } from '../../src/features/vrZone/anchors'

describe('skewer entrance on the current generated park', () => {
  it('places the walking and interaction area outside the latest hall and stone-table obstacles', () => {
    const entrance = vrEntrance(PARK_LAYOUT.SITES.vr, PARK_LAYOUT.VR_YAW)
    for (const offset of [-.8, 0, .8]) {
      const x = entrance.x + Math.cos(PARK_LAYOUT.VR_YAW) * offset
      const z = entrance.z - Math.sin(PARK_LAYOUT.VR_YAW) * offset
      expect(PARK_LAYOUT.canWalk(x, z), `entrance approach offset ${offset}`).toBe(true)
    }
    expect(PARK_DATA.tables.every(table => Math.hypot(table.position[0] - entrance.x,
      table.position[2] - entrance.z) > entrance.radius)).toBe(true)
  })
})
