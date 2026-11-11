import { distractionDefaults, distractionDurationLimits, distractionDurationMs, type DistractionCue, type DistractionKind, type DistractionSettings } from './pigeonDistractionMotion'

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
): DistractionSchedule {
  let state = seed >>> 0
  // Mulberry32 uses explicit 32-bit arithmetic, so a seed can be replayed elsewhere.
  function random() {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const windows: { from: number; to: number; kinds: DistractionKind[] }[] = [
    { from: 10000, to: 30000, kinds: ['manhole', random() < 0.5 ? 'flight' : 'walk'] },
    { from: 30000, to: 45000, kinds: ['flight', 'walk', 'manhole'] },
    // Three short flights leave room for a walk, a manhole and all five gaps.
    { from: 45000, to: 60000, kinds: ['flight', 'flight', 'flight', 'walk', 'manhole'] },
  ]
  const events = windows.flatMap(({ from, to, kinds }): ScheduledEvent[] => {
    for (let i = kinds.length - 1; i > 0; i--) {
      const other = Math.floor(random() * (i + 1))
      const kind = kinds[i]!
      kinds[i] = kinds[other]!
      kinds[other] = kind
    }
    let startMs = from
    let slackMs = to - from
    const slots: { kind: DistractionKind; direction: -1 | 1; reservedMs: number }[] = []
    for (const kind of kinds) {
      const direction = random() < 0.5 ? -1 : 1
      const duration = distractionDurationMs({ kind, direction, startedAt: 0, settings })
      const maximum = kind === 'manhole' ? duration : distractionDurationLimits[kind].max
      // A live slider change within the preview's bounds still fits the slot.
      const reservedMs = Math.max(duration, maximum) + eventGapMs + startHeadroomMs
      if (reservedMs > slackMs) continue
      slackMs -= reservedMs
      slots.push({ kind, direction, reservedMs })
    }
    // Sorted offsets scatter the starts without consuming the reserved gaps.
    const offsets = slots.map(() => Math.floor(random() * (slackMs + 1))).sort((a, b) => a - b)
    return slots.map(({ kind, direction, reservedMs }, i) => {
      const atMs = startMs + offsets[i]!
      startMs += reservedMs
      return { atMs, windowEndMs: to, kind, direction, status: 'pending' }
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
