/** Render positions every frame; sample expensive remote skeleton/sole poses
 * less often when idle or distant. Server events bypass the sampling delay.
 * An ambient pose (the authored standing idle) keeps sampling at 15fps while near
 * (every frame for the own avatar) and sleeps like any idle pose when distant. */
export class AvatarPoseCadence {
  private elapsed = 0
  private previousKey: string | number | undefined
  private previousActive = false
  private distant = false
  private quiet = 0
  constructor(private readonly crowdGroup = 0) {}

  advance(
    delta: number,
    distance: number,
    own: boolean,
    active: boolean,
    key: string | number,
    ambient = false,
    crowded = false,
    crowdFrame?: number,
  ) {
    if (distance > 16) this.distant = true
    else if (distance < 12) this.distant = false
    const lively = active || (ambient && (own || !this.distant))
    const interval =
      own ? 0 : active && !this.distant ? (crowded ? 1 / 30 : 0) : lively ? 1 / 15 : 1 / 12
    const changed = this.previousKey !== key || this.previousActive !== active
    const dt = Math.min(Math.max(0, delta), 0.1)
    this.quiet = changed || lively ? 0 : this.quiet + dt
    this.previousKey = key
    this.previousActive = active
    this.elapsed += dt
    // Leave time for locomotion/seat/hand easing to converge before sleeping.
    // A new state or authoritative position key always wakes the pose immediately.
    if (!changed && !lively && this.quiet >= 1.5) {
      this.elapsed = 0
      return 0
    }
    if (!changed && this.elapsed + 1e-8 < interval) return 0
    // A long frame advances everyone's timer. Give regular remote movement
    // two alternating slots so that the next frame cannot refresh every rig.
    if (!changed && crowded && lively && !own && crowdFrame !== undefined
      && (crowdFrame & 1) !== this.crowdGroup) return 0
    const step = this.elapsed
    this.elapsed = 0
    return step
  }
}
