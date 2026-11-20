import { describe, expect, it } from 'vitest'
import { SLEIGH_DOCK, SLEIGH_LAP_MS, SLEIGH_ROUTE, sleighPose } from '../../src/features/winter/sleigh/route'
import { createSleighArt } from '../../src/features/winter/sleigh/art'
import { parseFacilityDefinition } from '../../src/features/facilities/protocol'
import { createSleighClock } from '../../src/features/winter/sleigh/flightClock'
import { SleighCamera } from '../../src/features/winter/sleigh/camera'
import { PerspectiveCamera, Vector3 } from 'three'

describe('루돌프 썰매', () => {
  it('항로 표본 경계와 각도 래핑에서 시선이 튀지 않는다', () => {
    for (let at = 100; at < SLEIGH_LAP_MS - 100; at += 100) {
      const a = sleighPose(at - .01), b = sleighPose(at + .01)
      expect(Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw)))).toBeLessThan(.001)
    }
  })
  it('비행 중 서버 시계 보정이 들어와도 화면의 비행 속도를 끊지 않고 새 탑승은 다시 동기화한다', () => {
    const clock = createSleighClock(), start = '2026-11-20T01:00:00Z', epoch = Date.parse(start)
    expect(clock('one', start, epoch + 1000, 100)).toBe(1000)
    expect(clock('one', start, epoch + 1400, 116)).toBe(1016)
    expect(clock('one', start, epoch + 900, 132)).toBe(1032)
    expect(clock('two', start, epoch + 2000, 148)).toBe(2000)
  })
  it('탑승 첫 화면과 중도 복귀가 순간 이동하지 않고 목표에 수렴한다', () => {
    const camera = new PerspectiveCamera(), smoothing = new SleighCamera()
    camera.position.set(2, 7, 96); camera.lookAt(2, 5, 86)
    const before = camera.position.clone(), rotation = camera.quaternion.clone()
    const pose = sleighPose(0)
    smoothing.follow(camera, pose, 1 / 60)
    expect(camera.position.distanceTo(before)).toBeLessThan(2)
    expect(camera.quaternion.angleTo(rotation)).toBeLessThan(.25)
    for (let i = 0; i < 120; i++) smoothing.follow(camera, sleighPose(20000), 1 / 60)
    const desired = new Vector3(2, 7, 96), look = new Vector3(2, 5, 86)
    const airborne = camera.position.clone()
    expect(smoothing.leave(camera)).toBe(true)
    smoothing.returnToPark(camera, desired, look, 1 / 60)
    expect(camera.position.distanceTo(airborne)).toBeLessThan(airborne.distanceTo(desired) * .2)
    for (let i = 0; i < 85; i++) smoothing.returnToPark(camera, desired, look, 1 / 60)
    expect(camera.position.distanceTo(desired)).toBeLessThan(.005)
  })
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
