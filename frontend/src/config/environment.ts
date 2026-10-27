/** Art-direction proposals, not settled gameplay rules. All clocks use milliseconds. */
export const ENVIRONMENT = {
  timeZone: 'Asia/Seoul',
  dayDurationMs: 30 * 60_000,
  // One shared Korean midnight, independent of the browser's local time zone.
  epochMs: Date.parse('2026-01-01T00:00:00+09:00'),
  adDurationMs: 10_000,
  adFadeMs: 900,
  palette: {
    lamp: '#FFD6A3',
    path: '#FFE6C7',
    table: '#FFF0D8',
    window: '#EFC38C',
    nightSky: '#172333',
  },
} as const
export const ENVIRONMENT_QUALITY = {
  low: { lights: 3, fish: 12, droplets: 140, effectDistance: 65 },
  medium: { lights: 5, fish: 20, droplets: 280, effectDistance: 85 },
  high: { lights: 7, fish: 28, droplets: 440, effectDistance: 110 },
} as const
export interface WorldEnvironmentConfig {
  timeZone: 'Asia/Seoul'
  epochMs: number
  dayDurationMs: number
}
export function smoothRange(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export function positiveModulo(x: number, period: number) {
  return ((x % period) + period) % period
}
export function sampleDay(
  serverTime: number,
  config: WorldEnvironmentConfig = ENVIRONMENT,
) {
  const phase =
    positiveModulo(serverTime - config.epochMs, config.dayDurationMs) /
    config.dayDurationMs
  const hour = phase * 24
  const angle = (phase - 0.25) * Math.PI * 2
  const elevation = Math.sin(angle)
  return {
    hour,
    elevation,
    daylight: smoothRange(-0.18, 0.35, elevation),
    night: 1 - smoothRange(-0.18, 0.14, elevation),
    twilight: 1 - smoothRange(0.02, 0.45, Math.abs(elevation)),
    sunX: Math.cos(angle),
    sunY: elevation,
    sunZ: 0.3,
  }
}
/** Crossfade ends exactly at each ten-second boundary; late joiners need no timer history. */
export function sampleAdvertisement(serverTime: number, count: number) {
  if (!Number.isInteger(count) || count < 1)
    return { current: 0, next: 0, blend: 0 }
  const slot = Math.floor(serverTime / ENVIRONMENT.adDurationMs)
  const elapsed = positiveModulo(serverTime, ENVIRONMENT.adDurationMs)
  return {
    current: positiveModulo(slot, count),
    next: positiveModulo(slot + 1, count),
    blend: smoothRange(
      ENVIRONMENT.adDurationMs - ENVIRONMENT.adFadeMs,
      ENVIRONMENT.adDurationMs,
      elapsed,
    ),
  }
}
/** Monotonic extrapolation continues across hidden tabs; corrections cannot run effects backwards. */
export class EnvironmentClock {
  private anchor = 0
  private at = 0
  private last = 0
  private measured = false
  private bestRtt = Infinity
  private sampleAt = 0
  ready = false
  reset() {
    this.ready = false
    this.last = 0
    this.measured = false
    this.bestRtt = Infinity
    this.sampleAt = 0
  }
  sync(serverMs: number, monotonicMs: number, rttMs?: number) {
    if (!Number.isFinite(serverMs) || serverMs <= 0) return false
    const firstMeasured = rttMs !== undefined && !this.measured
    const betterMeasured = rttMs !== undefined && rttMs < this.bestRtt * 0.5
    if (rttMs !== undefined) {
      // Hidden tabs can deliver queued packets much later than their server timestamp.
      // Prefer a recent low-RTT observation, but relearn changed routes after 30 seconds.
      const expired = monotonicMs - this.sampleAt > 30_000
      if (this.measured && !expired && rttMs > Math.max(250, this.bestRtt * 3))
        return false
      this.bestRtt = expired ? rttMs : Math.min(this.bestRtt, rttMs)
      this.measured = true
      this.sampleAt = monotonicMs
    }
    const target = serverMs + Math.max(0, Math.min(1000, rttMs ?? 0)) / 2
    const predicted = this.anchor + monotonicMs - this.at
    this.anchor =
      !this.ready ||
      firstMeasured ||
      betterMeasured ||
      Math.abs(target - predicted) > 1000
        ? target
        : predicted + (target - predicted) * 0.12
    this.at = monotonicMs
    this.ready = true
    return true
  }
  now(monotonicMs: number) {
    this.last = Math.max(this.last, this.anchor + monotonicMs - this.at)
    return this.last
  }
}
