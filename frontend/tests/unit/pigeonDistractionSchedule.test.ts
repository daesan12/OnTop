import { describe, expect, it } from 'vitest'
import { distractionDefaults, distractionDurationMs, sampleDistraction } from '../../src/jump-rope-preview/pigeonDistractionMotion'
import { advanceDistractionSchedule, createDistractionSchedule } from '../../src/jump-rope-preview/pigeonDistractionSchedule'

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

describe('seeded pigeon distraction schedule', () => {
  it('replays the same seed and fits both kinds into increasingly busy windows', () => {
    for (const settings of [distractionDefaults, { ...distractionDefaults, flightDurationMs: 900, walkDurationMs: 3600 }]) {
      for (const seed of [0, 1, 3, 389, 0xffffffff]) {
        const schedule = createDistractionSchedule(seed, settings)
        expect(schedule).toEqual(createDistractionSchedule(seed, settings))
        expect(new Set(schedule.events.map(event => event.kind))).toEqual(new Set(['flight', 'walk']))
        const counts = [0, 0, 0, 0]
        let previousEnd = 0
        for (const event of schedule.events) {
          const window = Math.floor(event.atMs / 15000)
          counts[window]! += 1
          expect(event.windowEndMs).toBe((window + 1) * 15000)
          expect(event.atMs - previousEnd).toBeGreaterThanOrEqual(1000)
          previousEnd = event.atMs + distractionDurationMs({ ...event, startedAt: event.atMs, settings })
          expect(previousEnd).toBeLessThan(event.windowEndMs)
        }
        expect(counts).toEqual([0, 1, 2, 3])
      }
    }
    expect(createDistractionSchedule(389).events).not.toEqual(createDistractionSchedule(390).events)
  })

  it('keeps a lighter frequency available with the same seed guarantees', () => {
    const light = createDistractionSchedule(389, distractionDefaults, 'light')
    expect(light).toEqual(createDistractionSchedule(389, distractionDefaults, 'light'))
    expect(light.events.map(event => event.windowEndMs)).toEqual([30000, 45000, 60000])
    expect(new Set(light.events.map(event => event.kind))).toEqual(new Set(['flight', 'walk']))
  })

  it('starts each event once, even when a frame crosses its start time', () => {
    const { plan, tick } = run()
    for (const [index, event] of plan.events.entries()) {
      expect(tick(event.atMs - 1).active).toBeNull()
      const observedAt = event.atMs + 170
      const started = tick(observedAt)
      expect(started.active?.cue).toMatchObject({ kind: event.kind, startedAt: observedAt, direction: event.direction })
      expect(started.startedCount).toBe(index + 1)
      expect(tick(observedAt)).toBe(started)
      const until = observedAt + distractionDurationMs(started.active!.cue)
      expect(tick(until).active).toBeNull()
      expect(tick(until + 1).events[index]?.status).toBe('finished')
    }
    expect(tick(60000, { mode: 'ended' })).toMatchObject({ active: null, startedCount: 6 })
  })

  it('holds a paused pose, stops on MISS, and starts no event during a countdown or after ending', () => {
    const { plan, tick } = run()
    const [first, second, third] = plan.events
    expect(tick(first!.atMs, { mode: 'inactive' }).startedCount).toBe(0)
    expect(tick(first!.atMs, { mode: 'paused' }).startedCount).toBe(0)
    const started = tick(first!.atMs)
    const stoppedAt = first!.atMs + 250
    const pose = sampleDistraction(started.active!.cue, stoppedAt)
    const paused = tick(stoppedAt, { mode: 'paused' })
    expect(tick(stoppedAt, { mode: 'paused' })).toBe(paused)
    expect(sampleDistraction(paused.active!.cue, stoppedAt)).toEqual(pose)
    expect(tick(stoppedAt, { mode: 'miss' })).toMatchObject({ active: null, startedCount: 1 })
    expect(tick(stoppedAt).events[0]?.status).toBe('cancelled')
    expect(tick(second!.atMs).startedCount).toBe(2)
    expect(tick(second!.atMs + 50, { mode: 'ended' }).active).toBeNull()
    expect(tick(third!.atMs, { mode: 'ended' })).toMatchObject({ active: null, startedCount: 2 })
    expect(createDistractionSchedule(plan.seed)).toEqual(plan)
  })

  it('waits for a full second of play after a MISS, even with no active event', () => {
    const { plan, tick } = run()
    const first = plan.events[0]!
    const missAt = first.atMs - 400
    const stopped = tick(missAt, { mode: 'miss' })
    expect(tick(missAt, { mode: 'miss' })).toBe(stopped)
    expect(tick(missAt, { mode: 'paused' })).toBe(stopped)
    expect(tick(first.atMs).active).toBeNull()
    expect(tick(missAt + 999).active).toBeNull()
    expect(tick(missAt + 1000).active?.cue.startedAt).toBe(missAt + 1000)
    expect(tick(missAt + 1000).events.slice(1)).toEqual(plan.events.slice(1))
  })

  it('enforces the gap from actual completion after a delayed frame', () => {
    const { plan, tick } = run()
    const [first, second] = plan.events
    const started = tick(first!.atMs)
    const delayed = tick(second!.atMs)
    expect(started.startedCount).toBe(1)
    expect(delayed).toMatchObject({ active: null, startedCount: 1 })
    expect(delayed.events[0]?.status).toBe('finished')
    expect(tick(second!.atMs + 999).active).toBeNull()
    expect(tick(second!.atMs + 1000).active?.index).toBe(1)
  })

  it('skips stale windows and prevents a manual preview from sharing the stage', () => {
    const { plan, tick } = run()
    const last = plan.events.at(-1)!
    const held = tick(last.atMs + 10, { previewBusy: true })
    expect(held.events.map(event => event.status)).toEqual([...Array(5).fill('skipped'), 'pending'])
    expect(held.active).toBeNull()
    const started = tick(last.atMs + 90)
    expect(started).toMatchObject({ startedCount: 1, active: { index: 5 } })
    expect(tick(last.atMs + 100, { enabled: false }).events[5]?.status).toBe('cancelled')
    expect(tick(last.atMs + 110).active).toBeNull()
  })

  it('does not catch up an event whose due time passed while auto was off', () => {
    const { plan, tick } = run()
    const at = plan.events[0]!.atMs
    expect(tick(at, { enabled: false }).events[0]?.status).toBe('skipped')
    expect(tick(at + 1).startedCount).toBe(0)
    expect(tick(plan.events[1]!.atMs).startedCount).toBe(1)
  })
})
