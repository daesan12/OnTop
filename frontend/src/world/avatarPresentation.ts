import type { AvatarSnapshot, Pose } from '../network/worldClient'

const fields = ['connected', 'moving', 'running', 'tableId', 'seatIndex', 'benchId', 'fitnessId',
  'fitnessStartedAt', 'telescopeId', 'telescopePitch', 'swimming', 'emote', 'emoteAt', 'carry'] as const
type Avatar = Pick<AvatarSnapshot, typeof fields[number]>
type Flags = Pick<AvatarSnapshot, 'moving' | 'running'> & Partial<Pick<AvatarSnapshot, 'swimming'>>

/** Scratch presentation and a semantic cadence key owned by one rendered avatar. */
export class AvatarPresentation {
  private displayed = {} as Avatar
  private values: unknown[] = []
  private revision = 0
  private reaction = ''
  private held = false
  private quiet = false
  private x = 0
  private y = 0
  private z = 0
  private motionAt: number | undefined
  private motionX = 0
  private motionZ = 0
  private travelling = true

  sample(source: AvatarSnapshot, flags?: Flags, remotePose?: Pose, at = 0): Avatar {
    const out = this.displayed
    for (const field of fields) (out[field] as unknown) = source[field]
    if (flags) { out.moving = flags.moving; out.running = flags.running; out.swimming = flags.swimming ?? source.swimming }
    if (remotePose && !out.swimming && !out.tableId && !out.benchId && !out.fitnessId && !out.telescopeId) {
      // A held endpoint (or the tiny end of ground drag) must not keep the last
      // received walk/run cycle alive. Observe display motion without changing positions.
      if (this.motionAt === undefined || at < this.motionAt) this.travelling = true
      else if (at > this.motionAt) {
        const threshold = .12 * (at - this.motionAt) / 1000
        this.travelling = Math.hypot(remotePose.x - this.motionX, remotePose.z - this.motionZ) > threshold
      }
      this.motionAt = at; this.motionX = remotePose.x; this.motionZ = remotePose.z
      out.moving &&= this.travelling
      out.running &&= out.moving
    } else this.motionAt = undefined
    return out
  }

  key(source: AvatarSnapshot, reaction: string, held: boolean, active: boolean) {
    let changed = this.revision === 0
    for (let i = 0; i < fields.length; i++) {
      const value = source[fields[i]!]
      if (this.values[i] !== value) { this.values[i] = value; changed = true }
    }
    const quiet = !active, p = source.current
    if (this.reaction !== reaction || this.held !== held || this.quiet !== quiet
      || quiet && (this.x !== p.x || this.y !== p.y || this.z !== p.z)) changed = true
    this.reaction = reaction; this.held = held; this.quiet = quiet
    this.x = p.x; this.y = p.y; this.z = p.z
    if (changed) this.revision++
    return this.revision
  }
}
