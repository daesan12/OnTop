import type { AvatarSnapshot } from '../network/worldClient'

const fields = ['connected', 'moving', 'running', 'tableId', 'seatIndex', 'benchId', 'fitnessId',
  'fitnessStartedAt', 'telescopeId', 'telescopePitch', 'swimming', 'emote', 'emoteAt'] as const
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

  sample(source: AvatarSnapshot, flags?: Flags): Avatar {
    const out = this.displayed
    for (const field of fields) (out[field] as unknown) = source[field]
    if (flags) { out.moving = flags.moving; out.running = flags.running; out.swimming = flags.swimming ?? source.swimming }
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
