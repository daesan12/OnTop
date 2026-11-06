import { describe, expect, it } from 'vitest'
import { HallMotion } from '../../src/features/skewer/serviceHall/rendering/HallMotion'

describe('홀 캐릭터 위치 표시', () => {
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
