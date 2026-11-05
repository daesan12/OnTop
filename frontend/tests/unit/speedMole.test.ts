import { describe, expect, it } from 'vitest'
import { speedMoleHole, SpeedMoleRound, SPEED_MOLE_CODES, SPEED_MOLE_KEYS, SPEED_MOLE_DURATION_MS, SPEED_MOLE_COUNTDOWN_MS } from '../../src/features/speedMole/game'

describe('separate speed mole local rules', () => {
  it('counts down 3, 2, 1 before allowing hits and grants the full 60 seconds afterwards', () => {
    const round = new SpeedMoleRound(100 + SPEED_MOLE_COUNTDOWN_MS, () => 0)
    for (const [at, count] of [[100, 3], [1099, 3], [1100, 2], [2100, 1], [3099, 1]]) {
      expect(round.phaseAt(at!)).toBe('countdown')
      expect(round.countdown(at!)).toBe(count)
      expect(round.strike(round.targets[0]!.hole, at!)).toEqual({ kind: 'ignored' })
      expect(round.remaining(at!)).toBe(60000)
    }
    expect(round.phaseAt(3100)).toBe('playing'); expect(round.countdown(3100)).toBe(0)
    expect(round.strike(round.targets[0]!.hole, 3100)).toMatchObject({ kind: 'hit', score: 1 })
    expect(round.remaining(3100)).toBe(60000)
    expect(round.phaseAt(63100)).toBe('result')
  })
  it('handles a background return past both countdown and game deadline without restarting either clock', () => {
    const round = new SpeedMoleRound(3000)
    expect(round.phaseAt(4000)).toBe('playing'); expect(round.remaining(4000)).toBe(59000)
    expect(round.phaseAt(100000)).toBe('result'); expect(round.remaining(100000)).toBe(0)
  })
  it('maps ERIO then DFKL to exactly eight physical keys', () => {
    expect(SPEED_MOLE_KEYS).toEqual(['E', 'R', 'I', 'O', 'D', 'F', 'K', 'L'])
    expect(new Set(SPEED_MOLE_CODES).size).toBe(8)
  })
  it('keeps four distinct moles waiting indefinitely until hit', () => {
    const round = new SpeedMoleRound(100, () => 0.5), initial = structuredClone(round.targets)
    expect(round.targets).toHaveLength(4)
    expect(new Set(round.targets.map(t => t.hole)).size).toBe(4)
    round.remaining(50000)
    expect(round.targets).toEqual(initial)
  })
  it('allows a hit immediately, including during the 100 ms visual pop', () => {
    const round = new SpeedMoleRound(100, () => 0)
    expect(round.strike(round.targets[0]!.hole, 100).kind).toBe('hit')
    expect(round.strike(round.targets[0]!.hole, 101).kind).toBe('hit')
    expect(round.score).toBe(2)
  })
  it('replaces only the hit target in a previously empty hole without replaying untouched animations', () => {
    const round = new SpeedMoleRound(0, () => 0), before = structuredClone(round.targets), hit = before[1]!
    round.strike(hit.hole, 10)
    expect(before.some(t => t.hole === round.targets[1]!.hole)).toBe(false)
    expect(round.targets.filter((_, index) => index !== 1)).toEqual(before.filter((_, index) => index !== 1))
    expect(round.targets[1]!.appearedAt).toBe(10)
  })
  it('maintains exactly four unique active targets through 500 rapid hits', () => {
    let n = 0
    const round = new SpeedMoleRound(0, () => (++n % 97) / 97)
    for (let at = 1; at <= 500; at++) {
      expect(round.strike(round.targets[at % 4]!.hole, at).kind).toBe('hit')
      expect(new Set(round.targets.map(t => t.hole)).size).toBe(4)
    }
    expect(round.score).toBe(500)
  })
  it('deducts three immediately, clamps every miss at zero, and never stuns or blocks the next hit', () => {
    const round = new SpeedMoleRound(0, () => 0)
    for (let at = 0; at < 5; at++) round.strike(round.targets[0]!.hole, at)
    const empty = SPEED_MOLE_KEYS.findIndex((_, hole) => !round.targets.some(t => t.hole === hole))
    expect(round.strike(empty, 5)).toMatchObject({ kind: 'miss', score: 2 })
    expect(round.strike(empty, 6)).toMatchObject({ kind: 'miss', score: 0 })
    expect(round.strike(empty, 7)).toMatchObject({ kind: 'miss', score: 0 })
    expect(round.strike(round.targets[0]!.hole, 7)).toMatchObject({ kind: 'hit', score: 1 })
    expect(round.misses).toBe(3)
  })
  it('uses an absolute 60 second deadline and rejects input at or after expiry', () => {
    const round = new SpeedMoleRound(1000, () => 0)
    expect(SPEED_MOLE_DURATION_MS).toBe(60000)
    expect(round.remaining(60500)).toBe(500)
    expect(round.strike(round.targets[0]!.hole, 61000)).toEqual({ kind: 'ignored' })
    expect(round.remaining(90000)).toBe(0)
    expect(round.score).toBe(0)
  })
  it('ignores invalid holes, stale times and input before start without mutating score or targets', () => {
    const round = new SpeedMoleRound(1000, () => 0), before = structuredClone(round.targets)
    for (const [hole, at] of [[-1, 1000], [8, 1000], [0.2, 1000], [0, 999], [0, NaN]])
      expect(round.strike(hole!, at!)).toEqual({ kind: 'ignored' })
    expect(round.targets).toEqual(before); expect(round.score).toBe(0)
  })
  it('does not share state between rounds', () => {
    const a = new SpeedMoleRound(0), b = new SpeedMoleRound(100)
    a.strike(a.targets[0]!.hole, 0)
    expect(b.score).toBe(0); expect(b.hits).toBe(0)
  })
  it('ignores native hold repeats but accepts a new F press even if keyup was lost', () => {
    expect(speedMoleHole('KeyF', false)).toBe(5)
    expect(speedMoleHole('KeyF', true)).toBeNull()
    expect(speedMoleHole('KeyF', false)).toBe(5)
    expect(speedMoleHole('KeyQ', false)).toBeNull()
    expect(speedMoleHole('KeyH', false)).toBeNull()
  })
  it.each(SPEED_MOLE_CODES)('maps %s to its own active hole and removes exactly that target', code => {
    const hole = speedMoleHole(code)!
    const round = new SpeedMoleRound(0, () => hole / 8)
    // Arrange a valid four-hole board with this physical key active.
    round.targets[0] = { id: 100, hole, appearedAt: 0 }
    round.targets.splice(1, 3, ...SPEED_MOLE_KEYS.map((_, h) => h).filter(h => h !== hole).slice(0, 3)
      .map((h, i) => ({ id: i + 101, hole: h, appearedAt: 0 })))
    expect(round.strike(hole, 1)).toMatchObject({ kind: 'hit', score: 1 })
    expect(round.targets.some(t => t.hole === hole)).toBe(false)
    expect(round.targets).toHaveLength(4)
  })
})
