import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { LocalMovementPrediction, type MotionSnapshot } from '../../src/network/localMovementPrediction'
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import { sampleMovement, samePose } from '../../src/world/movementPresentation'
import type { Pose } from '../../src/network/worldClient'
import type { MovementIntent } from '../../src/network/movementInput'

interface State extends Pose { motion: MotionSnapshot }
interface Trace { scenario: string; oneWayMs: number; initial: State
  commands: { at: number; seq: number; intent: MovementIntent }[]
  intents?: { at: number; intent: MovementIntent }[]
  frames: { at: number; state: State; receiptSeq?: number }[]; duration?: number }
const directory = process.env.MOVEMENT_COMPARISON_DIR
it.skipIf(!directory)('compares the unchanged presenter and predictor against identical real Bullet traces', async () => {
  const traces = JSON.parse(readFileSync(join(directory!, 'bullet-traces.json'), 'utf8')) as Trace[]
  const results = []
  const baselineModule = process.env.MOVEMENT_PREDICTION_BASELINE_MODULE
  const Prediction = baselineModule
    ? (await import(pathToFileURL(baselineModule).href)).LocalMovementPrediction as typeof LocalMovementPrediction
    : LocalMovementPrediction
  for (const trace of traces) {
    const prediction = new Prediction(createPredictionPhysics, () => 0)
    prediction.reconcile('trace', trace.initial, trace.initial.motion, true, 0)
    await prediction.prepare()
    expect(prediction.ready).toBe(true)
    let baseline = { previous: trace.initial as Pose, current: trace.initial as Pose, at: 0 }
    const predicted = { ...trace.initial }, before = { ...trace.initial }
    let beforeResponse: number | null = null, predictedResponse: number | null = null
    let sameFrameJump = 0
    const correctionJumps: { at: number; before: Pose; after: Pose; state: State }[] = []
    const events = [
      ...trace.frames.map(frame => ({ at: frame.at, receive: () => {
        prediction.sample(frame.at, predicted); const visible = { ...predicted }
        sampleMovement(baseline, frame.at, 120, before)
        if (!samePose(baseline.current, frame.state)) baseline = {
          previous: { ...before }, current: frame.state, at: frame.at }
        official = frame.state
        if (frame.receiptSeq !== undefined && !baselineModule) prediction.receivedInput(frame.receiptSeq, frame.at)
        prediction.reconcile('trace', frame.state, frame.state.motion, true, frame.at)
        prediction.sample(frame.at, predicted)
        sameFrameJump = Math.max(sameFrameJump, Math.hypot(predicted.x - visible.x, predicted.y - visible.y, predicted.z - visible.z))
        if (Math.hypot(predicted.x - visible.x, predicted.y - visible.y, predicted.z - visible.z) > .05)
          correctionJumps.push({ at: frame.at, before: visible, after: { ...predicted }, state: frame.state })
      } })),
      ...(trace.intents ?? trace.commands).map(input => ({ at: input.at, receive: () => prediction.intend(input.intent, input.at) })),
      ...trace.commands.map(input => ({ at: input.at, receive: () => prediction.sentInput(input.seq, input.at, input.intent) })),
    ].sort((a, b) => a.at - b.at)
    let event = 0
    const samples: { at: number; before: Pose; after: Pose; authoritative: Pose }[] = []
    let official = trace.initial
    for (let index = 0; index <= Math.round((trace.duration ?? 1800) * .06); index++) {
      const at = index * 1000 / 60
      while (event < events.length && events[event]!.at <= at) events[event++]!.receive()
      sampleMovement(baseline, at, 120, before)
      prediction.sample(at, predicted)
      if (at >= 100 && beforeResponse === null && Math.hypot(before.x - trace.initial.x, before.y - trace.initial.y, before.z - trace.initial.z) > .01) beforeResponse = at - 100
      if (at >= 100 && predictedResponse === null && Math.hypot(predicted.x - trace.initial.x, predicted.y - trace.initial.y, predicted.z - trace.initial.z) > .01) predictedResponse = at - 100
      samples.push({ at, before: { x: before.x, y: before.y, z: before.z, yaw: before.yaw },
        after: { x: predicted.x, y: predicted.y, z: predicted.z, yaw: predicted.yaw },
        authoritative: { x: official.x, y: official.y, z: official.z, yaw: official.yaw } })
    }
    expect(predictedResponse).not.toBeNull()
    expect(predictedResponse!).toBeLessThanOrEqual(17)
    if (trace.oneWayMs > 0) expect(beforeResponse!).toBeGreaterThan(predictedResponse!)
    const metrics = prediction.metrics()
    let maxFrameHorizontal = 0, maxFrameVertical = 0
    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1]!, current = samples[i]!
      const dt = (current.at - previous.at) / 1000
      const horizontal = Math.hypot(current.after.x - previous.after.x, current.after.z - previous.after.z)
      const vertical = Math.abs(current.after.y - previous.after.y)
      maxFrameHorizontal = Math.max(maxFrameHorizontal, horizontal)
      maxFrameVertical = Math.max(maxFrameVertical, vertical)
      if (!baselineModule) {
        expect(horizontal, `${trace.scenario} RTT${trace.oneWayMs * 2} @${current.at}`).toBeLessThanOrEqual((9 + 6.25 / 2) * dt + .002)
        expect(vertical, `${trace.scenario} RTT${trace.oneWayMs * 2} @${current.at}`).toBeLessThanOrEqual(20 * dt + .002)
      }
    }
    const final = samples.at(-1)!
    const settledErrorM = Math.hypot(final.after.x - final.authoritative.x, final.after.y - final.authoritative.y, final.after.z - final.authoritative.z)
    if (!baselineModule) {
      expect(sameFrameJump, `${trace.scenario} RTT${trace.oneWayMs * 2}`).toBeLessThan(.001)
      expect(settledErrorM, `${trace.scenario} settled position`).toBeLessThan(.02)
    }
    results.push({ scenario: trace.scenario, roundTripMs: trace.oneWayMs * 2, beforeFirstResponseMs: beforeResponse,
      afterFirstResponseMs: predictedResponse, maxCorrectionM: Math.max(0, ...metrics.correctionMetres),
      correctionSamples: metrics.correctionMetres.length,
      hardCorrections: metrics.hardCorrections, sameFrameJump, maxFrameHorizontal, maxFrameVertical, settledErrorM, correctionJumps, samples })
    prediction.reset()
  }
  writeFileSync(join(directory!, process.env.MOVEMENT_COMPARISON_OUTPUT ?? 'comparison-results.json'), JSON.stringify({ scope: 'Controlled 60Hz FE replay of actual Java Bullet traces; warm collision world. Not production/user input latency.', results }, null, 2))
  console.log(results.map(({ samples: _samples, correctionJumps: _jumps, ...rest }) => rest))
}, 45_000)
