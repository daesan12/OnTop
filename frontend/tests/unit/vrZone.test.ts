import { describe, expect, it } from 'vitest'
import { canReachVrEntrance, vrEntrance } from '../../src/features/vrZone/anchors'

describe('VR hall entrance', () => {
  it('uses the rotated hall entrance and rejects distant, high or invalid positions', () => {
    const entrance = vrEntrance({ x: -74, z: -23 }, Math.PI / 2)
    expect(entrance.x).toBeCloseTo(-66.3)
    expect(entrance.z).toBeCloseTo(-23)
    expect(canReachVrEntrance(entrance, entrance)).toBe(true)
    expect(canReachVrEntrance({ ...entrance, x: -74 }, entrance)).toBe(false)
    expect(canReachVrEntrance({ ...entrance, y: 4 }, entrance)).toBe(false)
    expect(canReachVrEntrance({ ...entrance, x: NaN }, entrance)).toBe(false)
  })
})
