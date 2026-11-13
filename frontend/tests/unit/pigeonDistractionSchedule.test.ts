import { describe, expect, it } from 'vitest'
import { distractionDefaults, distractionDurationLimits, distractionDurationMs, sampleDistraction, type DistractionKind, type DistractionSettings } from '../../src/jump-rope-preview/pigeonDistractionMotion'
import { poopDurationMs, poopFadeMs, poopImpactMs, poopPigeon, poopSplatOpacity } from '../../src/jump-rope-preview/poopDistractionMotion'
import { finaleImpactMs, sampleFinaleFlight } from '../../src/jump-rope-preview/gameOverFinale'
import { advanceDistractionSchedule, createDistractionSchedule, distractionLanes } from '../../src/jump-rope-preview/pigeonDistractionSchedule'

/**
 * The single-track schedule from before overlapping distractions, kept as the regression oracle for the
 * 10-30 s and 30-45 s windows. `middle` is that window's kinds: the poop raid replaced its flight earlier.
 */
function legacySchedule(seed: number, settings: DistractionSettings, middle: DistractionKind[]) {
  let state = seed >>> 0
  function random() {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const windows: { from: number; to: number; kinds: DistractionKind[] }[] = [
    { from: 10000, to: 30000, kinds: ['manhole', random() < 0.5 ? 'flight' : 'walk'] },
    { from: 30000, to: 45000, kinds: [...middle] },
    { from: 45000, to: 60000, kinds: ['flight', 'flight', 'flight', 'walk', 'manhole'] },
  ]
  return windows.flatMap(({ from, to, kinds }) => {
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
      const maximum = kind === 'flight' || kind === 'walk' ? distractionDurationLimits[kind].max : duration
      const reservedMs = Math.max(duration, maximum) + 1000 + 250
      if (reservedMs > slackMs) continue
      slackMs -= reservedMs
      slots.push({ kind, direction, reservedMs })
    }
    const offsets = slots.map(() => Math.floor(random() * (slackMs + 1))).sort((a, b) => a - b)
    return slots.map(({ kind, direction, reservedMs }, i) => {
      const atMs = startMs + offsets[i]!
      startMs += reservedMs
      return { atMs, windowEndMs: to, lane: 0, kind, direction, status: 'pending' as const }
    })
  })
}

const slow = { ...distractionDefaults, flightDurationMs: 900, walkDurationMs: 3600 }
const seeds = [...Array.from({ length: 200 }, (_, i) => i * 7919), 389, 409, 0xffffffff]

function run(seed = 389) {
  let schedule = createDistractionSchedule(seed)
  function tick(playedMs: number, overrides: Partial<Parameters<typeof advanceDistractionSchedule>[1]> = {}) {
    schedule = advanceDistractionSchedule(schedule, {
      playedMs, mode: 'playing', enabled: true, previewBusy: false, settings: distractionDefaults, ...overrides,
    })
    return schedule
  }
  return { plan: schedule, tick }
}

/** A seed whose final window has two distractions on screen at the same time. */
function overlappingSeed() {
  for (let seed = 1; ; seed++) {
    const events = createDistractionSchedule(seed).events.filter(event => event.windowEndMs === 60000)
    const pair = events.find(first => events.some(second => second.lane !== first.lane
      && second.atMs > first.atMs + 100 && second.atMs + 100 < first.atMs + distractionDurationMs({ ...first, startedAt: 0, settings: distractionDefaults })))
    if (pair) return seed
  }
}

