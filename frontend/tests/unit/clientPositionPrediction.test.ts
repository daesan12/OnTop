import { expect, it } from 'vitest'
import { LocalMovementPrediction, type PredictionSimulation } from '../../src/network/localMovementPrediction'

const origin = { x: 0, y: .84, z: 0, yaw: 0 }
const motion = { epoch: 1, tick: 0, appliedInputSeq: 0, inputAgeMs: 0,
  velocityY: 0, grounded: true, inputActive: true, authority: 'CLIENT_VALIDATED' as const }
const tuned = { ...motion, profile: 'PARK_V1' as const }
const stop = { dx: 0, dz: 0, run: false, jump: false }

it('compresses straight reports and clears old path samples on a correction epoch', async () => {
  let p = { ...origin }
  const simulation: PredictionSimulation = { reset(pose) { p = { ...pose } },
    step(input, seconds) { p.x += input.dx * 6 * seconds }, pose: () => ({ ...p }),
    stepJumped: () => false, stepSupported: () => true, setChairs() {}, dispose() {} }
  const prediction = new LocalMovementPrediction(async () => simulation, () => 0)
  prediction.reconcile('path', origin, tuned, true, 0); await prediction.prepare()
  const walk = { ...stop, dx: 1 }
  prediction.intend(walk, 0)
  const report = prediction.positionReport(1, walk, 60)!
  expect(report.path).toEqual([{ x: report.x, y: report.y, z: report.z, jump: false }])
  prediction.sample(100, { ...origin })
  prediction.reconcile('path', { ...origin, x: 2 }, { ...tuned, epoch: 2, tick: 1, correctionReason: 'COLLISION' }, true, 100)
  expect(prediction.positionReport(2, walk, 100)?.path).toEqual([{ x: 2, y: origin.y, z: origin.z, jump: false }])
  expect(prediction.positionReport(3, walk, 160)?.path?.every(point => point.x >= 2)).toBe(true)
  prediction.reset()
})

it('reports an actual buffered takeoff and its preceding landing even when the raw jump key is no longer pressed', async () => {
  let p = { ...origin }, steps = 0
  const simulation: PredictionSimulation = { reset(pose) { p = { ...pose }; steps = 0 },
    step() { steps++; p.y = steps === 1 ? 1.1 : steps === 2 ? .84 : 1.2 }, pose: () => ({ ...p }),
    stepJumped: () => steps === 3, stepSupported: () => steps === 2, setChairs() {}, dispose() {} }
  const prediction = new LocalMovementPrediction(async () => simulation, () => 0)
  prediction.reconcile('path', origin, tuned, true, 0); await prediction.prepare()
  prediction.intend({ ...stop, jump: true }, 0)
  prediction.intend(stop, 10)
  const report = prediction.positionReport(1, stop, 60)!
  expect(report.jump).toBe(false)
  const takeoff = report.path!.findIndex(point => point.jump)
  expect(takeoff).toBeGreaterThan(0)
  expect(report.path![takeoff - 1]?.y).toBe(.84)
  expect(report.path?.every(point => !('supported' in point))).toBe(true)
  expect(prediction.positionReport(2, stop, 120)).toEqual(report)
  prediction.reconcile('path', origin, { ...tuned, tick: 4 }, true, 120)
  expect(prediction.positionReport(3, stop, 180)).toEqual(report)
  prediction.reconcile('path', report, { ...tuned, tick: 6, appliedInputSeq: 1 }, true, 180)
  expect(prediction.positionReport(4, stop, 180)?.seq).toBe(4)
  expect(prediction.positionReport(5, stop, 180)?.path?.some(point => point.jump)).toBe(false)
  prediction.reset()
})

