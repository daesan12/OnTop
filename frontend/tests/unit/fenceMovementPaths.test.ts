import { expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PredictionSimulation } from '../../src/network/localMovementPrediction'
vi.stubEnv('VITE_PARK_MAP', 'generated'); vi.stubEnv('MODE', 'park-integration'); vi.resetModules()
const { createPredictionPhysics } = await import('../../src/network/predictionPhysics')
const { LocalMovementPrediction } = await import('../../src/network/localMovementPrediction')
const { PARK_DATA } = await import('../../src/map/park')
const { useJumpmap } = await import('../../src/features/jumpmap/state')

type Scenario = { id: string; mode: 'repeat' | 'cross' | 'along' | 'depart' | 'end'; run: boolean;
  phase: number; period?: number; hz?: number; interval?: number; seconds?: number; dense?: boolean }
function scenarios(): Scenario[] {
  const list: Scenario[] = []
  for (const phase of [0, 10, 20, 30, 40, 50]) for (const period of [19, 23, 27, 31]) {
    list.push({ id: 'court-P0-east--10.5', mode: 'repeat', run: true, phase, period })
  }
  for (const id of ['court-P0-east--10.5', 'court-P0-north--13', 'court-P1-west--8.5', 'hall-court-east-6.75'])
    for (const mode of ['cross', 'along', 'depart', 'end'] as const) for (const run of [false, true]) for (const phase of [0, 15, 30, 45]) {
      list.push({ id, mode, run, phase, seconds: 3 })
    }
  for (const id of ['court-P0-east--10.5', 'hall-court-east-6.75']) for (const hz of [30, 60, 144])
    for (const interval of [60, 90, 120]) for (const phase of [0, 15, 30, 45]) {
      list.push({ id, mode: 'end', run: true, phase, hz, interval, seconds: 1.2 })
    }
  return list
}
const name = (s: Scenario) => `${s.id}/${s.mode}/${s.run ? 'run' : 'walk'}/phase-${s.phase}/period-${s.period ?? 0}/hz-${s.hz ?? 60}/report-${s.interval ?? 60}${s.dense ? '/dense' : ''}`

function delayedScenarios(): Scenario[] {
  const list: Scenario[] = []
  for (const id of ['court-P0-east--10.5', 'hall-court-east-6.75']) for (const run of [false, true])
    for (const phase of [0, 45]) for (const hz of [60, 144]) for (const interval of [250, 500, 1000]) {
      list.push({ id, mode: 'end', run, phase, hz, interval, seconds: 6 })
    }
  for (const phase of [0, 45]) for (const period of [19, 23, 27]) for (const hz of [60, 144]) for (const interval of [250, 500, 1000]) {
    list.push({ id: 'court-P0-east--10.5', mode: 'repeat', run: true, phase, period, hz, interval, seconds: 6 })
  }
  for (const id of ['court-P0-east--10.5', 'hall-court-east-6.75']) for (const run of [false, true]) {
    list.push({ id, mode: 'end', run, phase: 0, hz: 1000, interval: 1000, seconds: 3.2, dense: true })
  }
  list.push({ id: 'court-P0-east--10.5', mode: 'repeat', run: true, phase: 0, period: 23, hz: 1000, interval: 1000, seconds: 3.2, dense: true })
  return list
}

