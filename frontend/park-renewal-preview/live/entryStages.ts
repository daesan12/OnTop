/** Admit one batch after a committed frame, even on a slow device. */
export class EntryStages {
  private frame = 0
  private committedFrame = 0
  private committedAt = 0
  private requested: number

  constructor(private last: number, initial: number) { this.requested = initial }

  commit(stage: number, now: number) {
    this.requested = stage
    this.committedFrame = this.frame
    this.committedAt = now
  }

  next(stage: number, presented: boolean, now: number) {
    this.frame++
    if (!presented || stage === this.last || this.requested !== stage) return stage
    if (this.frame <= this.committedFrame + 1 || now - this.committedAt < 64) return stage
    return this.requested = stage + 1
  }
}
