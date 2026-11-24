import { describe, expect, it } from 'vitest'
import { HORROR, HORROR_CRYPT, HORROR_PILLARS, horrorGround, inHorror } from '../../park-renewal-preview/horrorPlan'
import { galleryVolumes } from '../../park-renewal-preview/interiorAccess'
import {
  CAMERA_CEILING, CHAINS, COBWEBS, COLUMN_TRIM, DYING_LAMPS, EFFIGY_EYES, LAMP_COUNT, RUBBLE, SHAFTS, VAULT_RIBS, WALL_MARKS,
  lampFlicker,
} from '../../park-renewal-preview/horrorDressingPlan'

// The dressing is visual only: it must never sit where a player walks or where the clamped camera can travel.
const pillarHalf = (HORROR_PILLARS[0]!.x1 - HORROR_PILLARS[0]!.x0) / 2
const decks = galleryVolumes.filter(v => v.material === 'stone')
const overDeck = (x: number, z: number, margin = 0) => decks.some(({ center: [cx, , cz], size: [w, , d] }) =>
  Math.abs(x - cx) < w / 2 + margin && Math.abs(z - cz) < d / 2 + margin)

describe('underground dressing (S15P31B105-450)', () => {
  it('keeps the vault ribs above the highest camera position', () => {
    for (const r of VAULT_RIBS) expect(r.from[1] - r.depth / 2).toBeGreaterThanOrEqual(CAMERA_CEILING)
    for (const r of VAULT_RIBS) expect(r.from[1] + r.depth / 2).toBeLessThanOrEqual(HORROR.ceiling + .001)
  })

  it('thickens columns only inside the walking and camera margins', () => {
    for (const t of COLUMN_TRIM) {
      const half = t.size[0] / 2
      // Plinths: avatars keep .36m from a column face; capitals: the camera keeps .23m.
      expect(half).toBeLessThanOrEqual(pillarHalf + (t.at[1] < HORROR.floor + 1 ? .36 : .23))
    }
  })

  it('hangs chains away from the gallery deck and above head height', () => {
    for (const c of CHAINS) {
      expect(overDeck(c.at[0], c.at[2], 1)).toBe(false)
      expect(c.at[1] - c.length).toBeGreaterThan(HORROR.floor + 5.5)
      expect(inHorror(c.at[0], c.at[2], 1)).toBe(true)
    }
  })

  it('places marks, webs and eyes inside the hall', () => {
    for (const m of WALL_MARKS) {
      expect(inHorror(m.at[0], m.at[2], -1.2)).toBe(true)
      expect(m.at[1]).toBeGreaterThan(HORROR.floor)
      expect(m.at[1] + m.size[1] / 2).toBeLessThan(HORROR.ceiling)
      expect(Math.hypot(...m.normal)).toBeCloseTo(1)
    }
    for (const w of COBWEBS) for (const p of [w.corner, w.a, w.b]) expect(p[1]).toBeLessThanOrEqual(HORROR.ceiling)
    expect(EFFIGY_EYES).toHaveLength(4)
  })

  it('keeps rubble small, on the lower floor and out of the cistern', () => {
    for (const r of RUBBLE) {
      const [x, y, z] = r.at
      expect(r.radius).toBeLessThanOrEqual(.27)
      expect(inHorror(x, z)).toBe(true)
      expect(horrorGround(x, z)).toBe(HORROR.floor)
      expect(y).toBeLessThan(HORROR.floor + .2)
      expect(((x - HORROR_CRYPT.x) / HORROR_CRYPT.rx) ** 2 + ((z - HORROR_CRYPT.z) / HORROR_CRYPT.rz) ** 2).toBeGreaterThan(1)
    }
  })

  it('runs every light shaft from its source down to a surface', () => {
    for (const s of SHAFTS) {
      expect(s.top[1]).toBeGreaterThan(s.bottom)
      expect(s.bottom).toBeGreaterThanOrEqual(HORROR.floor)
      expect(s.top[1]).toBeLessThanOrEqual(HORROR.ceiling)
    }
  })

  it('flickers lamps within range: steady ones never drop, failing ones go dark sometimes', () => {
    let darkest = 1
    for (let i = 0; i < LAMP_COUNT; i++) for (let t = 0; t < 120; t += .05) {
      const v = lampFlicker(i, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1.05)
      if (!DYING_LAMPS.includes(i)) expect(v).toBeGreaterThan(.8)
      else darkest = Math.min(darkest, v)
    }
    expect(darkest).toBeLessThan(.1)
  })
})
