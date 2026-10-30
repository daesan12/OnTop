import { describe, expect, it } from 'vitest'
import { draggedShot } from '../../src/game/alkkagi/aimInput'

describe('알 선택 후 별도 드래그', () => {
  it('알 가장자리를 클릭해도 실제 마우스 이동이 없으면 발사하지 않는다', () => {
    expect(draggedShot({ x: 200, y: 100 }, { x: 200, y: 100 }, { x: .4, z: .3 }, { x: .4, z: .3 })).toBeNull()
  })
  it('마우스 미세 흔들림이나 원점으로 되돌린 드래그는 발사하지 않는다', () => {
    expect(draggedShot({ x: 200, y: 100 }, { x: 205, y: 104 }, { x: .4, z: .3 }, { x: .5, z: .4 })).toBeNull()
    expect(draggedShot({ x: 200, y: 100 }, { x: 220, y: 100 }, { x: .4, z: .3 }, { x: .4, z: .3 })).toBeNull()
  })
  it('힘은 알 중심까지 거리가 아닌 실제 드래그 이동량으로 계산한다', () => {
    const shot = draggedShot({ x: 200, y: 100 }, { x: 200, y: 160 }, { x: .4, z: .3 }, { x: .4, z: 1.3 })
    expect(shot?.dx).toBe(0)
    expect(shot?.dy).toBe(-1)
    expect(shot?.power).toBe(.4)
  })
})
