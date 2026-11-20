import { describe, expect, it } from 'vitest'
import { SLEIGH_DOCK, SLEIGH_LAP_MS, SLEIGH_ROUTE, sleighPose } from '../../src/features/winter/sleigh/route'
import { createSleighArt } from '../../src/features/winter/sleigh/art'
import { parseFacilityDefinition } from '../../src/features/facilities/protocol'

describe('루돌프 썰매', () => {
  it('40초 한 바퀴 항로는 공원 둘레를 지나고 출발점에서 부드럽게 멈춘다', () => {
    const first = sleighPose(0), last = sleighPose(SLEIGH_LAP_MS)
    expect(first.x).toBeCloseTo(SLEIGH_DOCK.x)
    expect(last.x).toBeCloseTo(first.x)
    expect(last.y).toBeCloseTo(first.y)
    expect(last.z).toBeCloseTo(first.z)
    const p = SLEIGH_ROUTE.points
    expect(Math.min(...p.map(p => p.x))).toBeLessThan(-85)
    expect(Math.max(...p.map(p => p.x))).toBeGreaterThan(85)
    expect(Math.min(...p.map(p => p.z))).toBeLessThan(-95)
    expect(sleighPose(20_000).y).toBeGreaterThan(65)
    const speeds = p.slice(1).map((b, i) => {
      const a = p[i]!
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / .1
    })
    expect(speeds[0]).toBeLessThan(1)
    expect(speeds.at(-1)).toBeLessThan(1)
    expect(Math.max(...speeds)).toBeGreaterThan(25)
    expect(Math.max(...speeds)).toBeLessThan(35)
  })
  it('무료 시설 형식과 좌석 수를 검증한다', () => {
    const definition = { facilityId: 'winter-sleigh', kind: 'SLEIGH', center: SLEIGH_DOCK,
      radius: 4, heightTolerance: 1.2, seats: [SLEIGH_DOCK], exit: SLEIGH_DOCK }
    expect(parseFacilityDefinition(definition).kind).toBe('SLEIGH')
    expect(() => parseFacilityDefinition({ ...definition, seats: [] })).toThrow()
  })
  it('썰매와 순록 메시를 유한한 좌표와 작은 재질 묶음으로 만든다', () => {
    for (const deer of [false, true]) {
      const art = createSleighArt(deer)
      expect(Object.keys(art).length).toBeLessThanOrEqual(3)
      let triangles = 0
      for (const g of Object.values(art)) {
        const p = g.getAttribute('position')
        expect(Array.from(p.array).every(Number.isFinite)).toBe(true)
        triangles += (g.index?.count ?? p.count) / 3
        g.dispose()
      }
      expect(triangles).toBeLessThan(8000)
    }
  })
})
