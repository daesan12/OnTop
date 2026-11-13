import { describe, expect, it } from 'vitest'
import { createGrandpaRuntime, grandpaTiming, pressRoundDuck, releaseDuck, type GrandpaEvent, type GrandpaTiming } from '../../src/jump-rope-preview/grandpaEvent'
import { advancePreviewRound, createPreviewRound, requestRoundJump } from '../../src/jump-rope-preview/previewRound'
import { defaultRopeAcceleration as profile, ropeTempo } from '../../src/jump-rope-preview/ropeAcceleration'

/**
 * Story 420 playability: full 60-second rounds played by a modelled human instead of a perfect bot.
 * The player aims at the PERFECT center with a timing error, ducks some time after jumping, releases
 * the duck a reaction time after the broom passes, and only then presses Space for the next rope.
 */
const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const shape = { peak: 0.6, flightMs: 400 }
const rope = { speed: 1, acceleration: profile }
const v1 = ropeTempo(1, { profile, playedMs: 0 })
const timing = grandpaTiming(shape, settings)!
/** The original stage-1 spec value, before the after-dodge gap was widened from 100 ms to 180 ms. */
const tightTiming: GrandpaTiming = { ...timing, minDangerPeriodMs: timing.hitOffsetMs + 100 + timing.perfectLeadMs }

export type HumanProfile = {
  name: string
  /** Standard deviation of the jump lead around the PERFECT center, in ms. */
  jitterMs: number
  duckAfterJumpMs: [number, number]
  releaseAfterBroomMs: [number, number]
  spaceAfterReleaseMs: [number, number]
}

export const humans: HumanProfile[] = [
  { name: '보통', jitterMs: 40, duckAfterJumpMs: [120, 280], releaseAfterBroomMs: [60, 220], spaceAfterReleaseMs: [30, 90] },
  { name: '서툰', jitterMs: 60, duckAfterJumpMs: [150, 350], releaseAfterBroomMs: [100, 300], spaceAfterReleaseMs: [50, 150] },
  { name: '늦게 떼는', jitterMs: 40, duckAfterJumpMs: [120, 280], releaseAfterBroomMs: [200, 320], spaceAfterReleaseMs: [60, 140] },
]

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** The v2 passages, given the stretches each dangerous turn will receive. */
function passages(events: GrandpaEvent[], minDangerPeriodMs: number) {
  const anchors = new Set(events.flatMap(event => event.swings.filter(swing => swing.kind === 'danger').map(swing => swing.anchor)))
  const times = [0]
  let lag = 0
  for (let turn = 1; times.at(-1)! < 60_000; turn++) {
    times.push(v1.timeForTurns(turn) + lag)
    const period = v1.timeForTurns(turn + 1) - v1.timeForTurns(turn)
    if (anchors.has(turn)) lag += Math.max(0, Math.ceil((minDangerPeriodMs - period) * 1000) / 1000)
  }
  return { times, anchors }
}

export type Action = { at: number; key: 'Space' | 'DuckDown' | 'DuckUp' }

/** One human's inputs for a whole round, on the play clock. */
export function humanScript(seed: number, human: HumanProfile, minDangerPeriodMs: number, hitOffsetMs: number) {
  const random = mulberry32(seed ^ 0x9e3779b9)
  const between = ([low, high]: [number, number]) => low + (high - low) * random()
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  const events = createGrandpaRuntime(seed, rope, { ...timing, minDangerPeriodMs }).events
  const { times, anchors } = passages(events, minDangerPeriodMs)
  const actions: Action[] = []
  let releasedAt = -Infinity
  for (let turn = 1; turn < times.length && times[turn]! < 60_000; turn++) {
    const lead = Math.min(400, Math.max(150, 270 + human.jitterMs * normal()))
    // Space waits until the duck key is up: a held duck would swallow it.
    const space = Math.max(times[turn]! - lead, releasedAt + between(human.spaceAfterReleaseMs))
    actions.push({ at: space, key: 'Space' })
    if (!anchors.has(turn)) continue
    actions.push({ at: space + between(human.duckAfterJumpMs), key: 'DuckDown' })
    releasedAt = times[turn]! + hitOffsetMs + between(human.releaseAfterBroomMs)
    actions.push({ at: releasedAt, key: 'DuckUp' })
  }
  return { actions: actions.sort((a, b) => a.at - b.at), events }
}

