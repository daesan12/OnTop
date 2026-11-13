import { describe, expect, it } from 'vitest'
import fixture from '../../../backend/src/test/resources/jump-rope/rules-v1.json'
import {
  afterDodgeInputMs, createGrandpaRuntime, duckTransitionMs, grandpaBlocksJump, grandpaSeed, grandpaTiming, grandpaWindows, grandpaWindupMs,
  isDucked, planGrandpaEvents, pressDuck, pressRoundDuck, releaseDuck, swingGapPasses, type GrandpaEvent,
} from '../../src/jump-rope-preview/grandpaEvent'
import { grandpaShouts, grandpaSuppressesReactions, sampleAudienceHop, sampleGrandpa } from '../../src/jump-rope-preview/grandpaPose'
import { advancePreviewRound, createPreviewRound, requestRoundJump, resetPreviewRound, type ScoredPreviewPass } from '../../src/jump-rope-preview/previewRound'
import { rankedPassageUs } from '../../src/jump-rope-preview/previewMotion'
import { defaultRopeAcceleration as profile, ropeTempo } from '../../src/jump-rope-preview/ropeAcceleration'

const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const shape = { peak: 0.6, flightMs: 400 }
const reactionMs = 1350
const rope = { speed: 1, acceleration: profile }
const v1 = ropeTempo(1, { profile, playedMs: 0 })
const timing = grandpaTiming(shape, settings)!
const frameMs = 1000 / 60
const seeds = Array.from({ length: 240 }, (_, index) => (index * 2654435761) >>> 0)

/** v2 passage n = v1 passage n + every stretch whose dangerous turn ended at or before n. */
function passageMs(events: GrandpaEvent[], turn: number) {
  let lag = 0
  for (const event of events) {
    for (const swing of event.swings) if (swing.kind === 'danger' && swing.anchor < turn) lag += swing.stretchMs
  }
  return v1.timeForTurns(turn) + lag
}

function dangerSwings(events: GrandpaEvent[]) {
  return events.flatMap(event => event.swings.filter(swing => swing.kind === 'danger'))
}

function startGame(seed: number) {
  const round = createPreviewRound()
  round.grandpa = createGrandpaRuntime(seed, rope, timing)
  const grandpa = round.grandpa
  const plan: GrandpaEvent[] = structuredClone(grandpa.events)
  const passes: ScoredPreviewPass[] = []
  const angles: { played: number; angle: number; turn: number }[] = []
  let now = 0
  function step(at: number) {
    now = at
    const latest = advancePreviewRound(round, at, 1, settings, reactionMs, profile)
    if (latest) passes.push(latest)
    angles.push({ played: round.playedMs, angle: round.motion.angle, turn: round.motion.passCount })
  }
  step(0)
  step(3000)
  /** Advance in frames until the play clock reaches `playMs`, waiting through any MISS freeze. */
  function playUntil(playMs: number) {
    for (let guard = 0; round.playedMs < playMs - 1e-7 && !round.endReason; guard++) {
      if (guard > 1e6) throw new Error('round is stuck')
      const playing = round.phase.kind === 'playing'
      step(now + (playing ? Math.min(frameMs, playMs - round.playedMs) : frameMs))
    }
  }
  const pass = (turn: number) => passageMs(plan, turn)
  const jump = () => requestRoundJump(round, now, shape.peak, shape.flightMs / 1000)
  function jumpFor(turn: number, leadMs = timing.perfectLeadMs) {
    playUntil(pass(turn) - leadMs)
    return jump()
  }
  const duck = (code = 'ArrowDown') => pressRoundDuck(round, code, now)
  const release = (code = 'ArrowDown') => releaseDuck(grandpa.duck, code)
  const swingAt = (anchor: number) => grandpa.events.flatMap(event => event.swings).find(swing => swing.anchor === anchor)!
  return { round, grandpa, plan, passes, angles, step, playUntil, pass, jump, jumpFor, duck, release, swingAt, now: () => now }
}

