import { Euler, Quaternion } from 'three'
import data from './characterClips.json'
import type { CharacterJoint } from './CharacterRig'

/** Authored idle/walk/run/swim cycles for the shared-body characters: 19 body joints as local rotations
 * from the runtime rest (identity rest frames), int16 quaternions sampled at a fixed rate, in place. Fingers
 * stay with the rig's hand poses. Generated offline from the source character's actions. */
export type ClipName = 'idle' | 'walk' | 'run' | 'swim'
type Setter = (name: CharacterJoint, x?: number, y?: number, z?: number) => void

const bones = data.bones as CharacterJoint[]
const clips = Object.fromEntries(
  Object.entries(data.clips).map(([name, clip]) => {
    const bytes = Uint8Array.from(atob(clip.data), (c) => c.charCodeAt(0))
    const raw = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2)
    return [name, { fps: clip.fps, frames: clip.frames, duration: clip.frames / clip.fps, q: Float32Array.from(raw, (v) => v / 32767) }]
  }),
) as Record<ClipName, { fps: number; frames: number; duration: number; q: Float32Array }>

/** Steps per second at full walk/run: the procedural gait's cadence, so the feet keep pace with the
 * park's quick movement speeds (the clips' own pace would slide). */
const WALK_CYCLES = 1.05, RUN_CYCLES = 1.6
const SWIM_RATE = { stroke: 1.15, tread: 0.55 }

/** Interpolated rotation of joint k at `time` (seconds, looping), into out (x, y, z, w). */
function sample(name: ClipName, time: number, k: number, out: Float32Array) {
  const clip = clips[name], f = (((time / clip.duration) % 1 + 1) % 1) * clip.frames
  const i0 = Math.floor(f) % clip.frames, i1 = (i0 + 1) % clip.frames, t = f - Math.floor(f)
  const a = (i0 * bones.length + k) * 4, b = (i1 * bones.length + k) * 4
  const sign = clip.q[a]! * clip.q[b]! + clip.q[a + 1]! * clip.q[b + 1]! + clip.q[a + 2]! * clip.q[b + 2]! + clip.q[a + 3]! * clip.q[b + 3]! < 0 ? -1 : 1
  for (let c = 0; c < 4; c++) out[c] = clip.q[a + c]! * (1 - t) + clip.q[b + c]! * t * sign
}

/** Per-avatar clip clocks; writes blended joint rotations through the rig's setter. */
export function createClipPose() {
  let idle = 0, cycle = 0, swim = 0
  const acc = new Float32Array(4), part = new Float32Array(4), q = new Quaternion(), euler = new Euler()
  function write(set: Setter, k: number) {
    q.set(acc[0]!, acc[1]!, acc[2]!, acc[3]!).normalize()
    euler.setFromQuaternion(q)
    set(bones[k]!, euler.x, euler.y, euler.z)
  }
  function add(name: ClipName, time: number, k: number, weight: number) {
    if (weight <= 0) return
    sample(name, time, k, part)
    const sign = acc[0]! * part[0]! + acc[1]! * part[1]! + acc[2]! * part[2]! + acc[3]! * part[3]! < 0 ? -1 : 1
    for (let c = 0; c < 4; c++) acc[c] = acc[c]! + part[c]! * weight * sign
  }
  return {
    /** Standing, walking and running blended by the smoothed movement and run amounts (0..1). */
    ground(dt: number, move: number, run: number, set: Setter) {
      idle += dt
      cycle += dt * move * (WALK_CYCLES * (1 - run) + RUN_CYCLES * run)
      const walkW = move * (1 - run), runW = move * run
      for (let k = 0; k < bones.length; k++) {
        acc.fill(0)
        add('idle', idle, k, 1 - move)
        add('walk', cycle * clips.walk.duration, k, walkW)
        add('run', cycle * clips.run.duration, k, runW)
        write(set, k)
      }
    },
    /** The crawl, its pelvis left to the caller's figure tilt; slower while treading water. */
    swim(dt: number, move: number, set: Setter) {
      swim += dt * (SWIM_RATE.tread + (SWIM_RATE.stroke - SWIM_RATE.tread) * move)
      for (let k = 1; k < bones.length; k++) {
        acc.fill(0)
        add('swim', swim, k, 1)
        write(set, k)
      }
    },
  }
}
