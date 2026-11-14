import { describe, expect, it } from 'vitest'
import rulesV2 from '../../../backend/src/test/resources/jump-rope/rules-v2.json'
import { duckTransitionMs, grandpaSeed } from '../../src/jump-rope-preview/grandpaEvent'
import { advancePreviewRound, createPreviewRound, raidGrandpa, requestRoundJump, resetPreviewRound } from '../../src/jump-rope-preview/previewRound'
import { rankedDurationUs, rankedPassageUs } from '../../src/jump-rope-preview/previewMotion'
import {
  clearRankedDuck, duckReadyUs, planRankedV2, pressRankedDuck, rankedDuckSpans, rankedTiming, rankedV2, rankedV2PassageUs,
  releaseRankedDuck, startRankedV2,
} from '../../src/jump-rope-preview/rankedGrandpa'
import { defaultRopeAcceleration } from '../../src/jump-rope-preview/ropeAcceleration'

/**
 * Story 430: the ranked park game judges rules v2 exactly like the server's JumpRopeRulesV2.
 * The shared fixture was produced by the FE preview engine and is replayed by the server tests too.
 */
const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const startAt = 3123
type FixtureRound = {
  name: string; seed: number; jumpOffsetsUs: number[]; duckSpansUs: number[][]; score: number; perfect: number; good: number
  miss: number; reason: string; dodged: number; hit: number
}
type Fixture = {
  constants: { hitOffsetUs: number; minDangerPeriodUs: number; duckTransitionUs: number }
  random: { seed: number; grandpaSeed: number }[]
  schedules: { seed: number; swings: { kind: string; anchor: number; hitUs: number; stretchUs: number }[]; passagesUs?: number[] }[]
  rounds: FixtureRound[]
}
const fixture = rulesV2 as Fixture
type Key = 'jump' | 'down' | 'up' | 'downS' | 'upS'
type Event = { us: number; key: Key }

function play(seed: number | null) {
  const round = createPreviewRound('menu')
  resetPreviewRound(round, 'initialCountdown', startAt)
  if (seed !== null) startRankedV2(round, seed)
  let now = startAt - 1000
  const step = (at: number) => {
    now = at
    return advancePreviewRound(round, now, 1, settings, 1350, defaultRopeAcceleration)
  }
  const playUs = () => Math.round(round.playedMs * 1000)
  function resume() {
    if (round.phase.kind === 'landing') step(now + 600)
    if (round.phase.kind === 'reaction') step(now + 1350)
  }
  /** Moves the play clock to `us`, resuming after every MISS freeze that ends before it. */
  function reach(us: number): 'playing' | 'frozen' | 'ended' {
    for (let guard = 0; guard < 200; guard++) {
      if (round.endReason) return 'ended'
      if (round.phase.kind !== 'playing' && round.phase.kind !== 'initialCountdown') {
        if (playUs() === us) return 'frozen'
        resume()
        continue
      }
      if (round.phase.kind === 'playing' && playUs() >= us) return 'playing'
      const clock = round.ranked!
      step(round.phase.kind === 'initialCountdown' ? startAt : clock.segmentAt + (us - clock.segmentUs) / 1000)
    }
    throw new Error('stuck')
  }
  function apply({ key }: Event) {
    if (key === 'jump') return requestRoundJump(round, now, 0.6, 0.4)
    if (key === 'down' || key === 'downS') return pressRankedDuck(round, key === 'down' ? 'ArrowDown' : 'KeyS')
    return releaseRankedDuck(round, key === 'up' ? 'ArrowDown' : 'KeyS')
  }
  function finish() {
    for (let guard = 0; guard < 20 && !round.endReason; guard++) {
      reach(rankedDurationUs)
      // The 60 s deadline is a scene time; the next frame after it ends the round.
      if (!round.endReason && round.phase.kind === 'playing') step(now + 1)
    }
  }
  step(startAt)
  return { round, step, reach, apply, finish, playUs, get now() { return now } }
}

/** Plays a log; the result tells which inputs the FE accepted. */
function run(seed: number, events: Event[]) {
  const game = play(seed)
  const accepted = [...events].sort((a, b) => a.us - b.us).map(event => game.reach(event.us) !== 'ended' && game.apply(event))
  game.finish()
  const v2 = game.round.ranked!.v2!
  return {
    ...game, accepted, v2,
    dodged: v2.results.filter(result => result === 'dodged').length,
    hit: v2.results.filter(result => result === 'hit').length,
  }
}

