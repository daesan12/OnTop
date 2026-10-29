import type { MovementIntent } from './movementInput'
import type { Pose } from './worldClient'

export interface MotionSnapshot {
  epoch: number; tick: number; appliedInputSeq: number; inputAgeMs: number
  velocityY: number; grounded: boolean; inputActive: boolean
}
export interface PredictionSimulation {
  reset(pose: Pose, velocityY: number, grounded: boolean): void
  step(input: MovementIntent, seconds: number): void
  pose(): Pose
  setChairs(counts: ReadonlyMap<string, number>): void
  blocked?(): boolean
  dispose(): void
}
const STOP: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }
const HORIZON_MS = 250
const distance = (a: Pose, b: Pose) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
type IntentFrame = { at: number; intent: MovementIntent }
type SentFrame = { seq: number; at: number }
function last<T>(values: T[], predicate: (value: T) => boolean): T | undefined {
  for (let i = values.length - 1; i >= 0; i--) if (predicate(values[i]!)) return values[i]
}

/** Only renders the local avatar. AuthoritativePose, interactions and distance checks never use it. */
export class LocalMovementPrediction {
  private sim: PredictionSimulation | undefined
  private preparing: Promise<void> | undefined
  private generation = 0
  private scope = ''
  private baseline: { pose: Pose; motion: MotionSnapshot; at: number } | undefined
  private timeline: IntentFrame[] = []
  private sent: SentFrame[] = []
  private simulatedAt = 0
  private intent: MovementIntent = { ...STOP }
  private correction = { x: 0, y: 0, z: 0, at: 0 }
  private firstInput: { at: number; pose: Pose } | undefined
  private readonly responseTimes: number[] = []
  private readonly corrections: number[] = []
  private resets = 0
  private allowed = false
  private lastJumpAt = -Infinity
  private idleWindow = true
  private highestSent = 0
  private unavailable = false
  private chairCounts: ReadonlyMap<string, number> = new Map()
  constructor(private readonly factory: () => Promise<PredictionSimulation> = async () =>
    (await import('./predictionPhysics')).createPredictionPhysics(), private readonly now = () => performance.now()) {}

