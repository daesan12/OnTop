import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FACES, SCREAMERS, SCREAMER_SPOTS, ScreamerPlan, nextScreamer } from '../../park-renewal-preview/horrorScreamer'
import { STRIKE_FLAVORS, nextFlavor } from '../../park-renewal-preview/horrorAudio'
import { horrorWalkable } from '../../park-renewal-preview/horrorPlan'

const dir = fileURLToPath(new URL('../../park-renewal-preview/screamers/', import.meta.url))
const always = () => 0

describe('underground screamers (S15P31B105-450)', () => {
  it('ships small WebP pictures, all of them used and credited', () => {
    const files = readdirSync(dir).filter(f => f.endsWith('.webp')).sort()
    expect(files).toEqual(Object.values(SCREAMERS).map(u => u.split('/').pop()!.split('?')[0]).sort())
    const readme = readFileSync(dir + 'README.md', 'utf8')
    for (const f of files) {
      expect(readFileSync(dir + f).subarray(8, 12).toString('latin1')).toBe('WEBP')
      expect(statSync(dir + f).size).toBeLessThan(120_000)
      expect(readme).toContain(f)
    }
  })

  it('puts the hall spots where people walk', () => {
    for (const [x, y, z] of SCREAMER_SPOTS) if (y < 7) expect(horrorWalkable(x, z, .3)).toBe(true)
  })

  it('fires once per spot, never twice the same picture, at most two a visit', () => {
    const plan = new ScreamerPlan(always)
    const seen: string[] = []
    let now = 0
    for (const [x, y, z] of SCREAMER_SPOTS) {
      now += 20
      const a = plan.update({ x, y, z }, now, false)
      const again = plan.update({ x, y, z }, now + 10, false)
      expect(again).toBeUndefined()
      if (a) seen.push(a)
    }
    expect(seen.length).toBe(2)
    expect(new Set(seen).size).toBe(2)
  })

  it('keeps quiet during and just after a 3D scare', () => {
    const plan = new ScreamerPlan(always)
    const [x, y, z] = SCREAMER_SPOTS[0]!
    expect(plan.update({ x, y, z }, 10, true)).toBeUndefined()
    expect(plan.update({ x, y, z }, 12, false)).toBeUndefined()
    expect(plan.update({ x, y, z }, 16, false)).toBeDefined()
  })

  it('picks the least recently seen picture, and only faces at the lens when a face is wanted', () => {
    expect(FACES).not.toContain('cctv')
    expect(FACES.length).toBeGreaterThanOrEqual(6)
    for (let i = 0; i < 20; i++) expect(FACES).toContain(nextScreamer(true))
    expect(Object.keys(SCREAMERS)).toContain(nextScreamer(false, () => 0, ['ghost']))
    expect(nextScreamer(false, () => 0, Object.keys(SCREAMERS).filter(n => n !== 'red') as never)).toBe('red')
  })

  it('never strikes with the same sound twice in a row', () => {
    let last = nextFlavor()
    for (let i = 0; i < 50; i++) { const f = nextFlavor(); expect(f).not.toBe(last); expect(STRIKE_FLAVORS).toContain(f); last = f }
  })

  it('leaves some spots dead each visit', () => {
    const plan = new ScreamerPlan(() => .9)
    let now = 0
    for (const [x, y, z] of SCREAMER_SPOTS) expect(plan.update({ x, y, z }, now += 20, false)).toBeUndefined()
  })
})
