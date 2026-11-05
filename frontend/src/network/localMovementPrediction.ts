import type { MovementIntent } from './movementInput'
import type { Pose } from './worldClient'
import { MOVEMENT, NETWORK } from '../config'
import { PARK_MOTION } from './parkMotion'
import type { JumpGraceSnapshot } from '../features/jumpmap/jumpGrace'

export interface MotionSnapshot {
  epoch: number; tick: number; appliedInputSeq: number; inputAgeMs: number
  velocityY: number; grounded: boolean; inputActive: boolean
  authority?: 'CLIENT_VALIDATED'
  profile?: 'PARK_V1'
  steering?: { dx: number; dz: number; run: boolean; targetX: number; targetZ: number }
  correctionReason?: string
  jumpGrace?: JumpGraceSnapshot
}
export interface PredictionSimulation {
  setFollowTarget?(target: {x:number;z:number} | undefined): void
  stopHorizontal?(): void
  setMotionProfile?(profile: 'PARK_V1' | undefined): void
  reset(pose: Pose, velocityY: number, grounded: boolean, jumpGrace?: JumpGraceSnapshot): void
  step(input: MovementIntent, seconds: number): void
  pose(): Pose
  setChairs(counts: ReadonlyMap<string, number>): void
  movementFlags?(): {moving:boolean;running:boolean} | undefined
  stepJumped?(): boolean
  stepSupported?(): boolean
  dispose(): void
}
const STOP: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }
const HORIZON_MS = 250
const distance = (a: Pose, b: Pose) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
type IntentFrame = { at: number; intent: MovementIntent }
type SentFrame = { seq: number; at: number; jumpAt: number }
type PositionSample = { x: number; y: number; z: number; jump: boolean }
type PathPoint = PositionSample & { supported: boolean }
const MAX_PATH_SAMPLES = 64
function redundantPoint(a: PathPoint, b: PathPoint, c: PathPoint) {
  if (b.jump || c.jump || a.supported !== b.supported || b.supported !== c.supported) return false
  const x = c.x - a.x, y = c.y - a.y, z = c.z - a.z, length2 = x * x + y * y + z * z
  if (!length2) return a.x === b.x && a.y === b.y && a.z === b.z
  const t = ((b.x - a.x) * x + (b.y - a.y) * y + (b.z - a.z) * z) / length2
  return t >= 0 && t <= 1 && Math.hypot(b.x - a.x - t * x, b.y - a.y - t * y, b.z - a.z - t * z) <= .0005
}
function last<T>(values: T[], predicate: (value: T) => boolean): T | undefined {
  for (let i = values.length - 1; i >= 0; i--) if (predicate(values[i]!)) return values[i]
}

/** Only renders the local avatar. AuthoritativePose, interactions and distance checks never use it. */
export class LocalMovementPrediction {
  private sim: PredictionSimulation | undefined
  private preparing: Promise<void> | undefined
  private generation = 0
  private scope = ''
  private baseline: { pose: Pose; motion: MotionSnapshot; at: number; anchor: number } | undefined
  private timeline: IntentFrame[] = []
  private sent: SentFrame[] = []
  private positionPath: PathPoint[] = []
  private pathAnchor: PathPoint | undefined
  private pathOverflow = false
  private simulatedAt = 0
  private intent: MovementIntent = { ...STOP }
  private correction = { x: 0, y: 0, z: 0, at: 0 }
  private firstInput: { at: number; pose: Pose } | undefined
  private readonly responseTimes: number[] = []
  private readonly corrections: number[] = []
  private readonly roundTrips: number[] = []
  private readonly diagnostics: { at: number; tick: number; appliedInputSeq: number; anchor: number;
    errorM: number; epochChanged: boolean; roundTripMs: number }[] = []
  private resets = 0
  private allowed = false
  private lastJumpAt = -Infinity
  private acknowledgedJumpAt = -Infinity
  private idleWindow = true
  private pendingPositionJump: {epoch:number;seq:number} | undefined
  private highestSent = 0
  private unavailable = false
  private steering: MotionSnapshot['steering']
  private steeringSuppressed = false
  private facing: { from: number; to: number; at: number } | undefined
  private displayed: { pose: Pose; at: number } | undefined
  private chairCounts: ReadonlyMap<string, number> = new Map()
  constructor(private readonly factory: () => Promise<PredictionSimulation> = async () =>
    (await import('./predictionPhysics')).createPredictionPhysics(), private readonly now = () => performance.now()) {}

