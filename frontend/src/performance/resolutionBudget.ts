/** Slow windows lower resolution gradually; recovery needs a longer stable window.
 * Ignores background-tab gaps and shader warmup. Never raises the preset ceiling. */
export class ResolutionBudget {
  scale = 1
  private warmup = 8
  private elapsed = 0
  private frames = 0
  private slow = 0
  private fast = 0
  advance(delta: number): boolean {
    if (!Number.isFinite(delta) || delta <= 0 || delta > 0.5) return false
    if (this.warmup > 0) {
      this.warmup -= delta
      return false
    }
    this.elapsed += delta
    this.frames++
    if (this.elapsed < 2) return false
    const ms = (this.elapsed * 1000) / this.frames
    this.elapsed = 0
    this.frames = 0
    this.slow = ms > 25 ? this.slow + 1 : 0
    this.fast = ms < 16 ? this.fast + 1 : 0
    const before = this.scale
    if (this.slow >= 2) {
      this.scale = Math.max(0.75, this.scale - 0.1)
      this.slow = 0
    }
    if (this.fast >= 5) {
      this.scale = Math.min(1, this.scale + 0.05)
      this.fast = 0
    }
    return this.scale !== before
  }
}
