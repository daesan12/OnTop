import { distractionDefaults, distractionDurationLimits, distractionDurationMs, type DistractionCue, type DistractionKind, type DistractionSettings } from './pigeonDistractionMotion'

const eventGapMs = 1000
const maxLateStartMs = 1000
const startHeadroomMs = 250
/** Distractions may overlap: each window packs its events into this many parallel tracks at most. */
export const distractionLanes = 2

type EventStatus = 'pending' | 'running' | 'finished' | 'skipped' | 'cancelled'
type ScheduledEvent = Pick<DistractionCue, 'kind' | 'direction'> & {
  atMs: number
  windowEndMs: number
  /** Events on one track run one at a time with the usual gap. Different tracks may overlap. */
  lane: number
  status: EventStatus
}

export type DistractionRun = { index: number; lane: number; cue: DistractionCue }
export type DistractionSchedule = {
  seed: number
  events: ScheduledEvent[]
  active: DistractionRun[]
  startedCount: number
  /** Per track: no new start before this play time. */
  blockedUntilMs: number[]
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
  const windows: { from: number; to: number; lanes: number; kinds: DistractionKind[] }[] = [
    { from: 10000, to: 30000, lanes: 1, kinds: ['manhole', random() < 0.5 ? 'flight' : 'walk'] },
    // The poop raid takes this window's flight slot. Same draw count, so the other windows replay unchanged.
    { from: 30000, to: 45000, lanes: 1, kinds: ['poop', 'walk', 'manhole'] },
    // Seven events need about 24 s of slots, so the final window runs two overlapping tracks.
    { from: 45000, to: 60000, lanes: distractionLanes, kinds: ['flight', 'flight', 'flight', 'walk', 'walk', 'manhole', 'poop'] },
  ]
  const events = windows.flatMap(({ from, to, lanes, kinds }): ScheduledEvent[] => {
    for (let i = kinds.length - 1; i > 0; i--) {
      const other = Math.floor(random() * (i + 1))
      const kind = kinds[i]!
      kinds[i] = kinds[other]!
      kinds[other] = kind
    }
    const slackMs = Array.from({ length: lanes }, () => to - from)
    const slots: { kind: DistractionKind; direction: -1 | 1; reservedMs: number }[][] = slackMs.map(() => [])
    for (const kind of kinds) {
      const direction = random() < 0.5 ? -1 : 1
      const duration = distractionDurationMs({ kind, direction, startedAt: 0, settings })
      const maximum = kind === 'flight' || kind === 'walk' ? distractionDurationLimits[kind].max : duration
      // A live slider change within the preview's bounds still fits the slot.
      const reservedMs = Math.max(duration, maximum) + eventGapMs + startHeadroomMs
      // The emptiest track takes the next event. With one track this is the original sequential packing.
      const lane = slackMs.indexOf(Math.max(...slackMs))
      if (reservedMs > slackMs[lane]!) continue
      slackMs[lane]! -= reservedMs
      slots[lane]!.push({ kind, direction, reservedMs })
    }
    return slots.flatMap((track, lane) => {
      // Sorted offsets scatter the starts without consuming the reserved gaps.
      const offsets = track.map(() => Math.floor(random() * (slackMs[lane]! + 1))).sort((a, b) => a - b)
      let startMs = from
      return track.map(({ kind, direction, reservedMs }, i): ScheduledEvent => {
        const atMs = startMs + offsets[i]!
        startMs += reservedMs
        return { atMs, windowEndMs: to, lane, kind, direction, status: 'pending' }
      })
    }).sort((a, b) => a.atMs - b.atMs)
  })
  return { seed: seed >>> 0, events, active: [], startedCount: 0, blockedUntilMs: Array(distractionLanes).fill(0) }
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

  if (next.active.length) {
    const cancelled = !enabled || mode === 'inactive' || mode === 'miss' || mode === 'ended'
    const ended = next.active.filter(({ cue }) => cancelled || playedMs >= cue.startedAt + distractionDurationMs(cue))
    if (ended.length) {
      for (const { index } of ended) mark(index, cancelled ? 'cancelled' : 'finished')
      next = {
        ...next,
        active: next.active.filter(run => !ended.includes(run)),
        blockedUntilMs: next.blockedUntilMs.map((until, lane) => ended.some(run => run.lane === lane) ? playedMs + eventGapMs : until),
      }
    }
  }
  // The play clock is frozen through MISS, so every track's gap starts on resumption.
  if (mode === 'miss' && next.blockedUntilMs.some(until => until < playedMs + eventGapMs)) {
    next = { ...next, blockedUntilMs: next.blockedUntilMs.map(until => Math.max(until, playedMs + eventGapMs)) }
  }
  if (mode !== 'playing') return next

  // A track waits for its earlier event before a later one may start, so each track keeps its order.
  const waiting = new Set<number>()
  for (const [index, event] of next.events.entries()) {
    if (event.status !== 'pending' || event.atMs > playedMs) continue
    const cue = { kind: event.kind, direction: event.direction, startedAt: playedMs, settings }
    const latestStartMs = Math.min(event.windowEndMs - distractionDurationMs(cue), event.atMs + maxLateStartMs)
    if (!enabled || playedMs > latestStartMs) {
      mark(index, 'skipped')
      continue
    }
    const { lane } = event
    if (waiting.has(lane) || previewBusy || playedMs < next.blockedUntilMs[lane]! || next.active.some(run => run.lane === lane)) {
      waiting.add(lane)
      continue
    }
    mark(index, 'running')
    next = { ...next, active: [...next.active, { index, lane, cue }], startedCount: next.startedCount + 1 }
    waiting.add(lane)
  }
  return next
}
