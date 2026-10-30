import { describe, expect, it } from 'vitest'
import { LocalMovementPrediction, type MotionSnapshot, type PredictionSimulation } from '../../src/network/localMovementPrediction'
import type { MovementIntent } from '../../src/network/movementInput'
import { sampleMovement } from '../../src/world/movementPresentation'
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import { groundHeight, MOVEMENT, spawnPosition, WORLD, WORLD_COLLIDERS, VR_COURSE_PADS } from '../../src/config'

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
class JumpSimulation extends FlatSimulation {
  vy = 0
  reset(pose: typeof origin, velocityY = 0) { super.reset(pose); this.vy = velocityY }
  step(intent: MovementIntent, seconds: number) {
    super.step(intent, seconds)
    if (intent.jump) this.vy = 6.2
    this.vy -= 18 * seconds
    this.p.y = Math.max(origin.y, this.p.y + this.vy * seconds)
  }
}
async function ready(pose = origin) {
  const sim = new FlatSimulation()
  const prediction = new LocalMovementPrediction(async () => sim, () => 0)
  prediction.reconcile('one', pose, motion(), true, 0)
  await prediction.prepare()
  return { sim, prediction }
}
describe('own movement prediction; authority and other avatars stay separate', () => {
  it('records bounded request RTT diagnostics without shifting jump replay by a guessed half-RTT', async () => {
    const { prediction } = await ready()
    prediction.intend(walk, 100); prediction.sentInput(1, 100, walk)
    prediction.receivedInput(1, 200)
    prediction.reconcile('one', { ...origin, x: origin.x + .625 }, { ...motion(6, 1), inputAgeMs: 100 }, true, 300)
    expect(prediction.metrics().reconciliations.at(-1)).toMatchObject({ anchor: 200, roundTripMs: 100 })
    prediction.receivedInput(999, 301) // no matching pending input
    expect(prediction.metrics().roundTripMs).toEqual([100])
    prediction.reset(); expect(prediction.metrics().roundTripMs).toEqual([])
  })
  it('never turns a large same-epoch prediction error into a snap, but honours an explicit server relocation', async () => {
    const { prediction } = await ready(), p = { ...origin }
    prediction.intend(walk, 10); prediction.sentInput(1, 10)
    prediction.sample(100, p); const visible = { ...p }
    prediction.reconcile('one', { ...origin, x: origin.x + 4 }, motion(3, 1), true, 100)
    prediction.sample(100, p); expect(p.x).toBeCloseTo(visible.x)
    prediction.sample(116, p); expect(p.x - visible.x).toBeLessThanOrEqual(12.125 * .016 + .001)
    expect(prediction.metrics().hardCorrections).toBe(0)
    prediction.reconcile('one', { ...origin, x: 20 }, { ...motion(6, 1), epoch: 1 }, true, 200)
    prediction.sample(200, p); expect(p.x).toBe(20)
    expect(prediction.metrics().hardCorrections).toBe(1)
    prediction.reset()
  })
  it('does not replay a rejected jump when a later ordinary input is acknowledged', async () => {
    const sim = new JumpSimulation()
    const prediction = new LocalMovementPrediction(async () => sim, () => 0)
    prediction.reconcile('one', origin, motion(), true, 0); await prediction.prepare()
    prediction.intend({ ...stop, jump: true }, 20); prediction.sentInput(1, 20)
    prediction.sample(45, { ...origin }); prediction.reject(1)
    prediction.intend(stop, 60); prediction.sentInput(2, 60)
    prediction.reconcile('one', origin, { ...motion(3, 2), inputAgeMs: 40 }, true, 100)
    const p = { ...origin }; prediction.sample(220, p)
    expect(p.y).toBeCloseTo(origin.y)
    prediction.reset()
  })
  it('replays an unprocessed jump after a late pre-jump snapshot instead of dropping the ascent', async () => {
    const sim = new JumpSimulation()
    const prediction = new LocalMovementPrediction(async () => sim, () => 0)
    prediction.reconcile('one', origin, motion(), true, 0); await prediction.prepare()
    prediction.intend({ ...walk, jump: true }, 20); prediction.sentInput(1, 20)
    const p = { ...origin }; prediction.sample(65, p)
    expect(p.y).toBeGreaterThan(1)
    prediction.reconcile('one', origin, motion(1, 0), true, 70)
    prediction.sample(160, p)
    expect(p.y).toBeGreaterThan(1.3)
    prediction.reset()
  })
  it('does not turn an acknowledged jump into another jump after a grounded server confirmation', async () => {
    const sim = new JumpSimulation()
    const prediction = new LocalMovementPrediction(async () => sim, () => 0)
    prediction.reconcile('one', origin, motion(), true, 0); await prediction.prepare()
    prediction.intend({ ...stop, jump: true }, 20); prediction.sentInput(1, 20)
    prediction.sample(45, { ...origin })
    prediction.reconcile('one', origin, { ...motion(2, 1), inputAgeMs: 30 }, true, 70)
    const p = { ...origin }; prediction.sample(170, p)
    expect(p.y).toBeCloseTo(origin.y)
    prediction.reset()
  })
  it('keeps a small contact correction continuous without applying a second physical collision gate', async () => {
    const sim = Object.assign(new FlatSimulation(), { blocked: () => true })
    const prediction = new LocalMovementPrediction(async () => sim, () => 0)
    prediction.reconcile('one', origin, motion(), true, 0); await prediction.prepare()
    prediction.intend(walk, 0); prediction.sentInput(1, 0)
    const p = { ...origin }; prediction.sample(100, p); const visible = p.x
    prediction.reconcile('one', { ...origin, x: origin.x + .4 },
      { ...motion(3, 1), inputAgeMs: 100, inputActive: true }, true, 100)
    prediction.sample(100, p)
    expect(p.x).toBeCloseTo(visible)
    prediction.sample(190, p)
    expect(p.x).toBeCloseTo(origin.x + .4 + 6.25 * .09)
    prediction.reset()
  })
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
  it('converges to a confirmed platform landing even when the old display is below its underside', async () => {
    const sim = await createPredictionPhysics()
    const prediction = new LocalMovementPrediction(async () => sim, () => 0)
    try {
      const pad = VR_COURSE_PADS[5]!
      const below = { x: pad.x, y: pad.height - pad.thickness - MOVEMENT.halfHeight - MOVEMENT.radius - .05,
        z: pad.z, yaw: 0 }
      const landed = { ...below, y: pad.height + MOVEMENT.halfHeight + MOVEMENT.radius }
      prediction.reconcile('platform', below, { ...motion(), grounded: false, velocityY: -2 }, true, 0)
      await prediction.prepare()
      const displayed = { ...below }; prediction.sample(0, displayed)
      prediction.reconcile('platform', landed, motion(3, 0), true, 100)
      for (let frame = 7; frame <= 30; frame++) prediction.sample(frame * 1000 / 60, displayed)
      expect(Math.abs(displayed.y - landed.y)).toBeLessThan(.08)
      expect(Math.hypot(displayed.x - landed.x, displayed.z - landed.z)).toBeLessThan(.01)
    } finally { prediction.reset() }
  })
  it('keeps displayed running alongside a wall close to the physical controller', async () => {
    const sim = await createPredictionPhysics()
    const prediction = new LocalMovementPrediction(async () => sim, () => 0)
    try {
      const wall = WORLD_COLLIDERS.find(box => box.id === 'vr-pagoda-body')!
      const from = { x: wall.center[0] - wall.half[0] - MOVEMENT.radius - .001,
        y: .8, z: wall.center[2], yaw: 0 }
      prediction.reconcile('wall', from, motion(), true, 0); await prediction.prepare()
      prediction.sample(0, { ...from })
      prediction.intend({ dx: Math.SQRT1_2, dz: Math.SQRT1_2, run: true, jump: false }, 0)
      const displayed = { ...from }
      for (let frame = 1; frame <= 12; frame++) prediction.sample(frame * 1000 / 60, displayed)
      expect(displayed.z - from.z).toBeGreaterThan(1)
      expect(Math.abs(displayed.z - sim.pose().z)).toBeLessThan(.05)
    } finally { prediction.reset() }
  })
  it('retains physical wall blocking and platform support when display correction does not sweep', async () => {
    const sim = await createPredictionPhysics()
    try {
      const wall = WORLD_COLLIDERS.find(box => box.id === 'vr-pagoda-body')!
      const from = { x: wall.center[0] - wall.half[0] - MOVEMENT.radius - .1, y: 1.5, z: wall.center[2], yaw: 0 }
      sim.reset(from, 0, false)
      for (let frame = 0; frame < 60; frame++) sim.step({ dx: 1, dz: 0, run: true, jump: false }, 1 / 60)
      expect(sim.pose().x).toBeLessThan(wall.center[0] - wall.half[0] - MOVEMENT.radius + .01)
      const pad = VR_COURSE_PADS[5]!
      const above = { x: pad.x, y: pad.height + .8, z: pad.z, yaw: 0 }
      sim.reset(above, 0, false)
      for (let frame = 0; frame < 60; frame++) sim.step(stop, 1 / 60)
      expect(sim.pose().y).toBeGreaterThan(pad.height + .7)
    } finally { sim.dispose() }
  })
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
