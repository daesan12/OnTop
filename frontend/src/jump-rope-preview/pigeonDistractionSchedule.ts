import { distractionDefaults, distractionDurationMs, type DistractionCue, type DistractionSettings } from './pigeonDistractionMotion'

const eventsPerWindow = {
  increasing: [1, 2, 3],
  light: [1, 1, 1],
} as const
export type DistractionFrequency = keyof typeof eventsPerWindow

const windowMs = 15000
const eventGapMs = 1000
const maxLateStartMs = 1000
const startHeadroomMs = 250

type EventStatus = 'pending' | 'running' | 'finished' | 'skipped' | 'cancelled'
type ScheduledEvent = Pick<DistractionCue, 'kind' | 'direction'> & {
  atMs: number
  windowEndMs: number
  status: EventStatus
}

export type DistractionSchedule = {
  seed: number
  events: ScheduledEvent[]
  active: { index: number; cue: DistractionCue } | null
  startedCount: number
  blockedUntilMs: number
}

export function createDistractionSchedule(
  seed: number,
  settings: DistractionSettings = distractionDefaults,
  frequency: DistractionFrequency = 'increasing',
): DistractionSchedule {
  let state = seed >>> 0
  // Mulberry32 uses explicit 32-bit arithmetic, so a seed can be replayed elsewhere.
  function random() {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const counts = eventsPerWindow[frequency]
  const total = counts.reduce<number>((sum, count) => sum + count, 0)
  // Exclude all-flight and all-walk patterns.
  const pattern = 1 + Math.floor(random() * ((1 << total) - 2))
  let index = 0
  const events = counts.flatMap((count, window): ScheduledEvent[] => {
    let startMs = (window + 1) * windowMs
    const endMs = startMs + windowMs
    const cues = Array.from({ length: count }, (): DistractionCue => ({
      kind: (pattern & (1 << index++)) !== 0 ? 'flight' : 'walk',
      direction: random() < 0.5 ? -1 : 1,
      startedAt: 0,
      settings,
    }))
    const reservedMs = (cue: DistractionCue) => distractionDurationMs(cue) + eventGapMs + startHeadroomMs
    const slackMs = windowMs - cues.reduce((sum, cue) => sum + reservedMs(cue), 0)
    // Sorted offsets scatter the starts without consuming the reserved gaps.
    const offsets = cues.map(() => Math.floor(random() * (slackMs + 1))).sort((a, b) => a - b)
    return cues.map((cue, i) => {
      const atMs = startMs + offsets[i]!
      startMs += reservedMs(cue)
      return { atMs, windowEndMs: endMs, kind: cue.kind, direction: cue.direction, status: 'pending' }
    })
  })
  return { seed: seed >>> 0, events, active: null, startedCount: 0, blockedUntilMs: 0 }
}

type Tick = {
  playedMs: number
  mode: 'playing' | 'paused' | 'inactive' | 'miss' | 'ended'
  enabled: boolean
  previewBusy: boolean
  settings: DistractionSettings
}

export function advanceDistractionSchedule(schedule: DistractionSchedule, { playedMs, mode, enabled, previewBusy, settings }: Tick) {
  let next = schedule
  function mark(index: number, status: EventStatus) {
    next = { ...next, events: next.events.map((event, i) => i === index ? { ...event, status } : event) }
  }

  if (next.active) {
    const { index, cue } = next.active
    const cancelled = !enabled || mode === 'inactive' || mode === 'miss' || mode === 'ended'
    if (cancelled || playedMs >= cue.startedAt + distractionDurationMs(cue)) {
      mark(index, cancelled ? 'cancelled' : 'finished')
      next.active = null
      next.blockedUntilMs = playedMs + eventGapMs
    }
  }
  // The play clock is frozen through MISS, so the gap starts on resumption.
  if (mode === 'miss' && next.blockedUntilMs < playedMs + eventGapMs) {
    next = { ...next, blockedUntilMs: playedMs + eventGapMs }
  }
  if (mode !== 'playing') return next

  for (const [index, event] of next.events.entries()) {
    if (event.status !== 'pending' || event.atMs > playedMs) continue
    const cue = { kind: event.kind, direction: event.direction, startedAt: playedMs, settings }
    const latestStartMs = Math.min(event.windowEndMs - distractionDurationMs(cue), event.atMs + maxLateStartMs)
    if (!enabled || playedMs > latestStartMs) {
      mark(index, 'skipped')
      continue
    }
    if (next.active || previewBusy || playedMs < next.blockedUntilMs) break

    mark(index, 'running')
    next.active = { index, cue }
    next.startedCount += 1
    break
  }
  return next
}