/** A flawless player: every passage PERFECT, and every dangerous broom ducked right after landing. */
function playPerfectly(game: ReturnType<typeof startGame>, untilTurn = Infinity) {
  const dangerAnchors = new Set(dangerSwings(game.plan).map(swing => swing.anchor))
  for (let turn = 1; game.pass(turn) < 60_000 && turn <= untilTurn; turn++) {
    expect(game.jumpFor(turn)).toBe(true)
    if (!dangerAnchors.has(turn)) continue
    game.playUntil(game.pass(turn) + 200)
    expect(game.duck()).toBe(true)
    game.playUntil(game.pass(turn) + timing.hitOffsetMs + 5)
    game.release()
  }
}

describe('Story 420 grandpa timing', () => {
  it('derives the contact offset and the dangerous period from the judgement settings', () => {
    expect(timing.latestGoodLandingMs).toBeCloseTo(385.83, 2)
    expect(timing.hitOffsetMs).toBe(480)
    expect(timing.perfectLeadMs).toBe(270)
    expect(timing.minDangerPeriodMs).toBe(930)
    expect(timing.latestGoodLandingMs + duckTransitionMs).toBeLessThanOrEqual(timing.hitOffsetMs - 34)

    const floaty = grandpaTiming({ peak: 1, flightMs: 600 }, settings)!
    expect(floaty.hitOffsetMs).toBe(Math.ceil(floaty.latestGoodLandingMs + 94))
    expect(floaty.minDangerPeriodMs).toBe(Math.ceil(floaty.hitOffsetMs + afterDodgeInputMs + 370))
    expect(grandpaTiming({ peak: 0.05, flightMs: 400 }, settings)).toBeNull()
    expect(planGrandpaEvents(1, rope, null).map(event => event.status)).toEqual(['skipped', 'skipped'])
  })

  it.each(seeds)('fits both visits in their windows and stretches only dangerous turns (seed %i)', seed => {
    const events = planGrandpaEvents(seed, rope, timing)
    expect(events.map(event => event.status)).toEqual(['pending', 'pending'])
    expect(events.map(event => event.swings.map(swing => swing.kind))).toEqual(grandpaWindows.map(window => [...window.kinds]))
    for (const [index, event] of events.entries()) {
      const window = grandpaWindows[index]!
      expect(event.startMs).toBeGreaterThanOrEqual(window.fromMs)
      expect(event.endMs).toBeLessThanOrEqual(window.toMs)
      for (const [order, swing] of event.swings.entries()) {
        expect(swing.anchor).toBe(event.swings[0]!.anchor + order * swingGapPasses)
        // The second visit is laid out after the first visit's stretches.
        expect(swing.plannedHitMs).toBeCloseTo(passageMs(events, swing.anchor) + timing.hitOffsetMs, 6)
      }
    }
    const last = events[1]!.swings.at(-1)!
    expect(passageMs(events, last.anchor + 1)).toBeLessThan(60_000)

    const anchors = new Set(dangerSwings(events).map(swing => swing.anchor))
    for (let turn = 1; passageMs(events, turn + 1) < 60_000; turn++) {
      const period = passageMs(events, turn + 1) - passageMs(events, turn)
      const v1Period = v1.timeForTurns(turn + 1) - v1.timeForTurns(turn)
      if (anchors.has(turn)) {
        expect(period).toBeGreaterThanOrEqual(timing.minDangerPeriodMs - 1e-9)
        expect(period - Math.max(v1Period, timing.minDangerPeriodMs)).toBeLessThan(0.001 + 1e-9)
        expect(Number.isInteger(Math.round((period - v1Period) * 1e6) / 1000)).toBe(true)
      } else {
        expect(period).toBeCloseTo(v1Period, 9)
      }
    }
  })

  it('draws reproducible first passages from its own seed stream', () => {
    expect(planGrandpaEvents(409, rope, timing)).toEqual(planGrandpaEvents(409, rope, timing))
    expect(new Set(seeds.map(seed => planGrandpaEvents(seed, rope, timing)[0]!.swings[0]!.anchor)).size).toBeGreaterThan(4)
    expect(new Set(seeds.map(seed => planGrandpaEvents(seed, rope, timing)[1]!.swings[0]!.anchor)).size).toBeGreaterThan(4)
    for (const seed of seeds) expect(grandpaSeed(seed)).not.toBe(seed)
  })
})