it('retains all 64 samples and holds before overflow, then resumes without catching up elapsed wall time', async () => {
  let p = { ...origin }, steps = 0
  const simulation: PredictionSimulation = { reset(pose) { p = { ...pose } },
    step() { steps++; p.x += .001; p.y += steps % 2 ? .001 : -.001 }, pose: () => ({ ...p }),
    stepJumped: () => steps === 31, stepSupported: () => steps % 2 === 0, setChairs() {}, dispose() {} }
  const prediction = new LocalMovementPrediction(async () => simulation, () => 0)
  prediction.reconcile('path', origin, tuned, true, 0); await prediction.prepare()
  for (let time = 1; time <= 1000; time++) prediction.sample(time, { ...origin })
  expect(steps).toBe(64)
  const report = prediction.positionReport(1, stop, 1000)!
  expect(report.path).toHaveLength(64)
  expect(report.path![30]?.jump).toBe(true)
  expect(report.path!.at(-1)).toMatchObject({ x: report.x, y: report.y, z: report.z })
  prediction.reconcile('path', report, { ...tuned, tick: 1, appliedInputSeq: 1 }, true, 1000)
  const held = report.x
  const resumed = prediction.positionReport(2, stop, 1060)!
  expect(resumed.path!.length).toBeLessThanOrEqual(4)
  expect(resumed.x - held).toBeCloseTo(.004)
  expect(steps).toBe(68)
  prediction.reset()
})

it('bounds a delayed straight batch by physical duration even when it compresses to one sample', async () => {
  let p = { ...origin }
  const simulation: PredictionSimulation = { reset(pose) { p = { ...pose } },
    step(input, seconds) { p.x += input.dx * 6 * seconds }, pose: () => ({ ...p }),
    stepJumped: () => false, stepSupported: () => true, setChairs() {}, dispose() {} }
  const prediction = new LocalMovementPrediction(async () => simulation, () => 0)
  prediction.reconcile('path', origin, tuned, true, 0); await prediction.prepare()
  const walk = { ...stop, dx: 1 }
  prediction.intend(walk, 0)
  for (let time = 10; time <= 1000; time += 10) prediction.sample(time, { ...origin })
  const held = prediction.positionReport(1, walk, 1000)!
  expect(held.x).toBeCloseTo(.6)
  expect(held.path).toHaveLength(1)
  const resumed = prediction.positionReport(2, walk, 1060)!
  expect(resumed.x - held.x).toBeCloseTo(.36)
  prediction.reset()
})
it('holds unconfirmed travel across multiple sent reports and resumes on a fresh approval', async () => {
  let p = { ...origin }
  const simulation: PredictionSimulation = {
    reset(pose) { p = { ...pose } },
    step(input, seconds) { p.x += input.dx * 6 * seconds },
    pose: () => ({ ...p }),
    stepJumped: () => false, stepSupported: () => true, setChairs() {}, dispose() {},
  }
  const prediction = new LocalMovementPrediction(async () => simulation, () => 0)
  prediction.reconcile('path', origin, tuned, true, 0)
  await prediction.prepare()
  const walk = { ...stop, dx: 1 }
  prediction.intend(walk, 0)
  let held = origin.x
  for (let seq = 1; seq <= 15; seq++) {
    held = prediction.positionReport(seq, walk, seq * 60)!.x
  }
  expect(held).toBeCloseTo(1.68)
  prediction.reconcile('path', origin, { ...tuned, tick: 28 }, true, 900)
  expect(prediction.positionReport(16, walk, 960)?.x).toBeCloseTo(held)
  prediction.reconcile('path', { ...origin, x: held }, { ...tuned, tick: 29, appliedInputSeq: 16 }, true, 960)
  expect(prediction.positionReport(17, walk, 1020)?.x).toBeCloseTo(held + .36)
  prediction.reset()
})