  get ready() { return this.allowed && !!this.sim && !!this.baseline }
  async prepare() {
    if (this.unavailable || this.sim || this.preparing) return this.preparing
    const generation = this.generation
    this.preparing = this.factory().then(sim => {
      if (generation !== this.generation) { sim.dispose(); return }
      this.sim = sim
      sim.setChairs(this.chairCounts)
      const base = this.baseline
      if (base) { sim.reset(base.pose, base.motion.velocityY, base.motion.grounded); this.simulatedAt = base.at }
    }).catch(() => {
      if (generation === this.generation) this.unavailable = true
      // WASM/browser failure keeps the original server-only presentation; no fake local success.
    }).finally(() => { if (generation === this.generation) this.preparing = undefined })
    return this.preparing
  }
  reset() {
    ++this.generation
    this.sim?.dispose(); this.sim = undefined; this.preparing = undefined
    this.scope = ''; this.baseline = undefined; this.timeline = []; this.sent = []
    this.intent = { ...STOP }; this.allowed = false; this.firstInput = undefined
    this.lastJumpAt = -Infinity
    this.idleWindow = true; this.highestSent = 0
    this.unavailable = false
    this.correction = { x: 0, y: 0, z: 0, at: 0 }
  }
  suspend() {
    this.timeline = []; this.sent = []; this.intent = { ...STOP }; this.firstInput = undefined
    this.allowed = false; this.correction = { x: 0, y: 0, z: 0, at: 0 }
  }
  reconcile(scope: string, pose: Pose & { moving?: boolean }, motion: MotionSnapshot | undefined, allowed: boolean, at = this.now()) {
    if (scope !== this.scope) { this.reset(); this.scope = scope }
    if (!motion || !allowed) { this.suspend(); return }
    const old = this.baseline
    const newEpoch = !old || old.motion.epoch !== motion.epoch || !this.allowed
    if (!newEpoch && motion.tick < old.motion.tick) return
    if (!newEpoch && motion.tick === old.motion.tick && distance(pose, old.pose) < .0001) {
      this.allowed = true
      return
    }
    this.advance(at)
    const visible = this.sim?.pose()
    if (visible) {
      const blend = Math.max(0, 1 - (at - this.correction.at) / 80)
      visible.x += this.correction.x * blend; visible.y += this.correction.y * blend; visible.z += this.correction.z * blend
    }
    this.allowed = true
    this.baseline = { pose: { ...pose }, motion, at }
    if (!this.sim) { void this.prepare(); return }
    const frame = this.sent.find(f => f.seq === motion.appliedInputSeq)
    const anchor = Math.max(at - HORIZON_MS, Math.min(at,
      frame ? frame.at + motion.inputAgeMs : this.timeline[0]?.at ?? at))
    this.sim.reset(pose, motion.velocityY, motion.grounded)
    this.simulatedAt = newEpoch ? at : anchor
    this.lastJumpAt = anchor
    if (newEpoch) {
      this.timeline = []; this.sent = []; this.intent = { ...STOP }; this.firstInput = undefined
      this.highestSent = motion.appliedInputSeq
    } else this.advance(at)
    const after = this.sim.pose()
    const error = visible ? distance(visible, after) : 0
    if (error > .01) this.push(this.corrections, error)
    // Teleports/recovery/seat epochs are authoritative immediately, never eased through obstacles.
    if (!newEpoch && visible && error < .75 && !this.sim.blocked?.()) {
      this.correction = { x: visible.x - after.x, y: visible.y - after.y, z: visible.z - after.z, at }
    } else { this.correction = { x: 0, y: 0, z: 0, at }; if (error >= .75) ++this.resets }
    this.sent = this.sent.filter(f => f.seq >= motion.appliedInputSeq).slice(-128)
    this.idleWindow = (pose.moving === false || !motion.inputActive) && motion.appliedInputSeq >= this.highestSent
    this.trim(at)
  }
  intend(intent: MovementIntent, at = this.now()) {
    if (!this.allowed || !this.baseline) return
    // An idle world does not broadcast unchanged positions. Begin from the last confirmed idle pose.
    if (this.idleWindow && !this.intent.dx && !this.intent.dz && !this.intent.jump && (intent.dx || intent.dz || intent.jump)) {
      this.baseline.at = at; this.simulatedAt = at
      this.idleWindow = false
    }
    this.advance(at)
    if ((intent.dx || intent.dz || intent.jump) && !(this.intent.dx || this.intent.dz || this.intent.jump)) {
      this.firstInput = { at, pose: this.sim?.pose() ?? this.baseline.pose }
    }
    if (intent.dx !== this.intent.dx || intent.dz !== this.intent.dz || intent.run !== this.intent.run || intent.jump) {
      this.timeline.push({ at, intent: { ...intent } })
      this.timeline = this.timeline.slice(-128)
    }
    this.intent = { ...intent }
  }
  sentInput(seq: number, at = this.now()) {
    this.highestSent = Math.max(this.highestSent, seq)
    this.sent.push({ seq, at }); this.sent = this.sent.slice(-128)
  }
  reject(seq: number) {
    this.sent = this.sent.filter(f => f.seq !== seq)
    // A rejected input is never retransmitted here. The next fresh intent remains independently paced.
  }
  setChairs(counts: ReadonlyMap<string, number>) { this.chairCounts = counts; this.sim?.setChairs(counts) }
  sample(at: number, target: Pose): boolean {
    if (!this.ready) return false
    this.advance(at)
    Object.assign(target, this.sim!.pose())
    const blend = Math.max(0, 1 - (at - this.correction.at) / 80)
    target.x += this.correction.x * blend; target.y += this.correction.y * blend; target.z += this.correction.z * blend
    if (this.firstInput && distance(target, this.firstInput.pose) > .001) {
      this.push(this.responseTimes, at - this.firstInput.at); this.firstInput = undefined
    }
    return true
  }
  displayFlags(at: number) {
    const active = this.ready && !!this.baseline && at - this.baseline.at <= HORIZON_MS
    return { moving: !!(active && (this.intent.dx || this.intent.dz)), running: !!(active && this.intent.run) }
  }
  metrics() { return { firstResponseMs: [...this.responseTimes], correctionMetres: [...this.corrections], hardCorrections: this.resets } }
  private push(list: number[], value: number) { list.push(value); if (list.length > 256) list.shift() }
  private trim(at: number) {
    const frame = last(this.timeline, f => f.at < at - 2 * HORIZON_MS)
    const keep = frame ? this.timeline.indexOf(frame) : -1
    if (keep > 0) this.timeline.splice(0, keep)
  }
  private advance(at: number) {
    if (!this.sim || !this.baseline) return
    const end = Math.min(at, this.baseline.at + HORIZON_MS)
    if (end <= this.simulatedAt) return
    const start = Math.max(this.simulatedAt, end - HORIZON_MS)
    const initial = last(this.timeline, f => f.at <= start)
    let jumpAt = initial?.at ?? -Infinity
    let input = { ...(initial?.intent ?? STOP), jump: !!initial?.intent.jump && jumpAt > this.lastJumpAt }
    let cursor = start
    const integrate = (until: number) => {
      while (cursor < until - .0001) {
        const ms = Math.min(1000 / 60, until - cursor)
        this.sim!.step(input, ms / 1000)
        if (input.jump) this.lastJumpAt = jumpAt
        input = { ...input, jump: false }; cursor += ms
      }
    }
    for (const frame of this.timeline) {
      if (frame.at <= start || frame.at > end) continue
      integrate(frame.at); input = { ...frame.intent }; jumpAt = frame.at
    }
    integrate(end); this.simulatedAt = end
  }
}
export const localMovement = new LocalMovementPrediction()
