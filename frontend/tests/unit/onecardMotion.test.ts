import { expect, it } from 'vitest'
import { cardDropReady, stepSpring } from '../../src/game/onecard/motion'

it('requires an intentional upward gesture, not a tap, downward pull, or sideways hand movement', () => {
  for (const height of [157, 196, 216]) {
    expect(cardDropReady(0, -120, height)).toBe(true)
    for (const [dx, dy] of [[0, -20], [0, 120], [280, -120], [-280, -120]])
      expect(cardDropReady(dx!, dy!, height)).toBe(false)
  }
})
it('settles at rest across frame rates and remains finite after a suspended tab', () => {
  for (const delta of [1 / 120, 1 / 60, 1 / 24, 8]) {
    const spring = { position: 0, velocity: 0 }
    for (let i = 0; i < 240; i++) {
      stepSpring(spring, i < 120 ? .024 : 0, delta)
      expect(Number.isFinite(spring.position)).toBe(true)
      expect(Math.abs(spring.position)).toBeLessThan(.05)
    }
    expect(spring.position).toBeCloseTo(0, 4)
    expect(spring.velocity).toBeCloseTo(0, 3)
  }
})
