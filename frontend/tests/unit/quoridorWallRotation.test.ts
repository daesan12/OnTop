import { expect, it } from 'vitest'
import { legalDrop } from '../../src/game/quoridor/drag'
import { wallPoint } from '../../src/game/quoridor/presentation'
import type { Quoridor } from '../../src/game/quoridor/protocol'
import { rotateWall, WallWheelStep } from '../../src/game/quoridor/wallRotation'

it('한 번의 큰 휠 입력은 한 번만 회전하고 회전한 방향으로 합법 드롭을 검사한다', () => {
  const wheel = new WallWheelStep(), wall = { x: 3, y: 4, orientation: 'VERTICAL' as const }, p = wallPoint(wall)
  const piece = { kind: 'wall' as const, version: 7, pointerId: 1, x: p[0], z: p[2] }
  const board = { version: 7, status: 'PLAYING', legalWalls: [wall] } as Quoridor
  let orientation = 'HORIZONTAL' as typeof wall.orientation | 'HORIZONTAL'
  expect(legalDrop(piece, board, orientation)).toBeNull()
  if (wheel.accept(240, 0, 0)) orientation = rotateWall(orientation)
  expect(legalDrop(piece, board, orientation)).toEqual({ kind: 'wall', ...wall })
  expect(legalDrop(piece, { ...board, version: 8 }, orientation)).toBeNull()
})
it('작은 트랙패드 입력은 누적하고 흔들림·수평·중립 입력으로 추가 회전하지 않는다', () => {
  const wheel = new WallWheelStep()
  expect(wheel.accept(8, 0, 0)).toBe(false)
  expect(wheel.accept(8, 0, 10)).toBe(false)
  expect(wheel.accept(8, 0, 20)).toBe(true)
  expect(wheel.accept(80, 0, 30)).toBe(false)
  expect(wheel.accept(80, 0, 80)).toBe(false)
  expect(wheel.accept(0, 0, 100)).toBe(false)
  expect(wheel.accept(NaN, 0, 200)).toBe(false)
  expect(wheel.accept(80, 0, 220)).toBe(true)
})
it('오래 떨어진 작은 입력과 반대 방향의 흔들림은 누적하지 않는다', () => {
  const wheel = new WallWheelStep()
  expect(wheel.accept(16, 0, 0)).toBe(false)
  expect(wheel.accept(16, 0, 200)).toBe(false)
  expect(wheel.accept(-8, 0, 210)).toBe(false)
  expect(wheel.accept(-8, 0, 220)).toBe(false)
  expect(wheel.accept(-8, 0, 230)).toBe(true)
})
it('줄·페이지 단위 휠과 빠른 반대 방향 조작을 지원한다', () => {
  const wheel = new WallWheelStep()
  expect(wheel.accept(3, 1, 0)).toBe(true)
  expect(wheel.accept(-1, 2, 20)).toBe(true)
  wheel.reset()
  expect(wheel.accept(-100, 0, 30)).toBe(true)
})
