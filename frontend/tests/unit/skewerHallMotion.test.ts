import { describe, expect, it } from 'vitest'
import { HallMotion } from '../../src/features/skewer/serviceHall/rendering/HallMotion'

describe('홀 캐릭터 위치 표시', () => {
  it('반대 방향 전환의 첫 프레임은 튀지 않고 100ms 안에 회전의 90퍼센트를 반영한다', () => {
    const motion = new HallMotion()
    motion.update({ x: 0, z: 0 }, 0)
    for (let frame = 0; frame < 30; frame++) motion.update({ x: .5, z: 0 }, 1 / 60)
    const before = motion.yaw
    motion.update({ x: .4, z: 0 }, 1 / 60)
    expect(Math.abs(motion.yaw - before)).toBeLessThan(Math.PI / 3)
    for (let frame = 1; frame < 6; frame++) motion.update({ x: .4, z: 0 }, 1 / 60)
    const error = Math.abs(Math.atan2(Math.sin(motion.yaw + Math.PI / 2), Math.cos(motion.yaw + Math.PI / 2)))
    expect(error).toBeLessThan(Math.PI * .1)
  })
  it('이미 재생된 원형 이동은 추가 감속이나 반경 축소 없이 위치를 따라간다', () => {
    for (const hz of [30, 60, 120]) {
      const motion = new HallMotion(), radius = .5
      motion.update({ x: radius, z: 0 }, 0)
      let travel = 0
      for (let frame = 1; frame <= hz; frame++) {
        const angle = frame / hz * Math.PI * 2, target = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
        const before = { ...motion.position }
        motion.update(target, 1 / hz, false, true)
        expect(motion.position.x).toBeCloseTo(target.x, 10)
        expect(motion.position.z).toBeCloseTo(target.z, 10)
        travel += Math.hypot(motion.position.x - before.x, motion.position.z - before.z)
      }
      expect(travel).toBeGreaterThan(2 * Math.PI * radius * .99)
    }
  })
  it('30·60·120Hz에서 같은 시간 동안 위치와 회전 전환량이 같다', () => {
    const values = [30, 60, 120].map(hz => {
      const motion = new HallMotion()
      motion.update({ x: 0, z: 0 }, 0)
      for (let frame = 0; frame < hz / 10; frame++) motion.update({ x: .5, z: 0 }, 1 / hz)
      return { x: motion.position.x, yaw: motion.yaw }
    })
    for (const value of values) {
      expect(value.x).toBeCloseTo(values[0].x, 10)
      expect(value.yaw).toBeCloseTo(values[0].yaw, 10)
    }
  })
  it('확정 위치와 회전을 100ms 안에 90퍼센트 이상 따라가며 앞질러 가지 않는다', () => {
    const motion = new HallMotion()
    motion.update({ x: 0, z: 0 }, 0)
    for (let frame = 0; frame < 6; frame++) {
      motion.update({ x: .5, z: 0 }, 1 / 60)
      expect(motion.position.x).toBeLessThanOrEqual(.5)
    }
    expect(motion.position.x).toBeGreaterThanOrEqual(.45)
    expect(motion.yaw).toBeGreaterThanOrEqual(Math.PI / 2 * .9)
  })
  it('방향 전환은 남은 표시 오차가 아니라 새 서버 이동 방향을 따라간다', () => {
    const motion = new HallMotion()
    motion.update({ x: 0, z: 0 }, 0)
    motion.update({ x: .5, z: 0 }, 1 / 60)
    const before = motion.yaw
    motion.update({ x: .4, z: 0 }, 1 / 60)
    expect(motion.yaw).toBeLessThan(before)
    for (let frame = 0; frame < 20; frame++) motion.update({ x: .4, z: 0 }, 1 / 60)
    expect(Math.sin(motion.yaw)).toBeLessThan(-.99)
    expect(motion.position.x).toBeLessThanOrEqual(.4)
  })
  it('멈춘 확정 위치에서 200ms 안에 걷기 상태를 끝내고 방향을 유지한다', () => {
    const motion = new HallMotion()
    motion.update({ x: 0, z: 0 }, 0)
    for (let frame = 0; frame < 12; frame++) motion.update({ x: .5, z: 0 }, 1 / 60)
    expect(motion.moving).toBe(false)
    expect(motion.position.x).toBeCloseTo(.5, 2)
    expect(Math.sin(motion.yaw)).toBeGreaterThan(.99)
  })
  it('100ms 위치 갱신 사이에도 매 프레임 전진하고 걷기 자세가 끊기지 않는다', () => {
    const motion = new HallMotion()
    motion.update({ x: 0, z: 0 }, 0)
    let previous = 0
    for (let frame = 1; frame <= 60; frame++) {
      motion.update({ x: Math.ceil(frame / 6) * .5, z: 0 }, 1 / 60)
      expect(motion.position.x).toBeGreaterThan(previous)
      expect(motion.moving).toBe(true)
      previous = motion.position.x
    }
    for (let frame = 0; frame < 90; frame++) motion.update({ x: 5, z: 0 }, 1 / 60)
    expect(motion.moving).toBe(false)
    expect(motion.position.x).toBeCloseTo(5, 4)
  })
  it('일시정지 중 표시 위치를 움직이지 않고 큰 위치 변경은 즉시 반영한다', () => {
    const motion = new HallMotion()
    motion.update({ x: 0, z: 0 }, 0)
    motion.update({ x: 1, z: 0 }, .1, true)
    expect(motion.position.x).toBe(0)
    expect(motion.moving).toBe(false)
    motion.update({ x: 12, z: 8 }, .1)
    expect(motion.position).toEqual({ x: 12, z: 8 })
  })
})
