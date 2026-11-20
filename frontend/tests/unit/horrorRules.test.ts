import { describe, expect, it } from 'vitest'
import { LOOK_BACK, LOOK_SIDE, MOVED, NOTE, RULES, RULE_OF, RuleRecord, Stillness, TRAP_NOTE, TRAP_NOTE_AT, pickHappening, turnedBy, type Happening } from '../../park-renewal-preview/horrorRules'
import { upperRoom } from '../../park-renewal-preview/interiorAccess'

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const dir = (a: number) => [Math.sin(a), Math.cos(a)] as const

describe('horrorRules (the note at the way in)', () => {
  it('has five rules in Korean, each happening tests its own', () => {
    expect(RULES).toHaveLength(5)
    for (const r of [...RULES, NOTE.title, NOTE.lead, ...TRAP_NOTE.lines]) expect(r).toMatch(/[가-힣]/)
    expect(Object.values(RULE_OF).sort()).toEqual([1, 2, 3, 4])
  })

  it('the lying notice lies on the floor of the upper room', () => {
    const [x, y, z] = TRAP_NOTE_AT
    expect(x).toBeGreaterThan(upperRoom.x0); expect(x).toBeLessThan(upperRoom.x1)
    expect(z).toBeGreaterThan(upperRoom.z0); expect(z).toBeLessThan(upperRoom.z1)
    expect(y).toBe(upperRoom.floor)
  })

  it('measures turns, positive to the right (as a positive pan)', () => {
    // Looking down -z, the right is +x (pan = dx * -f.z + dz * f.x).
    const ahead = [0, -1] as const, right = [1, 0] as const
    expect(turnedBy(ahead, right)).toBeCloseTo(Math.PI / 2)
    expect(turnedBy(ahead, [-1, 0])).toBeCloseTo(-Math.PI / 2)
    expect(Math.abs(turnedBy(ahead, [0, 1]))).toBeCloseTo(Math.PI)
    for (const a of [0, 1, -2, 3]) expect(turnedBy(dir(a), dir(a))).toBeCloseTo(0)
    // Looking back is past a right angle; a glance aside is not.
    expect(LOOK_BACK).toBeGreaterThan(Math.PI / 2)
    expect(LOOK_SIDE).toBeLessThan(Math.PI / 2)
  })

  it('counts walking, not standing or shuffling', () => {
    const s = new Stillness()
    s.start(0, 0)
    for (let i = 0; i < 60; i++) expect(s.update(Math.sin(i) * .002, 0)).toBe(false)
    s.start(0, 0)
    let moved = false
    for (let i = 1; i <= 20 && !moved; i++) moved = s.update(i * .05, 0)
    expect(moved).toBe(true)
    expect(s.moved).toBeGreaterThan(MOVED)
  })

  it('meets every rule early on, and never one still resting', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const random = seeded(seed), seen = new Set<Happening>()
      for (let i = 0; i < 10; i++) seen.add(pickHappening(seen, () => false, random))
      for (const h of Object.keys(RULE_OF) as Happening[]) expect(seen.has(h)).toBe(true)
    }
    const random = seeded(9)
    for (let i = 0; i < 200; i++) expect(pickHappening(new Set(), h => h === 'approach' || h === 'redLight', random)).not.toMatch(/approach|redLight/)
  })

  it('keeps the record and says what it means at the way out', () => {
    const r = new RuleRecord()
    expect(r.summary()[1]).toContain('시험하지')
    r.keep(1); r.keep(3)
    expect(r.summary()).toEqual(['지킨 규칙 2번 · 어긴 규칙 0번', '모든 규칙을 지켰어요. 그것들이 당신을 기억할 거예요.'])
    r.break(1); r.break(5); r.break(2)
    expect(r.summary()[0]).toBe('지킨 규칙 2번 · 어긴 규칙 3번')
    expect(r.summary()).toContain('다른 쪽지를 믿었군요.')
    expect(r.summary().at(-1)).toContain('혼자 나온')
    r.reset()
    expect(r.keptCount + r.brokenCount).toBe(0)
  })
})
