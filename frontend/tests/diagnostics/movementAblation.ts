import type { LocalMovementPrediction, MotionSnapshot, PredictionSimulation } from '../../src/network/localMovementPrediction'
import type { MovementIntent } from '../../src/network/movementInput'
import type { Pose } from '../../src/network/worldClient'

export type AblationMode = 'baseline' | 'no-offset' | 'no-replay'
type Baseline = { pose: Pose; motion: MotionSnapshot; at: number; anchor: number }
// Deliberately test-only inspection: production code has no mode switch or bypass.
// Fail fast if the predictor's private shape changes. Do not ship this module.
type Probe = {
  sim?: PredictionSimulation; baseline?: Baseline; scope: string; allowed: boolean; highestSent: number
  intent: MovementIntent; idleWindow: boolean; simulatedAt: number
  correction: { x: number; y: number; z: number; at: number }
  advance(at: number): void; trim(at: number): void
  displayOffset(at: number): { x: number; y: number; z: number }
}
export function installMovementAblation(prediction: LocalMovementPrediction, mode: AblationMode) {
  if (import.meta.env.PROD) throw new Error('Movement ablation is a development test only')
  const probe = prediction as unknown as Probe
  if (typeof probe.advance !== 'function' || typeof probe.displayOffset !== 'function') throw new Error('Unknown predictor shape')
  const reconcile = prediction.reconcile.bind(prediction), offset = probe.displayOffset.bind(probe)
  // B builds on A: compare no-offset to no-replay to isolate reset/replay alone.
  if (mode !== 'baseline') probe.displayOffset = () => ({ x: 0, y: 0, z: 0 })
  let ordinaryResets = 0
  prediction.reconcile = (scope, pose, motion, allowed, at = performance.now()) => {
    // A/B belongs only to the legacy input-authority path. Do not override the
    // real position-approval lease or its correction handling in local C mode.
    if (motion?.authority === 'CLIENT_VALIDATED') { reconcile(scope, pose, motion, allowed, at); return }
    const previous = probe.baseline
    const ordinary = previous && scope === probe.scope && probe.allowed && allowed && motion
      && motion.epoch === previous.motion.epoch
    if (ordinary && motion.tick < previous.motion.tick) return
    if (ordinary && mode === 'no-replay') {
      if (motion.tick === previous.motion.tick) return
      // Advance once on the local clock; only freshness/metadata follow the server.
      // Do not rewind the simulation clock and replay input into an unchanged body.
      probe.advance(at)
      probe.baseline = { pose: { ...pose }, motion, at, anchor: at }
      probe.idleWindow = (pose.moving === false || !motion.inputActive) && motion.appliedInputSeq >= probe.highestSent
      probe.trim(at)
      return
    }
    if (ordinary && motion.tick > previous.motion.tick) ordinaryResets++
    reconcile(scope, pose, motion, allowed, at)
  }
  return {
    snapshot() {
      const base = probe.baseline
      return { predicted: probe.sim?.pose(), correction: { ...probe.correction },
        intent: { ...probe.intent },
        motion: base ? { ...base.motion } : null, baselineReceivedAt: base?.at ?? null,
        simulatedAt: probe.simulatedAt, ordinaryResets }
    },
    dispose() { prediction.reconcile = reconcile; probe.displayOffset = offset },
  }
}

export type QualityFrame = { at: number; display: Pose; predicted: Pose; intent: MovementIntent; changedAt: number }
const quantile = (a: number[], q: number) => a.length ? [...a].sort((x, y) => x - y)[Math.ceil(a.length * q) - 1]! : null
export function movementQuality(frames: QualityFrame[]) {
  let reverseFrames = 0, reverseM = 0, stableReverseFrames = 0, stableReverseM = 0, stableStoppedMs = 0
  let previousVelocity: { x: number; z: number } | undefined
  const speeds: number[] = [], acceleration: number[] = [], renderResiduals: number[] = []
  let maxSpeed = 0
  for (let index = 1; index < frames.length; index++) {
    const a = frames[index - 1]!, b = frames[index]!, dt = (b.at - a.at) / 1000
    if (dt <= 0) continue
    const velocity = { x: (b.display.x - a.display.x) / dt, z: (b.display.z - a.display.z) / dt }
    const speed = Math.hypot(velocity.x, velocity.z), inputLength = Math.hypot(a.intent.dx, a.intent.dz)
    const projection = inputLength ? ((b.display.x - a.display.x) * a.intent.dx + (b.display.z - a.display.z) * a.intent.dz) / inputLength : 0
    const stable = inputLength > 0 && a.at - a.changedAt >= 120
    maxSpeed = Math.max(maxSpeed, speed)
    if (projection < -.0001) {
      reverseFrames++; reverseM -= projection
      if (stable) { stableReverseFrames++; stableReverseM -= projection }
    }
    if (stable && a.intent.run) {
      speeds.push(speed)
      if (speed < .5) stableStoppedMs += dt * 1000
      if (previousVelocity) acceleration.push(Math.hypot(velocity.x - previousVelocity.x, velocity.z - previousVelocity.z) / dt)
    }
    renderResiduals.push(Math.hypot(b.display.x - b.predicted.x, b.display.y - b.predicted.y, b.display.z - b.predicted.z))
    previousVelocity = velocity
  }
  const mean = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null
  return { reverseFrames, reverseM, stableReverseFrames, stableReverseM, stableStoppedMs, maxSpeed,
    stableRunSpeedMean: mean, stableRunSpeedStd: mean === null ? null : Math.sqrt(speeds.reduce((sum, x) => sum + (x - mean) ** 2, 0) / speeds.length),
    stableRunAccelerationP95: quantile(acceleration, .95), renderResidualP95: quantile(renderResiduals, .95),
    renderResidualMax: Math.max(0, ...renderResiduals) }
}
