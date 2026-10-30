import { MOVEMENT } from '../config'
import type { MotionSnapshot } from './localMovementPrediction'
import type { Pose } from './worldClient'

type Flags = { moving: boolean; running: boolean; swimming: boolean }
type Frame = { tick: number; epoch: number; pose: Pose; flags: Flags }
type Track = { frames: Frame[]; displayed?: { pose: Pose; at: number }; flags?: Flags; cursor?: number }
const TICK_MS = 1000 / 30
// 100ms world cadence + measured 0–60ms delivery jitter + 20ms margin.
// Remote avatars deliberately trade 60ms more display delay for a stable timeline.
export const REMOTE_INTERPOLATION_MS = 180
const angle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

/** Render-only history. No extrapolation and no writes to authoritative positions. */
export class RemoteMovement {
  private tracks = new Map<string, Track>()
  private offset = Infinity
  private clockTick = -1
  private clockSamples: { at: number; offset: number }[] = []
  private received = 0
  private reordered = 0
  private held = 0
  constructor(private readonly delay = REMOTE_INTERPOLATION_MS) {}
  reset() {
    this.tracks.clear(); this.offset = Infinity; this.clockTick = -1; this.clockSamples = []
    this.received = this.reordered = this.held = 0
  }
  forget(id: string) { this.tracks.delete(id) }
  push(id: string, pose: Pose & Flags, motion: MotionSnapshot | null | undefined, at: number) {
    if (!motion) { this.forget(id); return }
    let track = this.tracks.get(id)
    const latest = track?.frames.at(-1)
    if (latest && motion.epoch < latest.epoch) return
    if (!track || latest && motion.epoch !== latest.epoch) {
      track = { frames: [] }; this.tracks.set(id, track)
    }
    if (track.frames.some(frame => frame.tick === motion.tick)) return
    if (latest && motion.tick < latest.tick) this.reordered++
    // A server pause can discard catch-up steps, so its tick clock may fall behind
    // wall time. Retire old offsets rather than assuming one global minimum forever.
    // Count each channel tick once, even when many avatars share the snapshot.
    if (motion.tick > this.clockTick) {
      this.clockTick = motion.tick
      this.clockSamples = this.clockSamples.filter(sample => at - sample.at < 2000).slice(-15)
      this.clockSamples.push({ at, offset: at - motion.tick * TICK_MS })
      this.offset = Math.min(...this.clockSamples.map(sample => sample.offset))
    }
    track.frames.push({ tick: motion.tick, epoch: motion.epoch, pose: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw },
      flags: { moving: pose.moving, running: pose.running, swimming: pose.swimming } })
    track.frames.sort((a, b) => a.tick - b.tick)
    track.frames = track.frames.slice(-16)
    this.received++
  }
  sample(id: string, at: number, target: Pose): boolean {
    const track = this.tracks.get(id)
    if (!track?.frames.length) return false
    const frames = track.frames, desiredTick = (at - this.offset - this.delay) / TICK_MS
    // Rephasing must never rewind an already displayed source instant.
    const tick = Math.max(track.cursor ?? -Infinity, Math.min(frames.at(-1)!.tick, desiredTick))
    track.cursor = tick
    let from = frames[0]!, to = from
    for (const frame of frames) {
      to = frame
      if (frame.tick >= tick) break
      from = frame
    }
    const t = from.tick === to.tick ? 1 : Math.max(0, Math.min(1, (tick - from.tick) / (to.tick - from.tick)))
    const pose = { x: from.pose.x + (to.pose.x - from.pose.x) * t,
      y: from.pose.y + (to.pose.y - from.pose.y) * t,
      z: from.pose.z + (to.pose.z - from.pose.z) * t,
      yaw: from.pose.yaw + angle(from.pose.yaw, to.pose.yaw) * t }
    if (desiredTick > frames.at(-1)!.tick) this.held++
    const previous = track.displayed
    if (previous) {
      const seconds = Math.max(0, at - previous.at) / 1000
      const dx = pose.x - previous.pose.x, dz = pose.z - previous.pose.z
      const horizontal = Math.hypot(dx, dz), limit = (MOVEMENT.runSpeed + MOVEMENT.walkSpeed / 2) * seconds
      const ratio = horizontal > 0 ? Math.min(1, limit / horizontal) : 1
      pose.x = previous.pose.x + dx * ratio; pose.z = previous.pose.z + dz * ratio
      pose.y = previous.pose.y + Math.max(MOVEMENT.maxFallSpeed * seconds,
        Math.min(-MOVEMENT.maxFallSpeed * seconds, pose.y - previous.pose.y))
    }
    track.displayed = { pose: { ...pose }, at: Math.max(at, previous?.at ?? at) }
    track.flags = t < 1 ? from.flags : to.flags
    Object.assign(target, pose)
    return true
  }
  flags(id: string) { return this.tracks.get(id)?.flags }
  metrics() { return { received: this.received, reordered: this.reordered, heldSamples: this.held,
    tracks: this.tracks.size, maxFrames: Math.max(0, ...[...this.tracks.values()].map(t => t.frames.length)) } }
}
export const remoteMovement = new RemoteMovement()
