import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { LocalMovementPrediction, type MotionSnapshot } from '../../src/network/localMovementPrediction'
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import type { MovementIntent } from '../../src/network/movementInput'
import type { Pose } from '../../src/network/worldClient'
import { installMovementAblation, movementQuality, type AblationMode, type QualityFrame } from '../diagnostics/movementAblation'

type State = Pose & { motion: MotionSnapshot }
type Trace = { scenario: string; oneWayMs: number; initial: State; duration: number
  frames: { at: number; state: State; receiptSeq?: number }[]
  commands: { at: number; seq: number; intent: MovementIntent }[]; intents: { at: number; intent: MovementIntent }[] }
const directory = process.env.MOVEMENT_AB_DIR
it.skipIf(!directory)('isolates display correction from reset/replay on the same real Bullet input and snapshots', async () => {
  const traces = JSON.parse(readFileSync(join(directory!, 'bullet-traces.json'), 'utf8')) as Trace[], results = []
  for (const trace of traces) for (const mode of ['baseline', 'no-offset', 'no-replay'] as AblationMode[]) {
    const prediction = new LocalMovementPrediction(createPredictionPhysics, () => 0)
    prediction.reconcile('ab', trace.initial, trace.initial.motion, true, 0); await prediction.prepare()
    const experiment = installMovementAblation(prediction, mode)
    const pose = { ...trace.initial }, samples: QualityFrame[] = []
    let official = trace.initial, intent: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }, changedAt = 0
    let maximumResetDelta = 0
    const events = [
      ...trace.frames.map(frame => ({ at: frame.at, run: () => {
        prediction.sample(frame.at, pose)
        const before = experiment.snapshot().predicted!
        official = frame.state
        if (frame.receiptSeq !== undefined) prediction.receivedInput(frame.receiptSeq, frame.at)
        prediction.reconcile('ab', official, official.motion, true, frame.at)
        const after = experiment.snapshot().predicted!
        maximumResetDelta = Math.max(maximumResetDelta, Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z))
      } })),
      ...trace.intents.map(input => ({ at: input.at, run: () => {
        if (input.intent.dx !== intent.dx || input.intent.dz !== intent.dz || input.intent.run !== intent.run) changedAt = input.at
        intent = input.intent; prediction.intend(intent, input.at)
      } })),
      ...trace.commands.map(input => ({ at: input.at, run: () => prediction.sentInput(input.seq, input.at, input.intent) })),
    ].sort((a, b) => a.at - b.at)
    let next = 0
    for (let frame = 0; frame <= Math.ceil(trace.duration * .06); frame++) {
      const at = frame * 1000 / 60
      while (next < events.length && events[next]!.at <= at) events[next++]!.run()
      prediction.sample(at, pose)
      samples.push({ at, display: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw },
        predicted: experiment.snapshot().predicted!, intent: { ...intent }, changedAt })
    }
    const state = experiment.snapshot(), last = samples.at(-1)!
    if (mode === 'baseline') expect(prediction.ready).toBe(true)
    if (mode === 'no-replay') expect(state.ordinaryResets).toBe(0)
    results.push({ scenario: trace.scenario, rttMs: trace.oneWayMs * 2, mode, ...movementQuality(samples),
      maximumResetDelta, ordinaryResets: state.ordinaryResets,
      finalOfficialErrorM: Math.hypot(last.display.x - official.x, last.display.y - official.y, last.display.z - official.z), samples })
    experiment.dispose(); prediction.reset()
  }
  writeFileSync(join(directory!, 'ab-results.json'), JSON.stringify({
    scope: 'Test-only ablations of actual Rapier predictor against identical Java Bullet traces at 60Hz. A disables display offset but keeps resets/speed cap; B builds on A and also disables ordinary same-epoch reset/replay while retaining freshness and epoch/activity handling. Compare A/B to isolate reset/replay. Not deployment, security approval, or human smoothness rating.', results,
  }, null, 2))
  console.log(results.filter(x => x.rttMs === 100 && ['sprint', 'shift', 'strafe', 'jump-pad'].includes(x.scenario))
    .map(({ samples: _samples, ...result }) => result))
}, 90_000)
