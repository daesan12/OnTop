import { expect, it, vi } from 'vitest'
import type { PredictionSimulation } from '../../src/network/localMovementPrediction'
vi.stubEnv('VITE_PARK_MAP', 'generated'); vi.stubEnv('MODE', 'park-integration'); vi.resetModules()
const { createPredictionPhysics } = await import('../../src/network/predictionPhysics')
const { LocalMovementPrediction } = await import('../../src/network/localMovementPrediction')
const { PARK_DATA } = await import('../../src/map/park')
const stop = { dx: 0, dz: 0, run: false, jump: false }
const motion = { epoch: 1, tick: 0, appliedInputSeq: 0, inputAgeMs: 0, velocityY: 0,
  grounded: true, inputActive: true, authority: 'CLIENT_VALIDATED' as const, profile: 'PARK_V1' as const }

it('keeps manual walk/run presentation against real fences while physical movement stays blocked', async () => {
  for (const id of ['court-P0-east--10.5', 'hall-court-east-6.75']) for (const run of [false, true]) {
    const sim = await createPredictionPhysics('PARK_V1'), box = PARK_DATA.physics.boxes.find(b => b.id === id)!
    let now = 0, seq = 0
    const prediction = new LocalMovementPrediction(async () => sim, () => now)
    const normal = { dx: Math.cos(box.yaw), dz: -Math.sin(box.yaw) }
    try {
      sim.setChairs(new Map(PARK_DATA.tables.map(t => [t.id, 2])))
      sim.reset({ x: box.center[0] - normal.dx * (box.half[0] + .8), y: .84,
        z: box.center[2] - normal.dz * (box.half[0] + .8), yaw: 0 }, 0, true)
      for (let n = 0; n < 90; n++) sim.step(stop, 1 / 60)
      const initial = sim.pose()
      prediction.reconcile('contact', initial, motion, true, 0); await prediction.prepare()
      let intent = { ...normal, run, jump: false }
      prediction.intend(intent, now)
      const step = (frames: number) => {
        for (let n = 0; n < frames; n++) {
          now += 1000 / 60
          prediction.sample(now, { ...initial })
          if (n % 3 === 2) {
            const report = prediction.positionReport(++seq, intent, now)!
            prediction.reconcile('contact', report, { ...motion, tick: seq, appliedInputSeq: seq }, true, now)
          }
        }
      }
      step(180)
      const contact = sim.pose()
      step(60)
      expect(Math.hypot(sim.pose().x - contact.x, sim.pose().z - contact.z)).toBeLessThan(.01)
      expect(sim.movementFlags?.()).toEqual({ moving: false, running: false })
      expect(prediction.displayFlags(now)).toEqual({ moving: true, running: run })
      // Shift alone never strides; key release takes effect before another physical step.
      prediction.intend({ ...stop, run: true }, now)
      expect(prediction.displayFlags(now)).toEqual({ moving: false, running: false })
      intent = { dx: -normal.dx, dz: -normal.dz, run, jump: false }
      prediction.intend(intent, now); step(30)
      expect(Math.hypot(sim.pose().x - contact.x, sim.pose().z - contact.z)).toBeGreaterThan(.3)
      expect(prediction.displayFlags(now)).toEqual({ moving: true, running: run })
      prediction.suspend()
      expect(prediction.displayFlags(now)).toEqual({ moving: false, running: false })
    } finally { prediction.reset() }
  }
})

it('keeps air/surface and automatic-follow flags physical, and stops presentation on release or lease expiry', async () => {
  let grounded = true, physical = { moving: false, running: false }
  const initial = { x: 0, y: .84, z: 0, yaw: 0 }
  const sim: PredictionSimulation = { reset() {}, step() {}, pose: () => ({ ...initial }),
    groundedForLocomotion: () => grounded, movementFlags: () => physical, setChairs() {}, dispose() {} }
  const prediction = new LocalMovementPrediction(async () => sim, () => 0)
  try {
    prediction.reconcile('scope', initial, { ...motion, steering: { dx: 1, dz: 0, run: true, targetX: 2, targetZ: 0 } }, true, 0)
    await prediction.prepare()
    expect(prediction.displayFlags(0)).toEqual(physical)
    prediction.intend({ ...stop, dx: 1, run: true }, 0)
    expect(prediction.displayFlags(0)).toEqual({ moving: true, running: true })
    grounded = false
    expect(prediction.displayFlags(0)).toEqual(physical)
    physical = { moving: true, running: true }
    expect(prediction.displayFlags(0)).toEqual(physical)
    grounded = true
    prediction.intend(stop, 0)
    expect(prediction.displayFlags(0)).toEqual({ moving: false, running: false })
    prediction.intend({ ...stop, dx: 1, run: true }, 0)
    expect(prediction.displayFlags(2001)).toEqual({ moving: false, running: false })
    prediction.reconcile('scope', initial, { ...motion, profile: undefined }, true, 2010)
    physical = { moving: false, running: false }
    prediction.intend({ ...stop, dx: 1, run: true }, 2010)
    expect(prediction.displayFlags(2010)).toEqual(physical)
  } finally { prediction.reset() }
})
