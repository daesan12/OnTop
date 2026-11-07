import { expect, it } from 'vitest'
import { PositionPlayback } from '../../src/features/skewer/serviceHall/rendering/PositionPlayback'
import { RestaurantSet } from '../../src/features/skewer/serviceHall/rendering/RestaurantSet'
import { Group, Mesh, Box3 } from 'three'

it('100ms 좌표 사이를 일정한 속도로 재생하고 멈춘 서버 위치를 넘어가지 않는다', () => {
  for (const hz of [30, 60, 120]) {
    const player = new PositionPlayback(); player.reset({ x: 0, z: 0 })
    const steps: number[] = []; let previous = 0
    for (let frame = 0; frame < hz; frame++) {
      if (frame % (hz / 10) === 0) player.push({ x: frame / hz * 6.5, z: 0 })
      const point = player.step(1 / hz)
      if (frame > hz * .3) steps.push(point.x - previous)
      previous = point.x
    }
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(.000001)
    for (let frame = 0; frame < hz; frame++) expect(player.step(1 / hz).x).toBeLessThanOrEqual(5.85 + .000001)
    expect(player.step(0).x).toBeCloseTo(5.85)
    player.reset({ x: -2, z: 1 }); expect(player.step(0)).toEqual({ x: -2, z: 1 })
  }
})

it('고정 장식을 묶어도 변환된 외곽과 동적 그룹·원본 자원을 보존한다', () => {
  const art = new RestaurantSet(), dynamic = new Group()
  art.root.add(dynamic); art.root.scale.z = 1.3
  art.place(dynamic, art.box(1, 1, 1, '#fff'), 4, 0, 0)
  for (let i = 0; i < 10; i++) art.place(art.root, art.box(1, 1, 1, '#fff'), i, 0, 2)
  const before = new Box3().setFromObject(art.root)
  art.batchStatic(new Set([dynamic]))
  expect(dynamic.children).toHaveLength(1)
  expect(art.root.children.filter(child => child instanceof Mesh)).toHaveLength(1)
  expect(new Box3().setFromObject(art.root).equals(before)).toBe(true)
  art.dispose()
})