describe('Story 420 duck input', () => {
  it('holds while either key is down and ignores repeated presses', () => {
    const duck = { keys: [] as string[], startMs: null as number | null }
    expect(pressDuck(duck, 'ArrowDown', 100)).toBe(true)
    expect(pressDuck(duck, 'ArrowDown', 200)).toBe(false)
    expect(pressDuck(duck, 'KeyS', 300)).toBe(true)
    expect(duck.startMs).toBe(100)
    expect(isDucked(duck, 159)).toBe(false)
    expect(isDucked(duck, 160)).toBe(true)
    expect(releaseDuck(duck, 'ArrowDown')).toBe(true)
    expect(isDucked(duck, 400)).toBe(true)
    expect(releaseDuck(duck, 'KeyS')).toBe(true)
    expect(duck).toEqual({ keys: [], startMs: null })
    expect(pressDuck(duck, 'Space', 500)).toBe(false)
  })

  it('rejects Space while a duck key is held and accepts it right after release', () => {
    const game = startGame(7)
    game.playUntil(game.pass(1) - 600)
    expect(game.duck('KeyS')).toBe(true)
    game.playUntil(game.pass(1) - timing.perfectLeadMs)
    expect(game.jump()).toBe(false)
    expect(game.release('KeyS')).toBe(true)
    expect(game.jump()).toBe(true)
    game.playUntil(game.pass(1) + 1)
    expect(game.passes.at(-1)).toMatchObject({ number: 1, kind: 'perfect' })
  })

  it('turns a ducked passage into the usual MISS', () => {
    const game = startGame(7)
    game.playUntil(game.pass(1) - 400)
    game.duck()
    game.playUntil(game.pass(1) + 1)
    expect(game.passes).toMatchObject([{ number: 1, kind: 'miss' }])
    expect(game.round.stats.chances).toBe(2)
  })
})