it('approved old position only renews the lease; it never resets/replays newer local physics', async () => {
  let resets = 0, p = { ...origin }
  const simulation: PredictionSimulation = {
    reset(pose) { resets++; p = { ...pose } },
    step(input, seconds) { p.x += input.dx * 9 * seconds },
    pose() { return { ...p } }, setChairs() {}, dispose() {},
  }
  const predictor = new LocalMovementPrediction(async () => simulation, () => 0)
  predictor.reconcile('room', origin, motion, true, 0)
  await predictor.prepare()
  const run = { dx: 1, dz: 0, run: true, jump: false }
  predictor.intend(run, 0)
  expect(predictor.positionReport(1, run, 100)?.x).toBeCloseTo(.9)
  predictor.reconcile('room', { ...origin, x: .9 }, { ...motion, tick: 3, appliedInputSeq: 1 }, true, 200)
  expect(predictor.positionReport(2, run, 200)?.x).toBeCloseTo(1.8)
  expect(resets).toBe(1)
  predictor.reconcile('room', origin, { ...motion, epoch: 2, tick: 4 }, true, 210)
  expect(resets).toBe(2)
  expect(predictor.positionReport(3, run, 210)?.x).toBe(0)
})
it('legacy input mode never emits a position report', async () => {
  const predictor = new LocalMovementPrediction(async () => ({ reset() {}, step() {}, pose: () => origin, setChairs() {}, dispose() {} }))
  predictor.reconcile('room', origin, { ...motion, authority: undefined }, true, 0)
  await predictor.prepare()
  expect(predictor.positionReport(1, { dx: 0, dz: 0, run: false, jump: false }, 0)).toBeUndefined()
})
it('WASM failure produces an explicit generation-bound fallback instead of silently sending ignored inputs', async () => {
  const predictor = new LocalMovementPrediction(async () => { throw new Error('WASM unavailable') }, () => 0)
  predictor.reconcile('room', origin, motion, true, 0)
  expect(predictor.positionPreparing).toBe(true)
  await predictor.prepare()
  expect(predictor.positionPreparing).toBe(false)
  expect(predictor.positionFallback()).toEqual({ epoch: 1 })
  predictor.reconcile('room', origin, { ...motion, authority: undefined, epoch: 2 }, true, 100)
  expect(predictor.positionFallback()).toBeUndefined()
})
it('initial WASM preparation does not replay time spent loading before the first report', async () => {
  let clock = 0, p = { ...origin }
  let complete!: (simulation: PredictionSimulation) => void
  const predictor = new LocalMovementPrediction(() => new Promise(resolve => { complete = resolve }), () => clock)
  predictor.reconcile('room', origin, motion, true, 0)
  clock = 2000
  complete({ reset(pose) { p = { ...pose } }, step(input, seconds) { p.x += input.dx * 9 * seconds },
    pose: () => ({ ...p }), setChairs() {}, dispose() {} })
  await predictor.prepare()
  const run = { dx: 1, dz: 0, run: true, jump: false }
  predictor.intend(run, clock)
  expect(predictor.positionReport(1, run, 2060)?.x).toBeCloseTo(.54)
})
it('other users broadcasts and duplicate confirmations never renew a missing upstream report lease', async () => {
  let p = { ...origin }
  const predictor = new LocalMovementPrediction(async () => ({ reset(pose) { p = { ...pose } },
    step(input, seconds) { p.x += input.dx * 9 * seconds }, pose: () => ({ ...p }), setChairs() {}, dispose() {} }), () => 0)
  predictor.reconcile('room', origin, motion, true, 0); await predictor.prepare()
  const run = { dx: 1, dz: 0, run: true, jump: false }
  predictor.intend(run, 0)
  for (const time of [200, 400, 600, 800]) {
    predictor.reconcile('room', origin, { ...motion, tick: time / 10 }, true, time)
    predictor.positionReport(time, run, time)
  }
  expect(p.x).toBeCloseTo(4.5)
  predictor.intend({ ...run, dx: 0 }, 900); predictor.intend(run, 950)
  predictor.positionReport(999, run, 1000)
  expect(p.x).toBeCloseTo(4.5)
})
