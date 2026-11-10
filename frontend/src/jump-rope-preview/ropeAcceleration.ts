import { roundDurationMs } from './jumpRopeRules'

export type RopeAcceleration = { startPeriodMs: number; endPeriodMs: number }
export type RopeAccelerationClock = { profile: RopeAcceleration; playedMs: number }

export const defaultRopeAcceleration: RopeAcceleration = { startPeriodMs: 1000, endPeriodMs: 800 }

export function ropePeriodMs(speed: number, clock?: RopeAccelerationClock) {
  if (speed <= 0) return Infinity
  if (!clock) return 1000 / speed
  const { startPeriodMs, endPeriodMs } = clock.profile
  const progress = Math.min(1, Math.max(0, clock.playedMs / roundDurationMs))
  return (startPeriodMs + (Math.min(startPeriodMs, endPeriodMs) - startPeriodMs) * progress) / speed
}

/** Integrate 1 / period over the interval, and invert it to locate each rope passage. */
export function ropeTempo(speed: number, clock?: RopeAccelerationClock) {
  const period = ropePeriodMs(speed, clock)
  const rampMs = clock ? Math.max(0, roundDurationMs - Math.max(0, clock.playedMs)) : 0
  const finalPeriod = clock ? Math.min(clock.profile.startPeriodMs, clock.profile.endPeriodMs) / speed : period
  if (rampMs === 0 || finalPeriod === period) {
    return { turnsDuring: (ms: number) => ms / period, timeForTurns: (turns: number) => turns * period }
  }

  const slope = (period - finalPeriod) / rampMs
  const rampTurns = -Math.log1p(-slope * rampMs / period) / slope
  return {
    turnsDuring(ms: number) {
      if (ms >= rampMs) return rampTurns + (ms - rampMs) / finalPeriod
      return -Math.log1p(-slope * ms / period) / slope
    },
    timeForTurns(turns: number) {
      if (turns >= rampTurns) return rampMs + (turns - rampTurns) * finalPeriod
      return -period * Math.expm1(-slope * turns) / slope
    },
  }
}
