import { describe, expect, it } from 'vitest'
import { distractionDefaults, sampleDistraction, sampleWalkFoot, type DistractionCue } from '../../src/jump-rope-preview/pigeonDistractionMotion'

const cue = (kind: DistractionCue['kind'], direction: DistractionCue['direction'] = 1): DistractionCue => ({
  kind, direction, startedAt: 1000, settings: distractionDefaults,
})

describe('pigeon distraction preview motion', () => {
  it('flies toward the lens and out again in either direction', () => {
    const flight = cue('flight')
    expect(sampleDistraction(flight, 999)).toBeNull()
    const entry = sampleDistraction(flight, 1000)
    const center = sampleDistraction(flight, 1390)
    const exit = sampleDistraction(flight, 1779)
    if (entry?.kind !== 'flight' || center?.kind !== 'flight' || exit?.kind !== 'flight') throw new Error('Expected a flight pose')
    expect(entry.cross).toBe(-1)
    expect(center.cross).toBe(0)
    expect(exit.cross).toBeGreaterThan(0.99)
    expect(center.depth).toBeLessThan(entry.depth)
    expect(center.depth).toBeLessThan(exit.depth)
    expect(sampleDistraction(cue('flight', -1), 1000)).toMatchObject({ cross: 1 })
    expect(sampleDistraction(flight, 1780)).toBeNull()
  })

  it('keeps the planted foot stationary in world space and lifts the other foot on swing', () => {
    const first = sampleWalkFoot(0.1)
    const second = sampleWalkFoot(0.4)
    expect(first.y).toBe(0)
    expect(second.y).toBe(0)
    expect(second.z + (0.4 - 0.1) * 0.84).toBeCloseTo(first.z, 10)
    expect(sampleWalkFoot(0.8).y).toBeGreaterThan(0.12)
    expect(sampleWalkFoot(1).z).toBeCloseTo(sampleWalkFoot(0.99999).z, 6)
  })

  it('keeps a full-opacity crossing in both directions and hides the expired actor', () => {
    const walk = cue('walk')
    expect(sampleDistraction(walk, 1000)).toMatchObject({ across: -2.2, opacity: 0 })
    expect(sampleDistraction(cue('walk', -1), 1000)).toMatchObject({ across: 2.2, opacity: 0 })
    expect(sampleDistraction(walk, 2350)).toMatchObject({ across: 0, opacity: 1, depth: 1.05 })
    expect(sampleDistraction(walk, 3700)).toBeNull()
    const replay = { ...walk, startedAt: 3800 }
    expect(sampleDistraction(replay, 3800)).toEqual(sampleDistraction(walk, 1000))
  })
})
