import { expect, it } from 'vitest'
import { PositionPlayback } from '../../src/features/skewer/serviceHall/rendering/PositionPlayback'
import { RestaurantSet } from '../../src/features/skewer/serviceHall/rendering/RestaurantSet'
import { move, SERVER_SPEED } from '../../src/features/skewer/serviceHall/plan'
import { Group, Mesh, Box3 } from 'three'

it('로컬 서빙도 대각선 가속 없이 초당 6의 이동 속도를 사용한다', () => {
  expect(SERVER_SPEED).toBe(6)
  for (const [dx, dz] of [[1, 0], [1, 1]]) {
    const next = move({ x: 0, z: 1.25 }, dx, dz, .05)
    expect(Math.hypot(next.x, next.z - 1.25)).toBeCloseTo(.30)
  }
})

it('서버 시각이 같은 방향 응답과 도착 지터가 있어도 재생 속도가 출렁이지 않는다', () => {
  const player = new PositionPlayback()
  player.reset({ x: 0, z: 0 }, 0)
  const steps: number[] = []
  let previous = { x: 0, z: 0 }, sample = 0
  for (let frame = 1; frame <= 120; frame++) {
    const next = sample + 1, arrival = next * 6 + (next % 2 ? 2 : 0)
    if (frame === arrival) { sample = next; player.push({ x: sample * .58, z: 0 }, sample * .1) }
    if (frame % 4 === 0) player.push({ x: sample * .58, z: 0 }, sample * .1)
    const point = player.step(1 / 60)
    if (frame > 30) steps.push(point.x - previous.x)
    expect(point.x).toBeLessThanOrEqual(sample * .58 + .000001)
    previous = point
  }
  expect(Math.min(...steps)).toBeGreaterThan(.09)
  expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(.000001)
})

it('같은 서버 틱의 응답은 새 정지 구간을 만들지 않고 틱 좌표를 교체한다', () => {
  const player = new PositionPlayback()
  player.reset({ x: 0, z: 0 }, 10)
  for (let i = 0; i < 6; i++) player.step(1 / 60)
  player.push({ x: .58, z: 0 }, 10.1)
  for (let i = 0; i < 2; i++) player.step(1 / 60)
  player.push({ x: .58, z: 0 }, 10.1)
  for (let i = 0; i < 4; i++) player.step(1 / 60)
  player.push({ x: 1.16, z: 0 }, 10.2)
  for (let i = 0; i < 6; i++) player.step(1 / 60)
  expect(player.step(0).x).toBeCloseTo(.87, 6)
})

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
