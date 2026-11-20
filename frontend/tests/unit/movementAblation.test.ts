import { expect, it } from 'vitest'
import { LocalMovementPrediction, type MotionSnapshot } from '../../src/network/localMovementPrediction'
import type { Pose } from '../../src/network/worldClient'
import { installMovementAblation, movementQuality } from '../diagnostics/movementAblation'

it('separates initial reversal transients from sustained reverse movement and reports no-data as null', () => {
  const p = (x: number): Pose => ({ x, y: .8, z: 0, yaw: 0 })
  const frames = [0, .1, -.1].map((x, index) => ({ at: index * 100, display: p(x), predicted: p(x), changedAt: 0,
    intent: { dx: 1, dz: 0, run: true, jump: false } }))
  expect(movementQuality(frames)).toMatchObject({ reverseFrames: 1, stableReverseFrames: 0 })
  frames.push({ ...frames[2]!, at: 300, display: p(-.2) })
  expect(movementQuality(frames).stableReverseFrames).toBe(1)
  expect(movementQuality([]).stableRunSpeedMean).toBeNull()
})

it('keeps freshness limits and explicit relocation/activity boundaries in the no-replay diagnostic', async () => {
  let body: Pose = { x: 0, y: .8, z: 0, yaw: 0 }, resets = 0
  const prediction = new LocalMovementPrediction(async () => ({
    reset(pose) { body = { ...pose }; resets++ },
    step(input, seconds) { body.x += input.dx * 6.25 * seconds },
    pose: () => ({ ...body }), setChairs() {}, dispose() {},
  }), () => 0)
  const motion: MotionSnapshot = { tick: 0, epoch: 0, appliedInputSeq: 0, inputAgeMs: 0,
    grounded: true, velocityY: 0, inputActive: false }
  prediction.reconcile('local', body, motion, true, 0); await prediction.prepare()
  const test = installMovementAblation(prediction, 'no-replay'), p = { ...body }, initialResets = resets
  prediction.intend({ dx: 1, dz: 0, run: false, jump: false }, 10)
  prediction.reconcile('local', { ...body, x: 99 }, { ...motion, tick: 3 }, true, 100)
  prediction.sample(100, p)
  expect(p.x).toBeLessThan(1); expect(resets).toBe(initialResets)
  prediction.sample(1000, p)
  expect(test.snapshot().simulatedAt).toBe(350)
  prediction.reconcile('local', { ...body, x: 20 }, { ...motion, tick: 6, epoch: 1 }, true, 1000)
  prediction.sample(1000, p); expect(p.x).toBe(20)
  prediction.reconcile('local', body, motion, false, 1001)
  expect(prediction.sample(1001, p)).toBe(false)
  test.dispose(); prediction.reset()
})