  get ready() { return this.allowed && !!this.sim && !!this.baseline }
  get epoch() { return this.baseline?.motion.epoch ?? null }
  get motionProfile() { return this.baseline?.motion.profile }
  get positionMode() { return this.baseline?.motion.authority === 'CLIENT_VALIDATED' }
  get positionUnavailable() { return this.unavailable && this.tuned }
  get positionPreparing() { return this.baseline?.motion.authority === 'CLIENT_VALIDATED' && !this.sim && !this.unavailable }
  positionFallback() {
    return this.unavailable && !this.tuned && this.baseline?.motion.authority === 'CLIENT_VALIDATED' ? { epoch: this.baseline.motion.epoch } : undefined
  }
  private get tuned() { return this.baseline?.motion.profile === 'PARK_V1' }
  private get horizon() { return this.baseline?.motion.authority === 'CLIENT_VALIDATED' ? (this.tuned ? 2000 : 500) : HORIZON_MS }
  positionReport(seq: number, intent: MovementIntent, at = this.now()) {
    if (!this.ready || this.baseline?.motion.authority !== 'CLIENT_VALIDATED') return undefined
    this.advance(at)
    if (this.tuned && intent.jump && !this.pendingPositionJump) this.pendingPositionJump={epoch:this.baseline.motion.epoch,seq}
    const effective = this.effectiveIntent(intent)
    const pose = this.sim!.pose()
    const path = this.tuned && this.sim!.stepJumped && !this.pathOverflow && this.positionPath.length
      ? this.positionPath.map(({ supported: _support, ...sample }) => sample) : undefined
    this.clearPositionPath()
    return { seq, epoch: this.baseline.motion.epoch, ...pose, run: effective.run,
      jump: intent.jump || !!this.pendingPositionJump,
      manual: !!(intent.dx || intent.dz || intent.jump || this.pendingPositionJump || this.steeringSuppressed || path?.some(p => p.jump)),
      ...(path ? { path } : {}) }
  }
  async prepare() {
    if (this.unavailable || this.sim || this.preparing) return this.preparing
    const generation = this.generation
    this.preparing = this.factory().then(sim => {
      if (generation !== this.generation) { sim.dispose(); return }
      this.sim = sim
      this.applyFollowTarget()
      sim.setChairs(this.chairCounts)
      const base = this.baseline
      if (base) {
        const at = base.motion.authority === 'CLIENT_VALIDATED' && base.motion.appliedInputSeq === 0 ? this.now() : base.at
        if (at !== base.at) {
          base.at = at
          this.timeline = [{ at, intent: { ...this.intent, jump: false } }]
        }
        sim.setMotionProfile?.(base.motion.profile)
        sim.reset(base.pose, base.motion.velocityY, base.motion.grounded, base.motion.jumpGrace); this.simulatedAt = at
      }
    }).catch(() => {
      if (generation === this.generation) this.unavailable = true
      // PARK_V1 reports preparation failure without silently selecting different physics.
    }).finally(() => { if (generation === this.generation) this.preparing = undefined })
    return this.preparing
  }
  reset() {
    ++this.generation
    this.sim?.dispose(); this.sim = undefined; this.preparing = undefined
    this.scope = ''; this.baseline = undefined; this.timeline = []; this.sent = []
    this.clearPositionPath()
    this.pendingPositionJump=undefined
    this.intent = { ...STOP }; this.allowed = false; this.firstInput = undefined
    this.lastJumpAt = -Infinity
    this.acknowledgedJumpAt = -Infinity
    this.idleWindow = true; this.highestSent = 0
    this.unavailable = false
    this.facing = undefined
    this.displayed = undefined
    this.steering = undefined; this.steeringSuppressed = false
    this.correction = { x: 0, y: 0, z: 0, at: 0 }
    this.roundTrips.length = this.diagnostics.length = 0
  }
  suspend() {
    this.steering = undefined; this.steeringSuppressed = false
    this.sim?.setFollowTarget?.(undefined)
    this.pendingPositionJump=undefined
    this.timeline = []; this.sent = []; this.intent = { ...STOP }; this.firstInput = undefined
    this.clearPositionPath()
    this.allowed = false; this.correction = { x: 0, y: 0, z: 0, at: 0 }
    this.facing = undefined
    this.displayed = undefined
    this.acknowledgedJumpAt = this.lastJumpAt = -Infinity
  }
  reconcile(scope: string, pose: Pose & { moving?: boolean }, motion: MotionSnapshot | undefined, allowed: boolean, at = this.now()) {
    if (scope !== this.scope) { this.reset(); this.scope = scope }
    if (!motion || !allowed) { this.suspend(); return }
    // Native/held snapshots, including server-owned automatic follow, are presentation-only.
    // Manual PARK_V1 retains CLIENT_VALIDATED across regions and recoverable failures.
    if (motion.profile === 'PARK_V1' && motion.authority !== 'CLIENT_VALIDATED') {
      this.baseline = {pose:{...pose}, motion, at, anchor:at}
      this.suspend(); return
    }
    const old = this.baseline
    if (old && motion.epoch < old.motion.epoch) return
    const newEpoch = !old || old.motion.epoch !== motion.epoch || old.motion.profile !== motion.profile || !this.allowed
    if (!newEpoch && motion.tick < old.motion.tick) return
    this.syncSteering(motion.steering, at)
    if(this.pendingPositionJump&&(newEpoch||motion.epoch!==this.pendingPositionJump.epoch||motion.appliedInputSeq>=this.pendingPositionJump.seq))this.pendingPositionJump=undefined
    if (!newEpoch && motion.tick === old.motion.tick && distance(pose, old.pose) < .0001) {
      this.allowed = true
      if (motion.authority === 'CLIENT_VALIDATED') this.baseline = { ...old, motion,
        at: motion.appliedInputSeq > old.motion.appliedInputSeq ? at : old.at }
      return
    }
    if (!newEpoch && motion.authority === 'CLIENT_VALIDATED' && old.motion.authority === 'CLIENT_VALIDATED') {
      this.advance(at)
      // This pose acknowledges a previously submitted physical sample. It is
      // never applied over the character's newer local physics position.
      this.baseline = { pose: { ...pose }, motion,
        at: motion.appliedInputSeq > old.motion.appliedInputSeq ? at : old.at, anchor: at }
      this.allowed = true
      this.idleWindow = false
      this.sent = this.sent.filter(frame => frame.seq > motion.appliedInputSeq)
      this.trim(at)
      return
    }
    this.advance(at)
    const visible = this.sim ? this.displayPosition(at) : undefined
    this.allowed = true
    for (const sent of this.sent) if (sent.seq <= motion.appliedInputSeq)
      this.acknowledgedJumpAt = Math.max(this.acknowledgedJumpAt, sent.jumpAt)
    const frame = this.sent.find(f => f.seq === motion.appliedInputSeq)
    // A missing acknowledged input is not the first local keystroke's timestamp.
    // Carry the previous physics clock forward instead of replaying from an unrelated intent.
    const inferred = old ? old.anchor + (motion.tick - old.motion.tick) * 1000 / 30 : at
    // RTT is diagnostic only: half-RTT is not an authoritative physics timestamp
    // (queues and asymmetric delivery make that estimate unstable around jumps).
    let anchor = Math.max(at - HORIZON_MS, Math.min(at, frame ? frame.at + motion.inputAgeMs : inferred))
    // A pre-jump state cannot consume a jump which the server has not processed yet.
    const pendingJump = this.timeline.find(f => f.intent.jump && f.at > this.acknowledgedJumpAt)
    if (!newEpoch && motion.grounded && pendingJump) anchor = Math.max(at - HORIZON_MS, Math.min(anchor, pendingJump.at))
    this.baseline = { pose: { ...pose }, motion, at, anchor }
    if (newEpoch) this.facing = { from: pose.yaw, to: pose.yaw, at }
    if (!this.sim) { void this.prepare(); return }
    this.sim.setMotionProfile?.(motion.profile)
    this.sim.reset(pose, motion.velocityY, motion.grounded, motion.jumpGrace)
    this.clearPositionPath()
    this.simulatedAt = newEpoch ? at : anchor
    this.lastJumpAt = this.acknowledgedJumpAt
    if (newEpoch) {
      const held = old && motion.correctionReason ? { ...this.intent, jump: false } : { ...STOP }
      this.sent = []; this.intent = held; this.firstInput = undefined
      this.timeline = [{ at, intent: { ...this.effectiveIntent(held), jump: false } }]
      this.applyFollowTarget()
      this.highestSent = motion.appliedInputSeq
      this.acknowledgedJumpAt = this.lastJumpAt = -Infinity
      this.displayed = undefined
    } else this.advance(at)
    const after = this.sim.pose()
    const error = visible ? distance(visible, after) : 0
    if (error > .01) this.push(this.corrections, error)
    this.diagnostics.push({ at, tick: motion.tick, appliedInputSeq: motion.appliedInputSeq, anchor,
      errorM: error, epochChanged: newEpoch, roundTripMs: this.roundTrips.length ? Math.min(...this.roundTrips) : 0 })
    if (this.diagnostics.length > 64) this.diagnostics.shift()
    // Only the server's relocation epoch authorizes a display snap. A delayed
    // ordinary state can be metres away during rapid strafes; error magnitude
    // alone must not turn legitimate correction into a one-frame teleport.
    if (!newEpoch && visible) {
      this.correction = { x: visible.x - after.x, y: visible.y - after.y, z: visible.z - after.z, at }
    } else {
      this.correction = { x: 0, y: 0, z: 0, at }
      if (visible && error > .01) ++this.resets
      this.facing = { from: after.yaw, to: after.yaw, at }
      this.displayed = undefined
    }
    this.sent = this.sent.filter(f => f.seq >= motion.appliedInputSeq).slice(-128)
    this.idleWindow = (pose.moving === false || !motion.inputActive) && motion.appliedInputSeq >= this.highestSent
    this.trim(at)
  }
  intend(intent: MovementIntent, at = this.now()) {
    if (!this.allowed || !this.baseline) return
    // An idle world does not broadcast unchanged positions. Begin from the last confirmed idle pose.
    if (this.baseline.motion.authority !== 'CLIENT_VALIDATED' && this.idleWindow && !this.intent.dx && !this.intent.dz && !this.intent.jump && (intent.dx || intent.dz || intent.jump)) {
      this.baseline.at = at; this.simulatedAt = at
      this.idleWindow = false
    }
    this.advance(at)
    if ((intent.dx || intent.dz || intent.jump) && !(this.intent.dx || this.intent.dz || this.intent.jump)) {
      this.firstInput = { at, pose: this.sim?.pose() ?? this.baseline.pose }
    }
    if ((intent.dx || intent.dz || intent.jump) && this.steering) {
      this.steeringSuppressed = true; this.applyFollowTarget()
    }
    const effective = this.effectiveIntent(intent), previous = this.timeline.at(-1)?.intent ?? STOP
    if (effective.dx !== previous.dx || effective.dz !== previous.dz || effective.run !== previous.run || effective.jump) {
      this.timeline.push({ at, intent: { ...effective } })
      this.timeline = this.timeline.slice(-128)
    }
    this.intent = { ...intent }
  }
  private effectiveIntent(manual = this.intent): MovementIntent {
    return this.steering && !this.steeringSuppressed ? {dx:this.steering.dx,dz:this.steering.dz,run:this.steering.run,jump:false} : manual
  }
  private applyFollowTarget() {
    const steering = !this.steeringSuppressed ? this.steering : undefined
    this.sim?.setFollowTarget?.(steering ? {x:steering.targetX,z:steering.targetZ} : undefined)
  }
  private syncSteering(steering: MotionSnapshot['steering'], at: number) {
    this.advance(at)
    const changed = JSON.stringify(this.steering) !== JSON.stringify(steering)
    this.steering = steering
    if (!steering) this.steeringSuppressed = false
    this.applyFollowTarget()
    if (changed) this.timeline.push({at,intent:{...this.effectiveIntent(),jump:false}})
  }
  stopSteering(at = this.now()) {
    this.advance(at); this.steeringSuppressed = !!this.steering
    this.intent = {...STOP}; this.applyFollowTarget(); this.sim?.stopHorizontal?.()
    this.timeline.push({at,intent:{...STOP}})
  }
  sentInput(seq: number, at = this.now(), intent = this.intent) {
    this.highestSent = Math.max(this.highestSent, seq)
    const jumpAt = intent.jump ? last(this.timeline, f => f.intent.jump && f.at <= at)?.at ?? at : -Infinity
    this.sent.push({ seq, at, jumpAt }); this.sent = this.sent.slice(-128)
  }
  receivedInput(seq: number, at = this.now()) {
    const input = this.sent.find(frame => frame.seq === seq)
    const rtt = input ? at - input.at : -1
    if (rtt < 0 || rtt > 2 * HORIZON_MS) return
    this.roundTrips.push(rtt)
    if (this.roundTrips.length > 16) this.roundTrips.shift()
  }
  reject(seq: number) {
    const rejected = this.sent.find(f => f.seq === seq)
    if (!this.tuned && rejected && Number.isFinite(rejected.jumpAt)
      && !this.sent.some(f => f.seq !== seq && f.jumpAt === rejected.jumpAt)) {
      for (const frame of this.timeline) if (frame.at === rejected.jumpAt)
        frame.intent = { ...frame.intent, jump: false }
    }
    this.sent = this.sent.filter(f => f.seq !== seq)
    // A rejected input is never retransmitted here. The next fresh intent remains independently paced.
  }
  setChairs(counts: ReadonlyMap<string, number>) { this.chairCounts = counts; this.sim?.setChairs(counts) }
  sample(at: number, target: Pose): boolean {
    if (!this.ready) return false
    this.advance(at)
    Object.assign(target, this.displayPosition(at))
    target.yaw = this.displayYaw(target.yaw, at)
    if (this.firstInput && distance(target, this.firstInput.pose) > .001) {
      this.push(this.responseTimes, at - this.firstInput.at); this.firstInput = undefined
    }
    return true
  }
  displayFlags(at: number) {
    const active = this.ready && !!this.baseline && at - this.baseline.at <= this.horizon
    const physical = active ? this.sim?.movementFlags?.() : undefined
    const effective = this.effectiveIntent()
    return physical ?? { moving: !!(active && (effective.dx || effective.dz)), running: !!(active && effective.run) }
  }
  metrics() { return { firstResponseMs: [...this.responseTimes], correctionMetres: [...this.corrections],
    hardCorrections: this.resets, roundTripMs: [...this.roundTrips], reconciliations: [...this.diagnostics] } }
  private displayOffset(at: number) {
    const blend = Math.max(0, 1 - (at - this.correction.at) / 80)
    const offset = { x: this.correction.x * blend, y: this.correction.y * blend, z: this.correction.z * blend }
    return offset
  }
  private displayPosition(at: number): Pose {
    const pose = this.sim!.pose(), offset = this.displayOffset(at)
    pose.x += offset.x; pose.y += offset.y; pose.z += offset.z
    const previous = this.displayed
    if (previous) {
      const seconds = Math.max(0, at - previous.at) / 1000
      const delta = { x: pose.x - previous.pose.x, y: pose.y - previous.pose.y, z: pose.z - previous.pose.z }
      // Keep input response immediate, but never turn a correction into an
      // unbounded one-frame move. Relocation epochs bypass this display path.
      const horizontal = Math.hypot(delta.x, delta.z)
      const limit = (MOVEMENT.runSpeed + MOVEMENT.walkSpeed / 2) * seconds
      if (horizontal > limit && horizontal > 0) { delta.x *= limit / horizontal; delta.z *= limit / horizontal }
      const verticalLimit = this.tuned ? PARK_MOTION.maxFallSpeed : -MOVEMENT.maxFallSpeed
      delta.y = Math.max(-verticalLimit * seconds, Math.min(verticalLimit * seconds, delta.y))
      // Collision belongs to the physical simulation, not to this correction
      // path. Sweeping a wrong display pose can trap it below a valid landing.
      pose.x = previous.pose.x + delta.x; pose.y = previous.pose.y + delta.y; pose.z = previous.pose.z + delta.z
    }
    this.displayed = { pose: { ...pose }, at: Math.max(at, previous?.at ?? at) }
    return pose
  }
  private displayYaw(yaw: number, at: number) {
    const facing = this.facing ?? { from: yaw, to: yaw, at }
    const t = Math.min(1, Math.max(0, (at - facing.at) / NETWORK.interpolationMs))
    const visible = facing.from + angleDelta(facing.from, facing.to) * t
    // Keep prediction's position immediate; only the displayed facing uses the existing turn interval.
    this.facing = Math.abs(angleDelta(facing.to, yaw)) > .000001
      ? { from: visible, to: yaw, at } : facing
    return visible
  }
  private push(list: number[], value: number) { list.push(value); if (list.length > 256) list.shift() }
  private trim(at: number) {
    const frame = last(this.timeline, f => f.at < at - 2 * HORIZON_MS)
    const keep = frame ? this.timeline.indexOf(frame) : -1
    if (keep > 0) this.timeline.splice(0, keep)
  }
  private advance(at: number) {
    if (!this.sim || !this.baseline) return
    const end = Math.min(at, this.baseline.at + this.horizon)
    if (end <= this.simulatedAt) return
    const start = Math.max(this.simulatedAt, end - (this.tuned && this.positionMode ? 100 : this.horizon))
    const initial = last(this.timeline, f => f.at <= start)
    let jumpAt = initial?.at ?? -Infinity
    let input = { ...(initial?.intent ?? STOP), jump: !!initial?.intent.jump && jumpAt > this.lastJumpAt }
    let cursor = start
    const integrate = (until: number) => {
      while (cursor < until - .0001) {
        const ms = Math.min(1000 / 60, until - cursor)
        const tracing = this.tuned && this.positionMode && this.sim!.stepJumped && !this.pathOverflow
        if (tracing && !this.pathAnchor) {
          const p = this.sim!.pose()
          this.pathAnchor = { x: p.x, y: p.y, z: p.z, jump: false, supported: this.sim!.stepSupported?.() ?? false }
        }
        this.sim!.step(input, ms / 1000)
        if (tracing) {
          const pose = this.sim!.pose()
          const point = { x: pose.x, y: pose.y, z: pose.z, jump: this.sim!.stepJumped!(), supported: this.sim!.stepSupported?.() ?? false }
          const b = this.positionPath.at(-1), a = this.positionPath.at(-2) ?? this.pathAnchor!
          // Straight ground movement costs one server sample. Preserve curves,
          // support transitions and actual (including buffered) takeoffs.
          if (b && redundantPoint(a, b, point)) this.positionPath[this.positionPath.length - 1] = point
          else if (this.positionPath.length === MAX_PATH_SAMPLES) {
            // A stalled sender stays bounded and falls back to the original endpoint report.
            this.positionPath = []; this.pathOverflow = true
          } else this.positionPath.push(point)
        }
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
  private clearPositionPath() {
    this.positionPath = []; this.pathAnchor = undefined; this.pathOverflow = false
  }
}
export const localMovement = new LocalMovementPrediction()
