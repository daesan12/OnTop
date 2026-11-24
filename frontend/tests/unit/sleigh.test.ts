import { describe, expect, it } from 'vitest'
import { SLEIGH_DOCK, SLEIGH_LAP_MS, SLEIGH_ROUTE, sleighPose, sleighTravelProgress } from '../../src/features/winter/sleigh/route'
import { createSleighArt } from '../../src/features/winter/sleigh/art'
import { parseFacilityDefinition } from '../../src/features/facilities/protocol'
import { createSleighClock } from '../../src/features/winter/sleigh/flightClock'
import { SleighCamera } from '../../src/features/winter/sleigh/camera'
import { PerspectiveCamera, Vector3 } from 'three'
import { sleighChassisPose, sleighTeamPose } from '../../src/features/winter/sleigh/formation'

describe('루돌프 썰매', () => {
  it('썰매 본체도 커브를 미리 향하고 기울면서 서버 항로의 중심을 유지한다', () => {
    let bank = 0, anticipatedTurn = 0
    for (let at = 0; at <= SLEIGH_LAP_MS; at += 100) {
      const chassis = sleighChassisPose(at), base = sleighPose(at), team = sleighTeamPose(at, 3.4, 0)
      expect([chassis.x, chassis.y, chassis.z]).toEqual([base.x, base.y, base.z])
      expect(Object.values(chassis).filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true)
      expect(Math.abs(chassis.bank)).toBeLessThanOrEqual(.24)
      expect(Math.abs(chassis.pitch)).toBeLessThanOrEqual(.32)
      if (Math.abs(team.bank) > .05) expect(Math.sign(chassis.bank)).toBe(Math.sign(team.bank))
      bank = Math.max(bank, Math.abs(chassis.bank))
      anticipatedTurn = Math.max(anticipatedTurn, Math.abs(chassis.yaw - base.yaw))
    }
    expect(bank).toBeGreaterThan(.05)
    expect(anticipatedTurn).toBeGreaterThan(.01)
    for (const at of [0, SLEIGH_LAP_MS]) {
      const chassis = sleighChassisPose(at)
      expect(chassis.bank).toBeCloseTo(0); expect(chassis.pitch).toBeCloseTo(0)
    }
  })
  it('순록의 각 줄이 커브를 따라 다르게 선회하고 탑승장에서는 원래 대형을 유지한다', () => {
    let bend = 0, bank = 0
    for (let at = 0; at <= SLEIGH_LAP_MS; at += 100) {
      const near = sleighTeamPose(at, 3.4, -.85), far = sleighTeamPose(at, 8.4, -.85)
      const right = sleighTeamPose(at, 8.4, .85)
      expect(Object.values(far).every(Number.isFinite)).toBe(true)
      expect(Math.hypot(far.x - right.x, far.z - right.z)).toBeCloseTo(1.7, 1)
      bend = Math.max(bend, Math.abs(far.x - near.x))
      bank = Math.max(bank, Math.abs(far.bank))
      if (at > 0) {
        const previous = sleighTeamPose(at - .01, 8.4, -.85)
        expect(Math.hypot(far.x - previous.x, far.y - previous.y, far.z - previous.z)).toBeLessThan(.005)
      }
    }
    expect(bend).toBeGreaterThan(.15)
    expect(bank).toBeGreaterThan(.05)
    for (const at of [0, SLEIGH_LAP_MS]) {
      const pose = sleighTeamPose(at, 8.4, -.85)
      for (const [key, value] of Object.entries({ x: -.85, y: 0, z: 8.4, yaw: 0, pitch: 0, bank: 0 })) {
        expect(pose[key as keyof typeof pose]).toBeCloseTo(value)
      }
    }
  })
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
    expect(Math.max(...speeds)).toBeGreaterThan(18)
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

it('출발과 도착의 긴 저속 구간만 줄이고 40초 동안 단조롭게 이동한다',()=>{
  const legacy=(t:number)=>t*t*(3-2*t)
  for(const t of [.025,.05,.1]){
    expect(sleighTravelProgress(t)).toBeGreaterThan(legacy(t))
    expect(sleighTravelProgress(1-t)).toBeLessThan(legacy(1-t))
  }
  let before=0
  for(let frame=0;frame<=400;frame++){
    const progress=sleighTravelProgress(frame/400)
    expect(progress).toBeGreaterThanOrEqual(before)
    expect(progress).toBeLessThanOrEqual(1)
    before=progress
  }
  expect(sleighTravelProgress(0)).toBe(0)
  expect(sleighTravelProgress(1)).toBe(1)
  expect(SLEIGH_LAP_MS).toBe(40000)
})