describe('Story 420 grandpa raid', () => {
  it.each(seeds.slice(0, 24))('lets a flawless player dodge every broom and finish 60 seconds (seed %i)', seed => {
    const game = startGame(seed)
    playPerfectly(game)
    game.playUntil(60_000)
    expect(game.round.endReason).toBe('time')
    expect(game.round.stats.counts.miss).toBe(0)
    expect(game.passes.every(pass => pass.kind === 'perfect')).toBe(true)
    // Each passage happens on the v2 schedule, so the rope animation and the judgement agree.
    for (const pass of game.passes) expect(pass.at - 3000).toBeCloseTo(game.pass(pass.number), 6)
    expect(game.grandpa.events.map(event => event.status)).toEqual(['finished', 'finished'])
    expect(game.grandpa.events.map(event => event.swings.map(swing => swing.result)))
      .toEqual([['swung', 'dodged', 'dodged'], ['dodged', 'dodged', 'dodged']])
    // The stretched turn slows the rope instead of jumping its angle.
    for (let index = 1; index < game.angles.length; index++) {
      const [before, after] = [game.angles[index - 1]!, game.angles[index]!]
      if (after.turn !== before.turn || after.played === before.played) continue
      expect(after.angle).toBeGreaterThanOrEqual(before.angle)
      expect(after.angle - before.angle).toBeLessThan(2 * Math.PI * frameMs / 700)
    }
  })

  it('dodges after the latest GOOD landing and still allows the next PERFECT input', () => {
    const game = startGame(409)
    const swing = dangerSwings(game.plan).find(candidate => candidate.stretchMs > 0)!
    playPerfectly(game, swing.anchor - 1)
    expect(game.jumpFor(swing.anchor, 85)).toBe(true)
    game.playUntil(game.pass(swing.anchor) - 40)
    expect(game.duck()).toBe(true)
    // The transition waits for touchdown, 385 ms after the passage, and finishes before contact.
    game.playUntil(game.pass(swing.anchor) + 385 + duckTransitionMs - 2)
    expect(isDucked(game.grandpa.duck, game.round.playedMs)).toBe(false)
    game.playUntil(game.pass(swing.anchor) + timing.hitOffsetMs + 1)
    expect(game.swingAt(swing.anchor).result).toBe('dodged')
    game.release()
    // On a stretched turn the PERFECT center sits 100 ms after contact, plus under 1 µs of rounding.
    const gap = game.pass(swing.anchor + 1) - timing.perfectLeadMs - (game.pass(swing.anchor) + timing.hitOffsetMs)
    expect(gap).toBeGreaterThanOrEqual(afterDodgeInputMs)
    expect(gap).toBeLessThan(afterDodgeInputMs + 0.001)
    expect(game.jumpFor(swing.anchor + 1)).toBe(true)
    game.playUntil(game.pass(swing.anchor + 1) + 1)
    expect(game.passes.slice(-2)).toMatchObject([
      { number: swing.anchor, kind: 'good' },
      { number: swing.anchor + 1, kind: 'perfect' },
    ])
  })

  it('stuns on contact and counts exactly one MISS on the next passage', () => {
    const game = startGame(409)
    const swing = game.plan[0]!.swings[1]!
    playPerfectly(game, swing.anchor - 1)
    expect(game.jumpFor(swing.anchor)).toBe(true)
    game.playUntil(game.pass(swing.anchor) + timing.hitOffsetMs + 1)
    expect(game.swingAt(swing.anchor).result).toBe('hit')
    expect(game.round.stats.chances).toBe(3)
    expect(grandpaBlocksJump(game.grandpa)).toBe(true)
    game.playUntil(game.pass(swing.anchor + 1) - timing.perfectLeadMs)
    expect(game.jump()).toBe(false)
    game.playUntil(game.pass(swing.anchor + 1) + 1)
    expect(game.passes.at(-1)).toMatchObject({ number: swing.anchor + 1, kind: 'miss' })
    expect(game.round.stats.chances).toBe(2)
    expect(game.grandpa.stun).toBeNull()

    // The freeze passes, and the following passage is judged normally again.
    expect(game.jumpFor(swing.anchor + 2)).toBe(true)
    game.playUntil(game.pass(swing.anchor + 2) + 1)
    expect(game.passes.at(-1)).toMatchObject({ number: swing.anchor + 2, kind: 'perfect' })
    expect(game.round.stats.counts.miss).toBe(1)
  })

  it('pauses through a MISS freeze and starts a held duck when play resumes', () => {
    const game = startGame(409)
    const swing = game.plan[0]!.swings[1]!
    playPerfectly(game, swing.anchor - 1)
    game.playUntil(game.pass(swing.anchor) - 1)
    game.step(game.now() + 2)
    expect(game.passes.at(-1)).toMatchObject({ number: swing.anchor, kind: 'miss' })
    const frozenAt = game.round.playedMs
    expect(frozenAt).toBeCloseTo(game.pass(swing.anchor), 6)
    expect(game.swingAt(swing.anchor).hitMs).toBeCloseTo(game.pass(swing.anchor) + timing.hitOffsetMs, 6)
    game.step(game.now() + 500)
    expect(game.round.phase.kind).not.toBe('playing')
    expect(game.round.playedMs).toBe(frozenAt)
    expect(game.duck()).toBe(true)
    expect(game.grandpa.duck.startMs).toBe(frozenAt)
    expect(game.grandpa.events[0]!.status).toBe('active')
    game.playUntil(game.pass(swing.anchor) + timing.hitOffsetMs + 1)
    expect(game.swingAt(swing.anchor).result).toBe('dodged')
    expect(game.round.stats.chances).toBe(2)
  })

  it('cancels the visit and clears input on the third MISS', () => {
    const game = startGame(409)
    const swing = game.plan[0]!.swings[1]!
    playPerfectly(game, swing.anchor - 1)
    game.duck()
    game.playUntil(60_000)
    expect(game.round.endReason).toBe('missLimit')
    expect(game.grandpa.events.map(event => event.status)).toEqual(['cancelled', 'cancelled'])
    expect(game.grandpa.duck).toEqual({ keys: [], startMs: null })
    expect(game.grandpa.stun).toBeNull()
  })
})

