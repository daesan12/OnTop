import { MOVEMENT } from '../config'
import type { MotionSnapshot } from './localMovementPrediction'
import type { Pose } from './worldClient'

type Flags = { moving: boolean; running: boolean; swimming: boolean }
type Frame = {
  tick: number; epoch: number; pose: Pose; flags: Flags
  grounded: boolean; velocityY: number; movingPadBlock?: number
}
type PadHeight = (block: number, msAgo?: number) => number | undefined
type Track = { frames: Frame[]; displayed?: { pose: Pose; at: number }; flags?: Flags; cursor?: number }
const TICK_MS = 1000 / 30
// 100ms world cadence + measured 0–60ms delivery jitter + 20ms margin.
// Remote avatars deliberately trade 60ms more display delay for a stable timeline.
export const REMOTE_INTERPOLATION_MS = 180
const TAKEOFF_CORRECTION_MS = 180
const angle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

function airborneHeight(frames: Frame[], index: number, desiredTick: number, padHeight: PadHeight) {
  const frame = frames[index]!
  if (frame.grounded) return frame.pose.y

  let firstAirIndex = index
  while (firstAirIndex > 0 && !frames[firstAirIndex - 1]!.grounded) {
    firstAirIndex--
    if ((frame.tick - frames[firstAirIndex]!.tick) * TICK_MS >= TAKEOFF_CORRECTION_MS) return frame.pose.y
  }
  const support = frames[firstAirIndex - 1]
  const firstAir = frames[firstAirIndex]!
  if (support?.movingPadBlock === undefined || firstAir.velocityY <= 0) return frame.pose.y

  // Preserve the jump from the height the observer saw at departure. A mole
  // can be much lower on the server for this rider than on the observer's screen.
  const remaining = 1 - (frame.tick - firstAir.tick) * TICK_MS / TAKEOFF_CORRECTION_MS
  const msAgo = Math.max(0, (desiredTick - support.tick) * TICK_MS)
  const departureHeight = padHeight(support.movingPadBlock, msAgo) ?? support.pose.y
  return frame.pose.y + (departureHeight - support.pose.y) * remaining
}

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
      flags: { moving: pose.moving, running: pose.running, swimming: pose.swimming },
      grounded: motion.grounded, velocityY: motion.velocityY,
      movingPadBlock: motion.grounded ? motion.movingPad?.block : undefined })
    track.frames.sort((a, b) => a.tick - b.tick)
    track.frames = track.frames.slice(-16)
    this.received++
  }
  sample(id: string, at: number, target: Pose, maxSpeed = MOVEMENT.runSpeed + MOVEMENT.walkSpeed / 2,
    padHeight?: PadHeight): boolean {
    const track = this.tracks.get(id)
    if (!track?.frames.length) return false
    const frames = track.frames, desiredTick = (at - this.offset - this.delay) / TICK_MS
    // Rephasing must never rewind an already displayed source instant.
    const tick = Math.max(track.cursor ?? -Infinity, Math.min(frames.at(-1)!.tick, desiredTick))
    track.cursor = tick
    let fromIndex = 0, toIndex = 0
    for (let index = 0; index < frames.length; index++) {
      toIndex = index
      if (frames[index]!.tick >= tick) break
      fromIndex = index
    }
    const from = frames[fromIndex]!, to = frames[toIndex]!
    const t = from.tick === to.tick ? 1 : Math.max(0, Math.min(1, (tick - from.tick) / (to.tick - from.tick)))
    let x = from.pose.x + (to.pose.x - from.pose.x) * t
    // Seat the rider on this viewer's rendered pad. Mole dips are per player.
    // Project the grounded endpoints onto the visible pad and ease airborne
    // endpoints back to the server trajectory after takeoff.
    const fromPad = from.movingPadBlock === undefined ? undefined : padHeight?.(from.movingPadBlock)
    const toPad = to.movingPadBlock === from.movingPadBlock ? fromPad
      : to.movingPadBlock === undefined ? undefined : padHeight?.(to.movingPadBlock)
    const fromY = fromPad ?? (padHeight ? airborneHeight(frames, fromIndex, desiredTick, padHeight) : from.pose.y)
    const toY = to === from ? fromY
      : toPad ?? (padHeight ? airborneHeight(frames, toIndex, desiredTick, padHeight) : to.pose.y)
    let y = fromY + (toY - fromY) * t
    let z = from.pose.z + (to.pose.z - from.pose.z) * t
    const yaw = from.pose.yaw + angle(from.pose.yaw, to.pose.yaw) * t
    if (desiredTick > frames.at(-1)!.tick) this.held++
    const previous = track.displayed
    if (previous) {
      const seconds = Math.max(0, at - previous.at) / 1000
      const dx = x - previous.pose.x, dz = z - previous.pose.z
      const horizontal = Math.hypot(dx, dz), limit = maxSpeed * seconds
      const ratio = horizontal > 0 ? Math.min(1, limit / horizontal) : 1
      x = previous.pose.x + dx * ratio; z = previous.pose.z + dz * ratio
      y = previous.pose.y + Math.max(MOVEMENT.maxFallSpeed * seconds,
        Math.min(-MOVEMENT.maxFallSpeed * seconds, y - previous.pose.y))
    }
    const displayed = track.displayed ??= { pose: { x: 0, y: 0, z: 0, yaw: 0 }, at }
    displayed.pose.x = x; displayed.pose.y = y; displayed.pose.z = z; displayed.pose.yaw = yaw
    displayed.at = Math.max(at, previous?.at ?? at)
    track.flags = t < 1 ? from.flags : to.flags
    target.x = x; target.y = y; target.z = z; target.yaw = yaw
    return true
  }
  flags(id: string) { return this.tracks.get(id)?.flags }
  metrics() { return { received: this.received, reordered: this.reordered, heldSamples: this.held,
    tracks: this.tracks.size, maxFrames: Math.max(0, ...[...this.tracks.values()].map(t => t.frames.length)) } }
}
export const remoteMovement = new RemoteMovement()