async function trace(s: Scenario) {
  useJumpmap.setState({ available: true })
  const sim = await createPredictionPhysics('PARK_V1'), box = PARK_DATA.physics.boxes.find(b => b.id === s.id)!
  let now = 0
  let steps = 0
  // Keep every sample for the cap stress case. Actual Rapier geometry/jump physics
  // stay unchanged; this local compression hint is never sent to the server.
  const recording: PredictionSimulation = s.dense ? {
    reset: (...args) => { steps = 0; sim.reset(...args) }, step: (input, dt) => { steps++; sim.step(input, dt) },
    pose: () => sim.pose(), setChairs: counts => sim.setChairs(counts), dispose: () => sim.dispose(),
    setMotionProfile: profile => sim.setMotionProfile?.(profile), stepJumped: () => sim.stepJumped!(), stepSupported: () => steps % 2 === 0,
  } : sim
  const prediction = new LocalMovementPrediction(async () => recording, () => now)
  try {
    const normal = { x: Math.cos(box.yaw), z: -Math.sin(box.yaw) }, tangent = { x: Math.sin(box.yaw), z: Math.cos(box.yaw) }
    const origin = { x: box.center[0], y: box.center[1] + box.half[1] + .8, z: box.center[2], yaw: 0 }
    if (s.mode === 'cross') { origin.x -= normal.x * 2; origin.z -= normal.z * 2; origin.y = 1.1 }
    if (s.mode === 'end') { origin.x += tangent.x * (box.half[2] - .5); origin.z += tangent.z * (box.half[2] - .5) }
    sim.setChairs(new Map(PARK_DATA.tables.map(t => [t.id, 2])))
    sim.reset(origin, 0, s.mode !== 'cross')
    for (let n = 0; n < (s.mode === 'repeat' ? 6 : 90); n++) sim.step({ dx: 0, dz: 0, run: false, jump: false }, 1 / 60)
    const initial = sim.pose(), hz = s.hz ?? 60, interval = (s.interval ?? 60) / 1000, seconds = s.seconds ?? 6
    const motion = { epoch: 1, tick: 0, appliedInputSeq: 0, inputAgeMs: 0, velocityY: 0,
      grounded: sim.stepSupported?.() ?? true, inputActive: true, authority: 'CLIENT_VALIDATED' as const, profile: 'PARK_V1' as const }
    prediction.reconcile('fence', initial, motion, true, 0); await prediction.prepare()
    let frame = 0, frameAt = 1 / hz, reportAt = interval + s.phase / 1000, sequence = 0, rawJump = false
    const reports = []
    const input = () => {
      const direction = s.mode === 'repeat' ? { x: Math.floor(frame / 90) % 2 ? -1 : 1, z: 0 }
        : s.mode === 'cross' || s.mode === 'depart' ? normal : tangent
      const jump = s.mode === 'repeat' ? frame % s.period! === 0 : s.mode === 'cross' && frame === (s.run ? 10 : 14)
      rawJump ||= jump
      const intent = { dx: direction.x, dz: direction.z, run: s.run, jump }
      prediction.intend(intent, now)
      return intent
    }
    let intent = input()
    while (now < seconds * 1000 - .0001) {
      const end = Math.min(frameAt, reportAt, seconds)
      now = end * 1000
      prediction.sample(now, { ...initial })
      if (Math.abs(end - reportAt) < 1e-8) {
        const sent = { ...intent, jump: rawJump }
        prediction.sentInput(++sequence, now, sent)
        const payload = prediction.positionReport(sequence, sent, now)!
        reports.push({ at: end, payload })
        const beforeAck = sim.pose()
        prediction.reconcile('fence', payload, { ...motion, tick: sequence, appliedInputSeq: sequence }, true, now)
        expect(sim.pose()).toEqual(beforeAck)
        rawJump = false; reportAt += interval
      }
      if (Math.abs(end - frameAt) < 1e-8) { frame++; frameAt = (frame + 1) / hz; intent = input() }
    }
    return { scenario: name(s), initial, reports }
  } finally { prediction.reset() }
}

it('records the intermediate support and actual buffered takeoff in previously rejected fence trajectories', async () => {
  const cases = scenarios().filter(s => s.mode === 'repeat' && s.period === 23 && s.phase === 10
    || s.mode === 'repeat' && s.period === 19 && s.phase === 0
    || s.mode === 'end' && !s.run && s.phase === 45)
  for (const scenario of cases) {
    const result = await trace(scenario)
    expect(result.reports.every(r => r.payload.path && r.payload.path.length <= 64)).toBe(true)
    if (scenario.mode === 'repeat') expect(result.reports.some(r => r.payload.path?.some(p => p.jump))).toBe(true)
  }
})

it('keeps a full real-physics path while reports are held, with no reset when delivery resumes', async () => {
  const result = await trace(delayedScenarios().find(s => s.dense && s.mode === 'end')!)
  expect(result.reports[0]!.payload.path).toHaveLength(64)
  expect(result.reports.every(r => r.payload.path && r.payload.path.length <= 64)).toBe(true)
  for (const report of result.reports) {
    expect(report.payload.path!.at(-1)).toMatchObject({ x: report.payload.x, y: report.payload.y, z: report.payload.z })
  }
})

it.skipIf(!process.env.FENCE_BACKPRESSURE_DIR)('exports delayed reports and full 64-sample real-physics paths', async () => {
  const traces = []
  for (const scenario of delayedScenarios()) traces.push(await trace(scenario))
  mkdirSync(process.env.FENCE_BACKPRESSURE_DIR!, { recursive: true })
  writeFileSync(join(process.env.FENCE_BACKPRESSURE_DIR!, 'backpressure-paths.json'), JSON.stringify(traces))
  expect(traces).toHaveLength(89)
}, 120000)

it.skipIf(!process.env.FENCE_MOVEMENT_DIR)('exports the original 224-case matrix through the real position-report collector', async () => {
  const traces = []
  for (const scenario of scenarios()) traces.push(await trace(scenario))
  mkdirSync(process.env.FENCE_MOVEMENT_DIR!, { recursive: true })
  writeFileSync(join(process.env.FENCE_MOVEMENT_DIR!, 'position-paths.json'), JSON.stringify(traces))
  expect(traces).toHaveLength(224)
}, 120000)