function playRound(seed: number, human: HumanProfile, roundTiming: GrandpaTiming) {
  const round = createPreviewRound()
  round.grandpa = createGrandpaRuntime(seed, rope, roundTiming)
  const { actions } = humanScript(seed, human, roundTiming.minDangerPeriodMs, roundTiming.hitOffsetMs)
  const anchors = new Set(round.grandpa.events.flatMap(event => event.swings.filter(swing => swing.kind === 'danger').map(swing => swing.anchor)))
  let now = 0
  let afterDodgeMisses = 0
  const step = (at: number) => {
    now = at
    const latest = advancePreviewRound(round, at, 1, settings, 1350, profile)
    if (latest?.kind === 'miss' && anchors.has(latest.number - 1)) afterDodgeMisses++
  }
  step(0)
  step(3000)
  function playUntil(playMs: number) {
    for (let guard = 0; round.playedMs < playMs - 1e-7 && !round.endReason; guard++) {
      if (guard > 1e5) throw new Error('stuck')
      const playing = round.phase.kind === 'playing'
      step(now + (playing ? Math.min(50, playMs - round.playedMs) : 50))
    }
  }
  for (const { at, key } of actions) {
    playUntil(at)
    if (round.endReason) break
    if (key === 'Space') requestRoundJump(round, now, shape.peak, shape.flightMs / 1000)
    else if (key === 'DuckDown') pressRoundDuck(round, 'ArrowDown', now)
    else releaseDuck(round.grandpa.duck, 'ArrowDown')
  }
  playUntil(60_001)
  const swings = round.grandpa.events.flatMap(event => event.swings)
  return {
    completed: round.endReason === 'time',
    misses: round.stats.counts.miss,
    afterDodgeMisses,
    hits: swings.filter(swing => swing.result === 'hit').length,
    dodged: swings.filter(swing => swing.result === 'dodged').length,
    perfect: round.stats.counts.perfect,
    good: round.stats.counts.good,
  }
}

function summarize(human: HumanProfile, roundTiming: GrandpaTiming, seeds: number[]) {
  const runs = seeds.map(seed => playRound(seed, human, roundTiming))
  const rate = (count: number) => Math.round(count / runs.length * 1000) / 10
  return {
    completed: rate(runs.filter(run => run.completed).length),
    noMiss: rate(runs.filter(run => run.misses === 0).length),
    broomHits: runs.reduce((sum, run) => sum + run.hits, 0),
    misses: runs.reduce((sum, run) => sum + run.misses, 0),
    afterDodgeMisses: runs.reduce((sum, run) => sum + run.afterDodgeMisses, 0),
    dodges: runs.reduce((sum, run) => sum + run.dodged, 0),
    perfectShare: rate(runs.reduce((sum, run) => sum + run.perfect, 0) / runs.reduce((sum, run) => sum + run.perfect + run.good + run.misses, 0) * runs.length),
  }
}

describe('Story 420 playability with a modelled human', () => {
  const seeds = Array.from({ length: 300 }, (_, index) => (index * 2654435761 + 17) >>> 0)

  it('lets ordinary and clumsy players finish 60 seconds while dodging the broom', () => {
    const table = humans.map(human => ({
      human: human.name,
      now: summarize(human, timing, seeds),
      before: summarize(human, tightTiming, seeds),
    }))
    console.table(table.map(({ human, now, before }) => ({
      사람: human,
      '완주율 (930ms)': `${now.completed}%`, '무MISS (930ms)': `${now.noMiss}%`, '피격 (930ms)': now.broomHits,
      '완주율 (850ms)': `${before.completed}%`, '무MISS (850ms)': `${before.noMiss}%`, '피격 (850ms)': before.broomHits,
      'MISS 중 회피 직후 (930ms)': `${now.afterDodgeMisses}/${now.misses}`,
      'PERFECT 비율': `${now.perfectShare}%`,
    })))
    const [ordinary, clumsy] = table
    // Ordinary play never misses. Clumsier play still finishes almost every round, and only ever slips on
    // the jump right after a dodge; the broom itself is always ducked in time.
    expect(ordinary!.now).toMatchObject({ completed: 100, noMiss: 100, broomHits: 0 })
    expect(clumsy!.now.completed).toBeGreaterThanOrEqual(90)
    for (const { now } of table) {
      expect(now.broomHits).toBe(0)
      expect(now.afterDodgeMisses).toBeGreaterThanOrEqual(now.misses * 0.99)
    }
    // The widened gap is what lifts clumsy play from about 60 % to over 90 % finished rounds.
    expect(clumsy!.now.completed - clumsy!.before.completed).toBeGreaterThan(25)
  }, 60_000)
})