describe('seeded pigeon distraction schedule', () => {
  it('replays the seed and fits 2, 3 and 7 events, at most two at once and one second apart on each track', () => {
    const boundaries = [10000, 30000, 45000, 60000]
    for (const settings of [distractionDefaults, slow]) {
      for (const seed of seeds) {
        const schedule = createDistractionSchedule(seed, settings)
        expect(schedule).toEqual(createDistractionSchedule(seed, settings))
        const kinds = schedule.events.map(event => event.kind)
        expect(new Set(kinds)).toEqual(new Set(['flight', 'walk', 'manhole', 'poop']))
        expect(kinds.filter(kind => kind === 'manhole')).toHaveLength(3)
        expect(schedule.events.filter(event => event.kind === 'poop').map(event => event.windowEndMs)).toEqual([45000, 60000])
        const last = schedule.events.filter(event => event.windowEndMs === 60000).map(event => event.kind).sort()
        expect(last).toEqual(['flight', 'flight', 'flight', 'manhole', 'poop', 'walk', 'walk'])
        const counts = [0, 0, 0, 0]
        const previousEnd = new Map<string, number>()
        for (const event of schedule.events) {
          const window = boundaries.findIndex(end => event.atMs < end)
          counts[window]! += 1
          expect(event.windowEndMs).toBe(boundaries[window])
          expect(event.lane).toBeLessThan(event.windowEndMs === 60000 ? distractionLanes : 1)
          const track = `${event.windowEndMs}:${event.lane}`
          expect(event.atMs - (previousEnd.get(track) ?? boundaries[window - 1]!)).toBeGreaterThanOrEqual(previousEnd.has(track) ? 1000 : 0)
          const end = event.atMs + distractionDurationMs({ ...event, startedAt: event.atMs, settings })
          previousEnd.set(track, end)
          expect(end).toBeLessThan(event.windowEndMs)
        }
        expect(counts).toEqual([0, 2, 3, 7])
        expect(schedule.events.map(event => event.atMs)).toEqual(schedule.events.map(event => event.atMs).sort((a, b) => a - b))
      }
    }
    expect(createDistractionSchedule(389).events).not.toEqual(createDistractionSchedule(390).events)
  })

  it('keeps the 10-30 s and 30-45 s windows exactly as before', () => {
    for (const settings of [distractionDefaults, { ...distractionDefaults, flightDurationMs: 600, walkDurationMs: 1800 }, slow]) {
      for (const seed of seeds) {
        const now = createDistractionSchedule(seed, settings).events.filter(event => event.windowEndMs !== 60000)
        const original = legacySchedule(seed, settings, ['flight', 'walk', 'manhole'])
        const withRaid = legacySchedule(seed, settings, ['poop', 'walk', 'manhole'])
        // 10-30 s is untouched since before the raid; 30-45 s matches the raid's single-track layout.
        expect(now.filter(event => event.windowEndMs === 30000)).toEqual(original.filter(event => event.windowEndMs === 30000))
        expect(now).toEqual(withRaid.filter(event => event.windowEndMs !== 60000))
      }
    }
  })

  it('starts all twelve events on time at 60 FPS, overlapping two tracks, even with maximum durations', () => {
    let overlapSeen = false
    for (const seed of [389, overlappingSeed()]) {
      const { plan, tick } = run(seed)
      const started = new Map<number, number>()
      let mostAtOnce = 0
      for (let frame = 0; frame <= 3600; frame++) {
        const playedMs = frame * (1000 / 60)
        const schedule = tick(playedMs, { settings: playedMs < 30000 ? distractionDefaults : slow })
        mostAtOnce = Math.max(mostAtOnce, schedule.active.length)
        expect(new Set(schedule.active.map(run => run.lane)).size).toBe(schedule.active.length)
        for (const { index, cue } of schedule.active) if (!started.has(index)) started.set(index, cue.startedAt)
      }
      expect(started.size).toBe(12)
      for (const [index, startedAt] of started) {
        expect(startedAt - plan.events[index]!.atMs).toBeGreaterThanOrEqual(0)
        expect(startedAt - plan.events[index]!.atMs).toBeLessThan(1000 / 60)
      }
      expect(mostAtOnce).toBeLessThanOrEqual(distractionLanes)
      overlapSeen ||= mostAtOnce === distractionLanes
      expect(tick(60000, { mode: 'ended' }).events.every(event => event.status === 'finished')).toBe(true)
    }
    expect(overlapSeen).toBe(true)
  })

  it('runs two tracks at once in the final window, and a MISS stops both and holds both for a second', () => {
    const { plan, tick } = run(overlappingSeed())
    const last = plan.events.filter(event => event.windowEndMs === 60000)
    const second = last.find(event => last.some(first => first.lane !== event.lane && first.atMs < event.atMs
      && event.atMs < first.atMs + distractionDurationMs({ ...first, startedAt: 0, settings: distractionDefaults })))!
    for (let playedMs = 0; playedMs < second.atMs + 50; playedMs += 1000 / 60) tick(playedMs)
    const both = tick(second.atMs + 50)
    expect(both.active.map(run => run.lane).sort()).toEqual([0, 1])
    const missAt = second.atMs + 60
    const stopped = tick(missAt, { mode: 'miss' })
    expect(stopped.active).toEqual([])
    expect(both.active.every(run => stopped.events[run.index]!.status === 'cancelled')).toBe(true)
    expect(stopped.blockedUntilMs).toEqual([missAt + 1000, missAt + 1000])
  })

  it('holds a paused pose, stops on MISS, and starts no event during a countdown or after ending', () => {
    const { plan, tick } = run()
    const [first, second, third] = plan.events
    expect(tick(first!.atMs, { mode: 'inactive' }).startedCount).toBe(0)
    expect(tick(first!.atMs, { mode: 'paused' }).startedCount).toBe(0)
    const started = tick(first!.atMs)
    const stoppedAt = first!.atMs + 250
    const pose = sampleDistraction(started.active[0]!.cue, stoppedAt)
    const paused = tick(stoppedAt, { mode: 'paused' })
    expect(tick(stoppedAt, { mode: 'paused' })).toBe(paused)
    expect(sampleDistraction(paused.active[0]!.cue, stoppedAt)).toEqual(pose)
    expect(tick(stoppedAt, { mode: 'miss' })).toMatchObject({ active: [], startedCount: 1 })
    expect(tick(stoppedAt).events[0]?.status).toBe('cancelled')
    expect(tick(second!.atMs).startedCount).toBe(2)
    expect(tick(second!.atMs + 50, { mode: 'ended' }).active).toEqual([])
    expect(tick(third!.atMs, { mode: 'ended' })).toMatchObject({ active: [], startedCount: 2 })
    expect(createDistractionSchedule(plan.seed)).toEqual(plan)
  })

  it('waits for a full second of play after a MISS, even with no active event', () => {
    const { plan, tick } = run()
    const first = plan.events[0]!
    const missAt = first.atMs - 400
    const stopped = tick(missAt, { mode: 'miss' })
    expect(tick(missAt, { mode: 'miss' })).toBe(stopped)
    expect(tick(missAt, { mode: 'paused' })).toBe(stopped)
    expect(tick(first.atMs).active).toEqual([])
    expect(tick(missAt + 999).active).toEqual([])
    expect(tick(missAt + 1000).active[0]?.cue.startedAt).toBe(missAt + 1000)
    expect(tick(missAt + 1000).events.slice(1)).toEqual(plan.events.slice(1))
  })

  it('freezes an open manhole while paused and drops the pose on MISS, ending or restart', () => {
    for (const mode of ['miss', 'ended'] as const) {
      const { plan, tick } = run()
      const index = plan.events.findIndex(event => event.kind === 'manhole')
      const at = plan.events[index]!.atMs
      for (const event of plan.events.slice(0, index)) tick(event.atMs)
      const started = tick(at)
      expect(started.active.at(-1)?.index).toBe(index)
      const pausedAt = at + 800
      const paused = tick(pausedAt, { mode: 'paused' })
      const pose = sampleDistraction(paused.active.at(-1)!.cue, pausedAt)
      expect(pose).toMatchObject({ kind: 'manhole', lid: { y: expect.any(Number) }, bird: expect.any(Object) })
      expect(tick(pausedAt, { mode: 'paused' })).toBe(paused)
      expect(tick(pausedAt + 16).active.at(-1)?.cue).toBe(started.active.at(-1)!.cue)
      const cancelled = tick(pausedAt + 30, { mode })
      expect(cancelled.active).toEqual([])
      expect(cancelled.events[index]?.status).toBe('cancelled')
      expect(cancelled.blockedUntilMs[0]).toBe(pausedAt + 1030)
      expect(createDistractionSchedule(plan.seed)).toMatchObject({ active: [], startedCount: 0, blockedUntilMs: [0, 0] })
    }
  })

  it('enforces the gap from actual completion after a delayed frame', () => {
    const { plan, tick } = run()
    const [first, second] = plan.events
    const started = tick(first!.atMs)
    const delayed = tick(second!.atMs)
    expect(started.startedCount).toBe(1)
    expect(delayed).toMatchObject({ active: [], startedCount: 1 })
    expect(delayed.events[0]?.status).toBe('finished')
    expect(tick(second!.atMs + 999).active).toEqual([])
    expect(tick(second!.atMs + 1000).active[0]?.index).toBe(1)
  })

  it('skips stale events and prevents a manual preview from sharing the stage', () => {
    const { plan, tick } = run()
    const second = plan.events[1]!
    const held = tick(second.atMs + 10, { previewBusy: true })
    expect(held.events.slice(0, 2).map(event => event.status)).toEqual(['skipped', 'pending'])
    expect(held.active).toEqual([])
    const started = tick(second.atMs + 90)
    expect(started).toMatchObject({ startedCount: 1, active: [{ index: 1 }] })
    expect(tick(second.atMs + 100, { enabled: false }).events[1]?.status).toBe('cancelled')
    expect(tick(second.atMs + 110).active).toEqual([])
  })

  it('does not catch up an event whose due time passed while auto was off', () => {
    const { plan, tick } = run()
    const at = plan.events[0]!.atMs
    expect(tick(at, { enabled: false }).events[0]?.status).toBe('skipped')
    expect(tick(at + 1).startedCount).toBe(0)
    expect(tick(plan.events[1]!.atMs).startedCount).toBe(1)
  })
})

