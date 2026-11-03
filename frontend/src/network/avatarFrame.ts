import type { AvatarSnapshot, Pose } from './worldClient'

export type AvatarSampler = (avatar: AvatarSnapshot, now: number, target: Pose) => Pose
type Entry = {
  frame: number; pose: Pose; at: number
  x: number; y: number; z: number; yaw: number
  px: number; py: number; pz: number; pyaw: number
  table: string; bench: string; fitness: string; telescope: string
}

/** Render-only, per-canvas cache. Call begin once before that canvas's frame subscribers. */
export class AvatarFrame {
  private entries = new WeakMap<AvatarSnapshot, Entry>()
  private frame = 0

  constructor(private readonly raw: AvatarSampler, private readonly live: (avatar: AvatarSnapshot) => boolean) {}

  begin() { this.frame++ }

  sample: AvatarSampler = (avatar, now, target) => {
    // Local prediction must keep its current input clock, including updates made
    // between visual consumers. Transport/gameplay callers retain the raw API.
    if (!this.frame || this.live(avatar)) {
      this.entries.delete(avatar)
      return this.raw(avatar, now, target)
    }
    const current = avatar.current, previous = avatar.previous
    let entry = this.entries.get(avatar)
    if (!entry || entry.frame !== this.frame || entry.at !== avatar.at
      || entry.x !== current.x || entry.y !== current.y || entry.z !== current.z || entry.yaw !== current.yaw
      || entry.px !== previous.x || entry.py !== previous.y || entry.pz !== previous.z || entry.pyaw !== previous.yaw
      || entry.table !== avatar.tableId || entry.bench !== avatar.benchId
      || entry.fitness !== avatar.fitnessId || entry.telescope !== avatar.telescopeId) {
      if (!entry) {
        entry = { frame: 0, pose: { x: 0, y: 0, z: 0, yaw: 0 }, at: 0,
          x: 0, y: 0, z: 0, yaw: 0, px: 0, py: 0, pz: 0, pyaw: 0,
          table: '', bench: '', fitness: '', telescope: '' }
        this.entries.set(avatar, entry)
      }
      this.raw(avatar, now, entry.pose)
      entry.frame = this.frame; entry.at = avatar.at
      entry.x = current.x; entry.y = current.y; entry.z = current.z; entry.yaw = current.yaw
      entry.px = previous.x; entry.py = previous.y; entry.pz = previous.z; entry.pyaw = previous.yaw
      entry.table = avatar.tableId; entry.bench = avatar.benchId
      entry.fitness = avatar.fitnessId; entry.telescope = avatar.telescopeId
    }
    // Consumers own their scratch targets; never expose the cached object.
    target.x = entry.pose.x; target.y = entry.pose.y; target.z = entry.pose.z; target.yaw = entry.pose.yaw
    return target
  }
}