function eventsOf(jumps: readonly number[], spans: readonly (readonly number[])[]): Event[] {
  return [
    ...jumps.map(us => ({ us, key: 'jump' as const })),
    ...spans.flatMap(([start, end]) => [{ us: start!, key: 'down' as const }, { us: end!, key: 'up' as const }]),
  ]
}

const round = (name: string, seed = 42) => fixture.rounds.find(item => item.name === name && item.seed === seed)!
const bot = round('botDodgesEverything')
// Seed 42: the first dangerous swing follows passage 20.
const P20 = 19_347_904, P21 = 20_281_854, CONTACT_20 = P20 + 480_000
const JUMP_20 = P20 - 270_000, JUMP_21 = P21 - 270_000

function withFirstSpan(start: number, end: number, dropJump21: boolean) {
  const jumps = dropJump21 ? bot.jumpOffsetsUs.filter(us => us !== JUMP_21) : bot.jumpOffsetsUs
  return eventsOf(jumps, [[start, end], ...bot.duckSpansUs.slice(1)])
}

describe('Story 430 ranked rules v2 matches the server', () => {
  it('uses the server constants and the preview timing derived from the locked ranked settings', () => {
    expect(rankedTiming.hitOffsetMs * 1000).toBe(fixture.constants.hitOffsetUs)
    expect(rankedTiming.minDangerPeriodMs * 1000).toBe(fixture.constants.minDangerPeriodUs)
    expect(rankedV2).toMatchObject({ hitOffsetUs: 480_000, minDangerPeriodUs: 930_000, duckTransitionUs: 60_000, landingUs: 470_000, maxDuckSpans: 64 })
    expect(duckTransitionMs * 1000).toBe(fixture.constants.duckTransitionUs)
    for (const { seed, grandpaSeed: expected } of fixture.random) expect(grandpaSeed(seed)).toBe(expected)
  })

  it('plans the server schedule, contacts, stretches and passages for every window choice', () => {
    expect(fixture.schedules.length).toBeGreaterThanOrEqual(121)
    for (const expected of fixture.schedules) {
      const { swings } = planRankedV2(expected.seed)
      expect(swings, `seed ${expected.seed}`).toEqual(expected.swings.map(swing => ({ ...swing, kind: swing.kind.toLowerCase() })))
      if (expected.passagesUs) {
        expect(expected.passagesUs.map((_, index) => rankedV2PassageUs(swings, index + 1))).toEqual(expected.passagesUs)
      }
    }
  })

  it('replays every FE preview round with the same result, broom outcomes and submitted logs', () => {
    expect(fixture.rounds.length).toBeGreaterThanOrEqual(30)
    for (const expected of fixture.rounds) {
      const result = run(expected.seed, eventsOf(expected.jumpOffsetsUs, expected.duckSpansUs))
      const label = `${expected.name} seed ${expected.seed}`
      expect(result.round.stats, label).toMatchObject({
        score: expected.score, counts: { perfect: expected.perfect, good: expected.good, miss: expected.miss },
      })
      expect(result.round.endReason === 'time' ? 'TIME' : 'MISS_LIMIT', label).toBe(expected.reason)
      expect({ dodged: result.dodged, hit: result.hit }, label).toEqual({ dodged: expected.dodged, hit: expected.hit })
      expect(result.round.ranked!.offsets, label).toEqual(expected.jumpOffsetsUs)
      expect(rankedDuckSpans(result.v2), label).toEqual(expected.duckSpansUs)
    }
  })

  it('needs the duck complete at the contact; a release at the contact still counts and a press there is late', () => {
    expect(run(42, withFirstSpan(CONTACT_20 - 60_000, CONTACT_20 + 120_000, false)).hit).toBe(0)
    expect(run(42, withFirstSpan(CONTACT_20 - 59_999, CONTACT_20 + 120_000, true)).hit).toBe(1)
    expect(run(42, withFirstSpan(CONTACT_20 - 100_000, CONTACT_20, false)).hit).toBe(0)
    expect(run(42, withFirstSpan(CONTACT_20 - 100_000, CONTACT_20 - 1, true)).hit).toBe(1)
    const late = run(42, withFirstSpan(CONTACT_20, CONTACT_20 + 120_000, true))
    expect(late.hit).toBe(1)
    // One hit costs exactly the next passage: 65 PERFECT, one MISS.
    expect(late.round.stats).toMatchObject({ score: 1920, counts: { perfect: 65, good: 0, miss: 1 } })
  })

  it('refuses Space while ducking, during a stun and at the microsecond of a release, and never logs it', () => {
    const stunned = run(42, withFirstSpan(CONTACT_20 - 10_000, CONTACT_20 + 10_000, false))
    // The bot's PERFECT jump for passage 21 falls inside the stun after the late duck.
    expect(stunned.round.ranked!.offsets).not.toContain(JUMP_21)
    expect(stunned.hit).toBe(1)

    const held = run(42, [...eventsOf(bot.jumpOffsetsUs.filter(us => us !== JUMP_21), bot.duckSpansUs),
      { us: JUMP_21, key: 'down' }, { us: JUMP_21 + 1, key: 'jump' }, { us: JUMP_21 + 2_000, key: 'up' }, { us: JUMP_21 + 2_000, key: 'jump' }])
    expect(held.round.ranked!.offsets).not.toContain(JUMP_21 + 1)
    expect(held.round.ranked!.offsets).not.toContain(JUMP_21 + 2_000)
    expect(rankedDuckSpans(held.v2)).toContainEqual([JUMP_21, JUMP_21 + 2_000])
  })

  it('logs a press in the microsecond of an accepted jump one microsecond later, with the same outcome', () => {
    const result = run(42, [...eventsOf(bot.jumpOffsetsUs, bot.duckSpansUs.slice(1)),
      { us: JUMP_20, key: 'down' }, { us: CONTACT_20 + 120_000, key: 'up' }])
    expect(result.round.ranked!.offsets).toContain(JUMP_20)
    expect(rankedDuckSpans(result.v2)[0]).toEqual([JUMP_20 + 1, CONTACT_20 + 120_000])
    // Airborne: the duck starts at touchdown, 470 ms after the jump, well before the contact.
    expect(result.hit).toBe(0)
  })

  it('waits for touchdown after a late jump unless a MISS restarts the held duck', () => {
    const late = P20 + 245_000
    const airborne = run(42, eventsOf(bot.jumpOffsetsUs.map(us => us === JUMP_21 ? late : us),
      [[late + 1, CONTACT_20 + 120_000], ...bot.duckSpansUs.slice(1)]))
    expect(airborne.hit).toBe(1)

    // A 40 ms lead misses passage 20, so the duck pressed in the air restarts at the passage and is ready in time.
    const tooLate = P20 - 40_000
    const restarted = run(42, eventsOf(bot.jumpOffsetsUs.map(us => us === JUMP_20 ? tooLate : us),
      [[tooLate + 1, CONTACT_20 + 120_000], ...bot.duckSpansUs.slice(1)]))
    expect(tooLate + rankedV2.landingUs + rankedV2.duckTransitionUs).toBeGreaterThan(CONTACT_20)
    expect(restarted.hit).toBe(0)
    expect(restarted.round.stats.counts.miss).toBe(1)
  })

  it('logs duck changes in a MISS freeze at the frozen passage and merges a release and press there', () => {
    const jumps = bot.jumpOffsetsUs.filter(us => us !== JUMP_20)
    const game = play(42)
    for (const us of jumps.filter(us => us < P20)) { game.reach(us); game.apply({ us, key: 'jump' }) }
    game.reach(P20 - 300_000)
    expect(game.apply({ us: 0, key: 'down' })).toBe(true)
    expect(game.reach(P20)).toBe('frozen')
    expect(game.round.stats.counts.miss).toBe(1)
    // Held through the MISS: ready again 60 ms after the passage.
    expect(duckReadyUs(game.round.ranked!.v2!)).toBe(P20)
    expect(game.apply({ us: P20, key: 'up' })).toBe(true)
    expect(game.apply({ us: P20, key: 'down' })).toBe(true)
    expect(game.round.ranked!.v2!.spans).toEqual([])
    game.reach(CONTACT_20 + 120_000)
    game.apply({ us: 0, key: 'up' })
    expect(game.round.ranked!.v2!.spans).toEqual([[P20 - 300_000, CONTACT_20 + 120_000]])
    expect(game.round.ranked!.v2!.results[1]).toBe('dodged')

    // A press and release inside one freeze leaves no span.
    const fresh = play(42)
    for (const us of jumps.filter(us => us < P20)) { fresh.reach(us); fresh.apply({ us, key: 'jump' }) }
    expect(fresh.reach(P20)).toBe('frozen')
    fresh.apply({ us: P20, key: 'downS' })
    fresh.apply({ us: P20, key: 'upS' })
    expect(fresh.round.ranked!.v2!.spans).toEqual([])
  })

  it('keeps ducking while either key is held and ignores a repeated press', () => {
    const game = play(42)
    game.reach(1_000_000)
    expect(game.apply({ us: 0, key: 'down' })).toBe(true)
    expect(game.apply({ us: 0, key: 'down' })).toBe(false)
    game.reach(1_100_000)
    expect(game.apply({ us: 0, key: 'downS' })).toBe(true)
    game.reach(1_200_000)
    game.apply({ us: 0, key: 'up' })
    expect(game.round.ranked!.v2!.keys).toEqual(['KeyS'])
    expect(requestRoundJump(game.round, game.now, 0.6, 0.4)).toBe(false)
    game.reach(1_300_000)
    game.apply({ us: 0, key: 'upS' })
    expect(game.round.ranked!.v2!.spans).toEqual([[1_000_000, 1_300_000]])
    // Focus loss releases every key at the current play time.
    game.reach(1_400_000)
    game.apply({ us: 0, key: 'down' })
    game.reach(1_450_000)
    expect(clearRankedDuck(game.round)).toBe(true)
    expect(game.round.ranked!.v2!.spans.at(-1)).toEqual([1_400_000, 1_450_000])
  })

  it('stops at 64 spans: a further press keeps the avatar standing and Space available', () => {
    const game = play(42)
    for (let i = 0; i < 64; i++) {
      game.reach(100_000 + i * 2_000)
      expect(game.apply({ us: 0, key: 'down' })).toBe(true)
      game.reach(101_000 + i * 2_000)
      game.apply({ us: 0, key: 'up' })
    }
    game.reach(300_000)
    expect(game.apply({ us: 0, key: 'down' })).toBe(false)
    expect(game.round.ranked!.v2!.keys).toEqual([])
    game.reach(728_335)
    expect(requestRoundJump(game.round, game.now, 0.6, 0.4)).toBe(true)
    expect(game.round.ranked!.v2!.spans).toHaveLength(rankedV2.maxDuckSpans)
  })

  it('closes a held span at the final play time: 60 s for a finish, the third MISS passage for an early end', () => {
    const finish = round('duckHeldUntilTheSixtySecondFinish')
    const ended = run(42, eventsOf(finish.jumpOffsetsUs, finish.duckSpansUs).filter(event => event.us !== rankedDurationUs))
    expect(rankedDuckSpans(ended.v2).at(-1)![1]).toBe(rankedDurationUs)
    expect(ended.round.endReason).toBe('time')

    const third = round('duckHeldUntilTheThirdMissEndsTheRound')
    const early = run(42, eventsOf(third.jumpOffsetsUs, third.duckSpansUs.slice(0, -1))
      .concat({ us: third.duckSpansUs.at(-1)![0], key: 'down' }))
    expect(early.round.endReason).toBe('missLimit')
    expect(rankedDuckSpans(early.v2)).toEqual(third.duckSpansUs)
    expect(Math.round(early.round.playedMs * 1000)).toBe(third.duckSpansUs.at(-1)![1])
    // Nothing more is logged after the end, and the raid leaves at once.
    expect(pressRankedDuck(early.round, 'ArrowDown')).toBe(false)
    expect(early.round.grandpa!.events.every(event => event.status === 'cancelled' || event.status === 'finished')).toBe(true)
  })

  it('mirrors the integer state onto the visuals and keeps v1 rounds without a raid or duck', () => {
    const game = play(42)
    for (const us of bot.jumpOffsetsUs.filter(us => us < JUMP_20)) { game.reach(us); game.apply({ us, key: 'jump' }) }
    game.reach(JUMP_20)
    game.apply({ us: 0, key: 'jump' })
    game.reach(JUMP_20 + 150_000)
    game.apply({ us: 0, key: 'down' })
    game.reach(JUMP_20 + 160_000)
    // Airborne press: the shown transition starts at touchdown.
    expect(game.round.grandpa!.duck.startMs).toBe((JUMP_20 + rankedV2.landingUs) / 1000)
    expect(raidGrandpa(game.round)).toBe(game.round.grandpa)
    game.reach(CONTACT_20)
    expect(game.round.grandpa!.events[0]!.swings[1]!.result).toBe('dodged')
    expect(game.round.grandpa!.events[0]!.status).toBe('active')

    const v1 = play(null)
    expect(v1.round.grandpa).toBeUndefined()
    expect(raidGrandpa(v1.round)).toBeUndefined()
    v1.reach(500_000)
    expect(pressRankedDuck(v1.round, 'ArrowDown')).toBe(false)
    expect(v1.apply({ us: 0, key: 'jump' })).toBe(true)
    expect(rankedPassageUs(1)).toBe(fixture.schedules[0]!.passagesUs![0])
  })
})