describe('pigeon poop raid distraction', () => {
  const cue = (direction: -1 | 1, startedAt = 0) => ({ kind: 'poop' as const, direction, startedAt, settings: distractionDefaults })

  it('flies the game-over path, splats at the same impact time and fades out over exactly two seconds', () => {
    expect(poopImpactMs).toBe(finaleImpactMs)
    expect(poopFadeMs).toBe(2000)
    expect(poopDurationMs).toBe(finaleImpactMs + 2000)
    expect(distractionDurationMs(cue(1))).toBe(poopDurationMs)
    expect([-1, 1].map(direction => poopPigeon(direction as -1 | 1))).toEqual([1, 2])

    expect(poopSplatOpacity(0)).toBe(0)
    expect(poopSplatOpacity(poopImpactMs - 1)).toBe(0)
    expect(poopSplatOpacity(poopImpactMs)).toBe(1)
    expect(poopSplatOpacity(poopImpactMs + 500)).toBeCloseTo(0.75, 12)
    expect(poopSplatOpacity(poopImpactMs + 1000)).toBeCloseTo(0.5, 12)
    expect(poopSplatOpacity(poopImpactMs + 1999)).toBeCloseTo(0.0005, 12)
    expect(poopSplatOpacity(poopDurationMs)).toBe(0)
    for (let elapsed = poopImpactMs; elapsed < poopDurationMs - 10; elapsed += 10) {
      // Linear: every 10 ms removes the same 0.5 % of opacity.
      expect(poopSplatOpacity(elapsed) - poopSplatOpacity(elapsed + 10)).toBeCloseTo(10 / poopFadeMs, 12)
    }

    const startedAt = 31234
    for (const elapsed of [0, 480, 1000, poopImpactMs, 1700, 2500, poopDurationMs - 1]) {
      const pose = sampleDistraction(cue(-1, startedAt), startedAt + elapsed)
      expect(pose).toEqual({ kind: 'poop', direction: -1, pigeon: 1, elapsed, splat: poopSplatOpacity(elapsed) })
    }
    expect(sampleDistraction(cue(1, startedAt), startedAt + poopDurationMs)).toBeNull()
    // The raider reaches the lens at impact (two thirds of the path) and is gone well before the fade ends.
    expect(sampleFinaleFlight(poopImpactMs)?.path).toBeCloseTo(2 / 3, 12)
    expect(sampleFinaleFlight(poopDurationMs - 1)).toBeNull()
  })

  it('runs as a scheduled event, then a MISS or the round end cancels it at once', () => {
    for (const mode of ['miss', 'ended'] as const) {
      const { plan, tick } = run(409)
      const index = plan.events.findIndex(event => event.kind === 'poop')
      const at = plan.events[index]!.atMs
      const started = tick(at)
      expect(started.active).toMatchObject([{ index, cue: { kind: 'poop', startedAt: at } }])
      const splatAt = at + poopImpactMs + 300
      expect(sampleDistraction(tick(splatAt).active[0]!.cue, splatAt)).toMatchObject({ kind: 'poop', splat: 0.85 })
      const cancelled = tick(splatAt + 10, { mode })
      expect(cancelled.active).toEqual([])
      expect(cancelled.events[index]?.status).toBe('cancelled')
    }
    const { plan, tick } = run(409)
    const index = plan.events.findIndex(event => event.kind === 'poop')
    const at = plan.events[index]!.atMs
    tick(at)
    expect(tick(at + poopDurationMs - 1).active[0]?.index).toBe(index)
    expect(tick(at + poopDurationMs).active).toEqual([])
    expect(tick(at + poopDurationMs + 1).events[index]?.status).toBe('finished')
  })
})
