import { describe, expect, it } from 'vitest'
import { LocalMovementPrediction, type MotionSnapshot, type PredictionSimulation } from '../../src/network/localMovementPrediction'
import type { MovementIntent } from '../../src/network/movementInput'
import { sampleMovement } from '../../src/world/movementPresentation'
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import { groundHeight, MOVEMENT, spawnPosition, WORLD } from '../../src/config'

const origin = { x: -2, y: .8, z: 34, yaw: Math.PI }
const motion = (tick = 0, seq = 0): MotionSnapshot => ({ epoch: 0, tick, appliedInputSeq: seq,
  inputAgeMs: 0, velocityY: 0, grounded: true, inputActive: false })
const walk: MovementIntent = { dx: 1, dz: 0, run: false, jump: false }
const stop: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }
class FlatSimulation implements PredictionSimulation {
  p = { ...origin }
  jumps = 0
  disposed = false
  reset(pose: typeof origin) { this.p = { ...pose } }
  step(intent: MovementIntent, seconds: number) {
    this.p.x += intent.dx * (intent.run ? 9 : 6.25) * seconds
    this.p.z += intent.dz * (intent.run ? 9 : 6.25) * seconds
    if (intent.dx || intent.dz) this.p.yaw = Math.atan2(intent.dx, intent.dz)
    if (intent.jump) ++this.jumps
  }
  pose() { return { ...this.p } }
  setChairs() {}
  dispose() { this.disposed = true }
}
async function ready(pose = origin) {
  const sim = new FlatSimulation()
  const prediction = new LocalMovementPrediction(async () => sim, () => 0)
  prediction.reconcile('one', pose, motion(), true, 0)
  await prediction.prepare()
  return { sim, prediction }
}
describe('own movement prediction; authority and other avatars stay separate', () => {
  it('keeps position immediate but blends a quarter-turn and does not restart it for server acknowledgements', async () => {
    const { prediction } = await ready({ ...origin, yaw: 0 })
    const p = { ...origin }
    prediction.sample(0, p)
    prediction.intend(walk, 0); prediction.sentInput(1, 0)
    prediction.sample(17, p)
    expect(p.x).toBeGreaterThan(origin.x)
    expect(p.yaw).toBeLessThan(Math.PI / 4)
    prediction.sample(77, p)
    expect(p.yaw).toBeGreaterThan(0)
    expect(p.yaw).toBeLessThan(Math.PI / 2)
    const visibleYaw = p.yaw
    prediction.reconcile('one', { ...p, yaw: Math.PI / 2 }, { ...motion(2, 1), inputActive: true }, true, 77)
    prediction.sample(77, p)
    expect(p.yaw).toBeCloseTo(visibleYaw)
    prediction.sample(137, p)
    expect(p.yaw).toBeCloseTo(Math.PI / 2)
    prediction.reset()
  })
  it('continues a rapid direction change from the visible facing without delaying the new travel direction', async () => {
    const { prediction } = await ready({ ...origin, yaw: 0 })
    const p = { ...origin }; prediction.sample(0, p)
    prediction.intend(walk, 0); prediction.sample(17, p); prediction.sample(77, p)
    const before = { ...p }
    prediction.intend({ ...walk, dx: 0, dz: -1 }, 77); prediction.sample(94, p)
    expect(p.z).toBeLessThan(before.z)
    expect(p.yaw - before.yaw).toBeLessThan(.3)
    prediction.sample(154, p)
    expect(p.yaw).toBeGreaterThan(before.yaw); expect(p.yaw).toBeLessThan(Math.PI)
    const sameFrame = p.yaw; prediction.sample(154, p)
    expect(p.yaw).toBe(sameFrame)
    prediction.sample(214, p); expect(p.yaw).toBeCloseTo(Math.PI)
    prediction.reset()
  })
  it('turns across the angle seam by the short path and resets facing immediately on a relocation epoch', async () => {
    const startYaw = Math.PI * 179 / 180, endYaw = -startYaw
    const { prediction } = await ready({ ...origin, yaw: startYaw })
    const p = { ...origin }; prediction.sample(0, p)
    prediction.intend({ ...walk, dx: Math.sin(endYaw), dz: Math.cos(endYaw) }, 0)
    prediction.sample(17, p); prediction.sample(77, p)
    expect(Math.abs(p.yaw - startYaw)).toBeLessThan(Math.PI / 90)
    prediction.sample(137, p)
    expect(Math.atan2(Math.sin(p.yaw - endYaw), Math.cos(p.yaw - endYaw))).toBeCloseTo(0)
    prediction.reconcile('one', { ...origin, x: 20, yaw: -.5 }, { ...motion(3, 1), epoch: 1 }, true, 150)
    prediction.sample(150, p)
    expect(p.x).toBe(20); expect(p.yaw).toBe(-.5)
    prediction.reset()
  })
  it('renders a new intent on the next frame before any reply, while the old presenter stays still', async () => {
    const { prediction } = await ready()
    prediction.intend(walk, 0); prediction.sentInput(1, 0)
    const predicted = { ...origin }, before = { ...origin }
    prediction.sample(1000 / 60, predicted)
    sampleMovement({ previous: origin, current: origin, at: 0 }, 1000 / 60, 120, before)
    expect(predicted.x - origin.x).toBeCloseTo(6.25 / 60)
    expect(before).toEqual(origin)
    expect(origin.x).toBe(-2)
    expect(prediction.metrics().firstResponseMs[0]).toBeCloseTo(1000 / 60)
    prediction.reset()
  })
  it('replays only the remaining timeline after a physics-completed acknowledgement', async () => {
    const { prediction } = await ready()
    prediction.intend(walk, 0); prediction.sentInput(1, 0)
    const p = { ...origin }
    prediction.sample(140, p)
    prediction.reconcile('one', { ...origin, x: origin.x + .3125 },
      { ...motion(3, 1), inputAgeMs: 50, inputActive: true }, true, 150)
    prediction.sample(150, p)
    expect(p.x - origin.x).toBeCloseTo(.9375, 4)
    const before = { ...p }
    prediction.reconcile('one', { ...origin, x: origin.x + .3125 }, motion(2, 1), true, 151)
    prediction.sample(151, p)
    expect(p.x).toBeGreaterThanOrEqual(before.x)
    prediction.reset()
  })
  it('reacts to stop and direction reversal without waiting for an acknowledgement', async () => {
    const { prediction } = await ready()
    prediction.intend(walk, 0)
    const p = { ...origin }; prediction.sample(60, p)
    prediction.intend(stop, 60); prediction.sample(90, p)
    expect(p.x).toBeCloseTo(origin.x + .375)
    prediction.intend({ ...walk, dx: -1 }, 90); prediction.sample(120, p)
    expect(p.x).toBeCloseTo(origin.x + .1875)
    prediction.reset()
  })
  it('bounds missing replies to 250ms, resets on recovery/scope changes, and supports legacy fallback', async () => {
    const { prediction } = await ready()
    prediction.intend(walk, 0)
    const p = { ...origin }; prediction.sample(1000, p)
    expect(p.x).toBeCloseTo(origin.x + 6.25 * .25)
    prediction.reconcile('one', { ...origin, x: 20 }, { ...motion(31, 2), epoch: 1 }, true, 1000)
    prediction.sample(1000, p); expect(p.x).toBe(20)
    prediction.reconcile('one', origin, undefined, true, 1001)
    expect(prediction.sample(1001, p)).toBe(false)
    prediction.reconcile('two', origin, motion(), false, 1002)
    expect(prediction.sample(1002, p)).toBe(false)
    prediction.reset()
  })
  it('does not wait for a new broadcast after a long stationary period', async () => {
    const { prediction } = await ready()
    prediction.intend(walk, 5000)
    const p = { ...origin }; prediction.sample(5017, p)
    expect(p.x).toBeGreaterThan(origin.x)
    prediction.reset()
  })
  it('cannot reopen the speculation deadline by stopping and starting without a new server confirmation', async () => {
    const { prediction } = await ready()
    prediction.intend(walk, 0); prediction.sentInput(1, 0)
    const p = { ...origin }; prediction.sample(250, p)
    prediction.intend(stop, 250); prediction.sentInput(2, 250)
    prediction.intend(walk, 251); prediction.sentInput(3, 251); prediction.sample(501, p)
    expect(p.x).toBeCloseTo(origin.x + 6.25 * .25)
    prediction.reset()
  })
  it('consumes jump once across render frames and disposes late async initialization', async () => {
    const { prediction, sim } = await ready()
    prediction.intend({ ...stop, jump: true }, 0)
    const p = { ...origin }; prediction.sample(17, p); prediction.sample(34, p)
    expect(sim.jumps).toBe(1)
    prediction.reset(); expect(sim.disposed).toBe(true)
    let resolve!: (s: PredictionSimulation) => void
    const late = new FlatSimulation()
    const pending = new LocalMovementPrediction(() => new Promise(r => { resolve = r }))
    pending.reconcile('old', origin, motion(), true, 0)
    const initializing = pending.prepare(); pending.reset(); resolve(late); await initializing
    expect(late.disposed).toBe(true); expect(pending.ready).toBe(false)
  })
})
describe('the actual shared-map collision predictor', () => {
  it('walks at the configured speed and respects the playable boundary and the floor', async () => {
    const sim = await createPredictionPhysics()
    try {
      const [x, y, z] = spawnPosition(0)
      sim.reset({ x, y, z, yaw: 0 }, 0, true)
      for (let i = 0; i < 6; i++) sim.step(walk, 1 / 60)
      expect(sim.pose().x - x).toBeCloseTo(.625, 2)
      const limit = WORLD.halfSize - WORLD.boundaryHalfDepth - MOVEMENT.radius - MOVEMENT.offset
      sim.reset({ x: limit - .05, y: groundHeight(limit - .05, 0) + .8, z: 0, yaw: 0 }, 0, true)
      for (let i = 0; i < 60; i++) sim.step(walk, 1 / 60)
      expect(sim.pose().x).toBeLessThanOrEqual(limit + .001)
      expect(sim.pose().y).toBeGreaterThan(groundHeight(limit, 0) + .6)
    } finally { sim.dispose() }
  })
})
