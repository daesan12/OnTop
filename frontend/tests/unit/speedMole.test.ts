import { describe, expect, it } from 'vitest'
import { SpeedMoleKeys, SpeedMoleRound, SPEED_MOLE_CODES, SPEED_MOLE_KEYS, SPEED_MOLE_DURATION_MS } from '../../src/features/speedMole/game'

describe('separate speed mole local rules', () => {
  it('maps TYUI then GHJK to exactly eight physical keys', () => {
    expect(SPEED_MOLE_KEYS).toEqual(['T', 'Y', 'U', 'I', 'G', 'H', 'J', 'K'])
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
  it('scores a physical key only once until keyup, and clears held keys on focus loss', () => {
    const keys = new SpeedMoleKeys()
    expect(keys.down('KeyT')).toBe(0)
    expect(keys.down('KeyT', true)).toBeNull(); expect(keys.down('KeyT')).toBeNull()
    keys.up('KeyT'); expect(keys.down('KeyT')).toBe(0)
    keys.clear(); expect(keys.down('KeyT')).toBe(0)
    expect(keys.down('KeyQ')).toBeNull()
  })
})
