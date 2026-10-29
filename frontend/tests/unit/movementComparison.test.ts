import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { LocalMovementPrediction, type MotionSnapshot } from '../../src/network/localMovementPrediction'
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import { sampleMovement, samePose } from '../../src/world/movementPresentation'
import type { Pose } from '../../src/network/worldClient'
import type { MovementIntent } from '../../src/network/movementInput'

interface State extends Pose { motion: MotionSnapshot }
interface Trace { scenario: string; oneWayMs: number; initial: State
  commands: { at: number; seq: number; intent: MovementIntent }[]
  frames: { at: number; state: State }[] }
const directory = process.env.MOVEMENT_COMPARISON_DIR
it.skipIf(!directory)('compares the unchanged presenter and predictor against identical real Bullet traces', async () => {
  const traces = JSON.parse(readFileSync(join(directory!, 'bullet-traces.json'), 'utf8')) as Trace[]
  const results = []
  for (const trace of traces) {
    const prediction = new LocalMovementPrediction(createPredictionPhysics, () => 0)
    prediction.reconcile('trace', trace.initial, trace.initial.motion, true, 0)
    await prediction.prepare()
    expect(prediction.ready).toBe(true)
    let baseline = { previous: trace.initial as Pose, current: trace.initial as Pose, at: 0 }
    const predicted = { ...trace.initial }, before = { ...trace.initial }
    let command = 0, frame = 0, beforeResponse: number | null = null, predictedResponse: number | null = null
    const samples: { at: number; before: Pose; after: Pose; authoritative: Pose }[] = []
    let official = trace.initial
    for (let index = 0; index <= 108; index++) {
      const at = index * 1000 / 60
      while (frame < trace.frames.length && trace.frames[frame]!.at <= at) {
        const incoming = trace.frames[frame++]!
        sampleMovement(baseline, incoming.at, 120, before)
        if (!samePose(baseline.current, incoming.state)) baseline = {
          previous: { ...before }, current: incoming.state, at: incoming.at }
        official = incoming.state
        prediction.reconcile('trace', incoming.state, incoming.state.motion, true, incoming.at)
      }
      while (command < trace.commands.length && trace.commands[command]!.at <= at) {
        const input = trace.commands[command++]!
        prediction.intend(input.intent, input.at); prediction.sentInput(input.seq, input.at)
      }
      sampleMovement(baseline, at, 120, before)
      prediction.sample(at, predicted)
      if (at >= 100 && beforeResponse === null && Math.abs(before.x - trace.initial.x) > .01) beforeResponse = at - 100
      if (at >= 100 && predictedResponse === null && Math.abs(predicted.x - trace.initial.x) > .01) predictedResponse = at - 100
      samples.push({ at, before: { x: before.x, y: before.y, z: before.z, yaw: before.yaw },
        after: { x: predicted.x, y: predicted.y, z: predicted.z, yaw: predicted.yaw },
        authoritative: { x: official.x, y: official.y, z: official.z, yaw: official.yaw } })
    }
    expect(predictedResponse).not.toBeNull()
    expect(predictedResponse!).toBeLessThanOrEqual(17)
    if (trace.oneWayMs > 0) expect(beforeResponse!).toBeGreaterThan(predictedResponse!)
    const metrics = prediction.metrics()
    results.push({ scenario: trace.scenario, roundTripMs: trace.oneWayMs * 2, beforeFirstResponseMs: beforeResponse,
      afterFirstResponseMs: predictedResponse, maxCorrectionM: Math.max(0, ...metrics.correctionMetres),
      hardCorrections: metrics.hardCorrections, samples })
    prediction.reset()
  }
  writeFileSync(join(directory!, 'comparison-results.json'), JSON.stringify({ scope: 'Controlled 60Hz FE replay of actual Java Bullet traces; warm collision world. Not production/user input latency.', results }, null, 2))
  console.log(results.map(({ samples: _samples, ...rest }) => rest))
}, 45_000)
