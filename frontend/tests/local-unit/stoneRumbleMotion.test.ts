import { expect, it } from 'vitest'
import { followStoneYaw } from '../../src/game/stone-rumble/motion'

it('turns toward a new movement direction across multiple frames and eases into it', () => {
  const target = Math.PI / 2, dt = 1 / 60
  let yaw = followStoneYaw(0, target, dt, 12, 5.2)
  expect(yaw).toBeGreaterThan(0)
  expect(yaw).toBeLessThan(.1)
  for (let frame = 1; frame < 45; frame++) {
    const next = followStoneYaw(yaw, target, dt, 12, 5.2)
    expect(next).toBeGreaterThan(yaw)
    expect(next).toBeLessThanOrEqual(target)
    yaw = next
  }
  expect(yaw).toBeCloseTo(target, 2)
})

it('takes the short arc when a direction change crosses the angle wrap', () => {
  const current = Math.PI - .02
  const target = -Math.PI + .05
  expect(followStoneYaw(current, target, 1 / 60, 12, 5.2)).toBeGreaterThan(current)
})