describe('Story 420 grandpa visuals', () => {
  it('appears only during a visit, warns before dangerous swings and hops the audience on contact', () => {
    const grandpa = createGrandpaRuntime(409, rope, timing)
    const event = grandpa.events[0]!
    const [safe, danger] = event.swings
    const avatar = { x: 0, z: 0 }
    expect(sampleGrandpa(grandpa, event.startMs + 100, avatar)).toBeNull()
    expect(grandpaSuppressesReactions(grandpa)).toBe(false)

    event.status = 'active'
    expect(grandpaSuppressesReactions(grandpa)).toBe(true)
    expect(sampleGrandpa(grandpa, event.startMs - 1, avatar)).toBeNull()
    expect(sampleGrandpa(grandpa, event.startMs + 100, avatar)).toMatchObject({ walking: true, warning: 0 })
    expect(sampleGrandpa(grandpa, safe!.plannedHitMs - 300, avatar)).toMatchObject({ walking: false, warning: 0 })
    expect(sampleGrandpa(grandpa, danger!.plannedHitMs - 300, avatar)!.warning).toBe(1)
    expect(sampleGrandpa(grandpa, danger!.plannedHitMs + 50, avatar)!.warning).toBe(0)
    expect(sampleGrandpa(grandpa, event.endMs - 100, avatar)).toMatchObject({ walking: true })
    expect(sampleAudienceHop(grandpa, safe!.plannedHitMs + 150, 0).lift).toBeGreaterThan(0.2)
    expect(sampleAudienceHop(grandpa, safe!.plannedHitMs - 400, 0)).toEqual({ lift: 0, flap: 0 })

    event.status = 'finished'
    expect(grandpaSuppressesReactions(grandpa)).toBe(false)
    expect(sampleGrandpa(grandpa, danger!.plannedHitMs, avatar)).toBeNull()
  })

  it('shouts once per visit while he walks in and settles', () => {
    const grandpa = createGrandpaRuntime(409, rope, timing)
    const avatar = { x: 0, z: 0 }
    for (const [index, event] of grandpa.events.entries()) {
      for (const other of grandpa.events) other.status = other === event ? 'active' : 'pending'
      const arrival = event.swings[0]!.plannedHitMs - grandpaWindupMs
      expect(sampleGrandpa(grandpa, event.startMs + 100, avatar)!.shoutWeight).toBe(0)
      expect(sampleGrandpa(grandpa, event.startMs + 500, avatar)).toMatchObject({ shout: grandpaShouts[index], shoutWeight: 1 })
      expect(sampleGrandpa(grandpa, arrival + 500, avatar)!.shoutWeight).toBe(1)
      expect(sampleGrandpa(grandpa, arrival + 1000, avatar)!.shoutWeight).toBe(0)
    }
    expect(grandpaShouts[0]).toBe('예끼 이놈들!')
  })
})

describe('Story 420 ranked isolation', () => {
  it('replays the server fixture unchanged even if a grandpa runtime is attached', () => {
    const startAt = 3123
    for (const expected of fixture.rounds) {
      const round = createPreviewRound('menu')
      resetPreviewRound(round, 'initialCountdown', startAt)
      round.grandpa = createGrandpaRuntime(409, rope, timing)
      round.grandpa.duck.keys.push('ArrowDown')
      let now = startAt
      const step = (at: number) => { now = at; return advancePreviewRound(round, at, 1, settings, reactionMs, profile) }
      const advanceActive = (us: number) => step(round.ranked!.segmentAt + (us - round.ranked!.segmentUs) / 1000)
      step(startAt)
      expect(pressRoundDuck(round, 'KeyS', now)).toBe(false)
      let input = 0
      for (const passage of fixture.passagesUs) {
        while (input < expected.offsets.length && expected.offsets[input]! < passage) {
          advanceActive(expected.offsets[input++]!)
          expect(requestRoundJump(round, now, 0.6, 0.4)).toBe(true)
        }
        const result = advanceActive(passage)
        if (round.endReason) break
        if (result?.kind === 'miss') {
          if (round.phase.kind === 'landing') step(now + 600)
          if (round.phase.kind === 'reaction') step(now + 1350)
        }
      }
      expect(round.endReason).toBe('missLimit')
      expect(round.ranked?.offsets).toEqual(expected.offsets)
      expect(round.stats).toMatchObject({ score: expected.score, counts: { perfect: expected.perfect, good: expected.good, miss: expected.miss } })
      expect(round.grandpa!.events.every(event => event.swings.every(swing => swing.hitMs === null))).toBe(true)
    }
    expect(fixture.passagesUs.map((_, index) => rankedPassageUs(index + 1))).toEqual(fixture.passagesUs)
  })

  it('drops the runtime when a new round is reset', () => {
    const round = createPreviewRound()
    round.grandpa = createGrandpaRuntime(1, rope, timing)
    resetPreviewRound(round, 'initialCountdown', 1000)
    expect(round.grandpa).toBeUndefined()
  })
})
