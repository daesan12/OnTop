/** Admit one batch after a committed frame, even on a slow device. */
export class EntryStages {
  private frame = 0
  private committedFrame = 0
  private committedAt = 0
  private steadyFrames = 0
  private requested: number

  constructor(private last: number, initial: number) { this.requested = initial }

  commit(stage: number, now: number) {
    this.requested = stage
    this.committedFrame = this.frame
    this.committedAt = now
    this.steadyFrames = 0
  }

  next(stage: number, presented: boolean, now: number, delta = 0) {
    this.frame++
    if (!presented || stage === this.last || this.requested !== stage) return stage
    this.steadyFrames = delta <= .035 ? this.steadyFrames + 1 : 0
    if (this.frame <= this.committedFrame + 1 || now - this.committedAt < 64) return stage
    // Let input and locomotion recover after a costly commit/first shader draw.
    // The deadline still advances on slow devices instead of starving scenery.
    if (this.steadyFrames < 3 && now - this.committedAt < 500) return stage
    return this.requested = stage + 1
  }
}
