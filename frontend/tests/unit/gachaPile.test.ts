import { expect, it } from 'vitest'
import { CapsulePile } from '../../src/features/gacha/capsulePile'
import { capsuleName } from '../../src/features/gacha/labels'

it('전송 등급을 바꾸지 않고 S·A·B·C 표시를 사용한다', () => {
  expect([1, 2, 3, 4, 5].map(capsuleName)).toEqual(['S급 캡슐', 'A급 캡슐', 'B급 캡슐', 'C급 캡슐', '엽전'])
})

it('같은 경과 시간은 렌더 프레임 수와 관계없이 같은 굴림을 만든다', () => {
  const fast = new CapsulePile(), slow = new CapsulePile()
  for (let i = 0; i < 240; i++) fast.advance(1 / 120, 1)
  for (let i = 0; i < 60; i++) slow.advance(1 / 30, 1)
  expect(slow.balls).toEqual(fast.balls)
  expect(fast.contacts).toBeGreaterThan(0)
  expect(fast.kicks).toBeGreaterThan(0)
})

it('긴 프레임과 반복 추첨에서도 유리통 경계를 벗어나거나 수치가 깨지지 않는다', () => {
  const pile = new CapsulePile()
  for (let i = 0; i < 500; i++) {
    pile.advance(i % 17 === 0 ? 10 : 1 / 60, i % 100 < 70 ? 1 : 0)
    for (const ball of pile.balls) {
      expect(Object.values(ball).every(Number.isFinite)).toBe(true)
      expect(Math.hypot(ball.x / 86, ball.z / 44)).toBeLessThanOrEqual(1.000001)
      expect(ball.y).toBeGreaterThanOrEqual(-7)
      expect(ball.y).toBeLessThanOrEqual(78)
    }
  }
  pile.settle()
  expect(pile.balls.every(b => b.vx === 0 && b.vy === 0 && b.vz === 0)).toBe(true)
})
