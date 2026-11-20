import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { RemoteMovement } from '../../src/network/remoteMovement'
import { LocalMovementPrediction } from '../../src/network/localMovementPrediction'
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import { sampleMovement } from '../../src/world/movementPresentation'

const directory = process.env.MOVEMENT_COMPARISON_DIR
const p = (x: number) => ({ x, y: .8, z: 0, yaw: 0, moving: true, running: true, swimming: false })
const motion = (tick: number) => ({ tick, epoch: 0, appliedInputSeq: tick, inputAgeMs: 0,
  grounded: true, velocityY: 0, inputActive: true })
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
const deviation = (values: number[]) => Math.sqrt(mean(values.map(x => (x - mean(values)) ** 2)))

it.skipIf(!directory)('measures arrival blending versus source-tick interpolation under controlled jitter and stalls', () => {
  const results = []
  for (const rtt of [0, 50, 100, 200]) for (const condition of ['steady', 'jitter', 'snapshot-suppression'] as const) {
    const buffer = new RemoteMovement(), target = p(0), before = p(0)
    let legacy = { previous: p(0), current: p(0), at: rtt / 2 }, priorArrival = 0
    const events = Array.from({ length: 61 }, (_, index) => {
      const jitter = condition === 'steady' ? 0 : [0, 30, 10, 60, 5, 45][index % 6]!
      const at = Math.max(priorArrival + .01, index * 100 + rtt / 2 + jitter)
      priorArrival = at
      return { at, index }
    }).filter(({ index }) => condition !== 'snapshot-suppression' || index % 7 !== 4)
    let next = 0
    const samples: { at: number; before: number; after: number }[] = []
    for (let frame = 0; frame < 360; frame++) {
      const at = frame * 1000 / 60
      while (next < events.length && events[next]!.at <= at) {
        const event = events[next++]!, pose = p(event.index * .9)
        sampleMovement(legacy, event.at, 120, before)
        legacy = { previous: { ...before }, current: pose, at: event.at }
        buffer.push('remote', pose, motion(event.index * 3), event.at)
      }
      sampleMovement(legacy, at, 120, before)
      buffer.sample('remote', at, target)
      samples.push({ at, before: before.x, after: target.x })
    }
    const speeds = (key: 'before' | 'after') => samples.slice(1).flatMap((sample, index) => sample.at < 1000 ? []
      : [(sample[key] - samples[index]![key]) * 60])
    const a = speeds('after'), b = speeds('before')
    expect(Math.min(...a)).toBeGreaterThanOrEqual(-.001)
    expect(Math.max(...a)).toBeLessThanOrEqual(12.126)
    expect(buffer.metrics().maxFrames).toBeLessThanOrEqual(16)
    if (condition === 'steady') expect(deviation(a)).toBeLessThan(.001)
    results.push({ rttMs: rtt, condition, beforeSpeedStdMps: deviation(b), afterSpeedStdMps: deviation(a),
      beforeMaxFrameM: Math.max(...b) / 60, afterMaxFrameM: Math.max(...a) / 60,
      ...buffer.metrics(), samples })
  }
  writeFileSync(join(directory!, 'remote-quality.json'), JSON.stringify({
    scope: 'Synthetic constant 9m/s source at 10Hz, render 60Hz, symmetric RTT; deterministic 0–60ms delivery jitter. Snapshot suppression is application-level omission, not raw TCP packet loss. No shared server load.', results,
  }, null, 2))
})

it.skipIf(!directory)('checks actual Bullet prediction with ordered jitter and application snapshot omissions', async () => {
  const traces = JSON.parse(readFileSync(join(directory!, 'bullet-traces.json'), 'utf8'))
  const results = []
  for (const trace of traces) {
    const predictor = new LocalMovementPrediction(createPredictionPhysics, () => 0)
    predictor.reconcile('quality', trace.initial, trace.initial.motion, true, 0)
    await predictor.prepare()
    let previousArrival = 0, omitted = 0
    const deliveries = trace.frames.flatMap((frame: { at: number; state: typeof trace.initial; receiptSeq?: number }, index: number) => {
      if (index % 9 === 5) { omitted++; return [] }
      const at = Math.max(previousArrival + .01, frame.at + [0, 10, 45, 5, 30][index % 5]!)
      previousArrival = at
      return [{ at, receive: () => {
        if (frame.receiptSeq !== undefined) predictor.receivedInput(frame.receiptSeq, at)
        predictor.reconcile('quality', frame.state, frame.state.motion, true, at)
      } }]
    })
    const events = [...deliveries,
      ...trace.intents.map((input: { at: number; intent: Parameters<typeof predictor.intend>[0] }) =>
        ({ at: input.at, receive: () => predictor.intend(input.intent, input.at) })),
      ...trace.commands.map((input: { at: number; seq: number; intent: Parameters<typeof predictor.intend>[0] }) =>
        ({ at: input.at, receive: () => predictor.sentInput(input.seq, input.at, input.intent) })),
    ].sort((a, b) => a.at - b.at)
    let next = 0, maximumHorizontal = 0, maximumVertical = 0
    let previous = { ...trace.initial }
    for (let at = 0; at < trace.duration + 500; at += 1000 / 60) {
      while (next < events.length && events[next]!.at <= at) events[next++]!.receive()
      const pose = { ...previous }; predictor.sample(at, pose)
      maximumHorizontal = Math.max(maximumHorizontal, Math.hypot(pose.x - previous.x, pose.z - previous.z))
      maximumVertical = Math.max(maximumVertical, Math.abs(pose.y - previous.y))
      previous = pose
    }
    expect(maximumHorizontal).toBeLessThanOrEqual(12.125 / 60 + .002)
    expect(maximumVertical).toBeLessThanOrEqual(20 / 60 + .002)
    const official = trace.frames.at(-1).state
    const settledErrorM = Math.hypot(previous.x - official.x, previous.y - official.y, previous.z - official.z)
    expect(settledErrorM).toBeLessThan(.025)
    const metrics = predictor.metrics()
    results.push({ scenario: trace.scenario, rttMs: trace.oneWayMs * 2, omittedSnapshots: omitted,
      correctionSamples: metrics.correctionMetres.length, hardCorrections: metrics.hardCorrections,
      maximumErrorM: Math.max(0, ...metrics.correctionMetres), maximumHorizontal, maximumVertical, settledErrorM })
    predictor.reset()
  }
  writeFileSync(join(directory!, 'prediction-jitter.json'), JSON.stringify({
    scope: 'Real local Bullet traces replayed through Rapier prediction at 60Hz, ordered delivery jitter 0–45ms and every ninth application snapshot omitted. Not real TCP loss or a production benchmark.', results,
  }, null, 2))
}, 60_000)
