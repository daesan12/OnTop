import { manholeDurationMs, sampleManholeDistraction } from './manholeDistractionMotion'

export const distractionDurationLimits = {
  flight: { min: 600, max: 900 },
  walk: { min: 1800, max: 3600 },
}

export const distractionDefaults = {
  flightScale: 0.66,
  flightDurationMs: 780,
  flightHeight: 0.24,
  flightDistance: 2.4,
  walkScale: 0.64,
  walkDurationMs: 2700,
  walkSpan: 4.4,
  walkDepth: 1.05,
}

export type DistractionSettings = typeof distractionDefaults
export type DistractionKind = 'flight' | 'walk' | 'manhole'
export type DistractionCue = {
  kind: DistractionKind
  direction: -1 | 1
  startedAt: number
  settings: DistractionSettings
}

export function distractionDurationMs({ kind, settings }: DistractionCue) {
  if (kind === 'manhole') return manholeDurationMs
  return kind === 'flight' ? settings.flightDurationMs : settings.walkDurationMs
}

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

const stride = 0.84
const stance = 0.57

export function sampleWalkFoot(cycle: number) {
  const phase = cycle - Math.floor(cycle)
  const front = stride * stance * 0.5
  // While planted, local motion cancels the actor's world travel exactly.
  if (phase <= stance) return { z: front - stride * phase, y: 0, pitch: 0 }
  const swing = (phase - stance) / (1 - stance)
  const lift = Math.sin(Math.PI * swing) ** 2
  return { z: -front + 2 * front * smooth(swing), y: 0.13 * lift, pitch: -0.23 * lift }
}

export function sampleDistraction(cue: DistractionCue, now: number) {
  const { kind, direction, startedAt, settings } = cue
  const elapsed = now - startedAt
  const duration = distractionDurationMs(cue)
  if (elapsed < 0 || elapsed >= duration) return null
  if (kind === 'manhole') return { kind, direction, scale: 0.55, ...sampleManholeDistraction(elapsed, direction) }
  const progress = elapsed / duration
  const cross = 2 * progress - 1
  if (kind === 'flight') {
    const beat = elapsed / 1000 * 6.2 * 2 * Math.PI
    return {
      kind, direction, scale: settings.flightScale,
      cross: direction * cross,
      depth: settings.flightDistance * (1 + 0.68 * cross * cross + 0.07 * cross),
      height: settings.flightHeight + 0.17 * Math.sin(Math.PI * progress) + 0.045 * Math.cos(beat),
      flap: Math.sin(beat),
      bank: 0.21 * cross + 0.12 * Math.sin(beat * 0.5),
    }
  }

  const distance = settings.walkSpan * progress
  const cycle = distance / (settings.walkScale * stride)
  const sway = Math.sin(cycle * 2 * Math.PI)
  const step = Math.sin(cycle * 4 * Math.PI)
  return {
    kind, direction, scale: settings.walkScale,
    across: direction * (distance - settings.walkSpan / 2), depth: settings.walkDepth,
    opacity: Math.min(smooth(progress / 0.065), smooth((1 - progress) / 0.085)),
    left: sampleWalkFoot(cycle), right: sampleWalkFoot(cycle + 0.5),
    bob: 0.033 * step, sway: 0.09 * sway, head: 0.075 * step,
  }
}

export type DistractionPose = NonNullable<ReturnType<typeof sampleDistraction>>
