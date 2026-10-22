/** Presentation-only budget. Gameplay and avatar/camera updates still run every frame. */
export const SHADOW_HZ = { low: 0, medium: 15, high: 20 } as const

export class ShadowCadence {
  private elapsed: number
  private readonly interval: number
  constructor(hz: number) {
    this.interval = hz > 0 ? 1 / hz : Infinity
    this.elapsed = this.interval
  }
  advance(delta: number, enabled: boolean) {
    if (!Number.isFinite(this.interval)) return false
    if (!enabled) {
      this.elapsed = this.interval
      return false
    }
    this.elapsed += Math.max(0, delta)
    if (this.elapsed + 1e-8 < this.interval) return false
    // No catch-up renders after a suspended tab. Just render the current scene.
    this.elapsed = Math.max(
      0,
      this.elapsed -
        Math.floor((this.elapsed + 1e-8) / this.interval) * this.interval,
    )
    return true
  }
}
