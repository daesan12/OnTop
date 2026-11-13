import { clearanceWindowMs, judgePass, jumpPrepareMs, type JudgementSettings } from './jumpRopeJudgement'
import { roundDurationMs } from './jumpRopeRules'
import { sampleJumpFrame, type PreviewMotion, type PreviewPass } from './previewMotion'
import type { PreviewRound } from './previewRound'
import { ropeTempo, type RopeAcceleration } from './ropeAcceleration'

/**
 * Story 420 stage 1: the Tapgol grandpa raid, for the unranked preview only.
 * Design inputs live here; every offset the judgement depends on is derived from the live jump settings.
 */
export const duckTransitionMs = 60
export const duckReadyMarginMs = 34
// Time from a dodged broom to the next PERFECT-center Space: enough to release the duck and jump calmly.
export const afterDodgeInputMs = 180
export const swingGapPasses = 2
export const grandpaWindupMs = 1000
export const grandpaEntryMs = 1200
export const grandpaExitMs = 1200
export const grandpaRecoverMs = 450

const revolution = Math.PI * 2

export type JumpShape = { peak: number; flightMs: number }
export type GrandpaTiming = {
  /** Touchdown after the passage for the latest input that still clears the rope. */
  latestGoodLandingMs: number
  /** Broom contact after the passage preceding a swing. */
  hitOffsetMs: number
  perfectLeadMs: number
  /** A dangerous turn lasts at least this long, so a dodge still allows the next PERFECT input. */
  minDangerPeriodMs: number
}

export function grandpaTiming({ peak, flightMs }: JumpShape, settings: JudgementSettings): GrandpaTiming | null {
  const window = clearanceWindowMs(peak, flightMs, settings)
  if (!window) return null
  const latestGoodLandingMs = jumpPrepareMs + flightMs - window.latest
  const hitOffsetMs = Math.ceil(latestGoodLandingMs + duckTransitionMs + duckReadyMarginMs)
  return {
    latestGoodLandingMs,
    hitOffsetMs,
    perfectLeadMs: window.ideal,
    minDangerPeriodMs: Math.ceil(hitOffsetMs + afterDodgeInputMs + window.ideal),
  }
}

/** The extra play time a dangerous turn needs, rounded up to a whole microsecond. */
export function dangerStretchMs(periodMs: number, timing: GrandpaTiming) {
  return Math.max(0, Math.ceil((timing.minDangerPeriodMs - periodMs) * 1000)) / 1000
}

export type RopeProfile = { speed: number; acceleration?: RopeAcceleration }

function v1Tempo({ speed, acceleration }: RopeProfile) {
  return ropeTempo(speed, acceleration ? { profile: acceleration, playedMs: 0 } : undefined)
}

/** Keep the grandpa's draws apart from the pigeon distraction stream, which uses the seed itself. */
export function grandpaSeed(seed: number) {
  return Math.imul((seed ^ 0x5bd1e995) >>> 0, 0x27d4eb2d) >>> 0
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export type SwingKind = 'safe' | 'danger'
export type SwingResult = 'pending' | 'swung' | 'dodged' | 'hit'
export type GrandpaSwing = {
  kind: SwingKind
  /** The rope passage just before the broom arrives. */
  anchor: number
  /** Forecast contact on the play clock. It becomes exact once the anchor passage happens. */
  plannedHitMs: number
  /** Extra play time added to the turn after the anchor. */
  stretchMs: number
  hitMs: number | null
  result: SwingResult
}
export type GrandpaEventStatus = 'pending' | 'active' | 'finished' | 'skipped' | 'cancelled'
export type GrandpaEvent = {
  windowFromMs: number
  windowToMs: number
  swings: GrandpaSwing[]
  /** Entry and exit on the play clock, forecast from the live rope until each hit is fixed. */
  startMs: number
  endMs: number
  status: GrandpaEventStatus
}

export const grandpaWindows = [
  { fromMs: 15_000, toMs: 30_000, kinds: ['safe', 'danger', 'danger'] },
  { fromMs: 40_000, toMs: 60_000, kinds: ['danger', 'danger', 'danger'] },
] as const satisfies readonly { fromMs: number; toMs: number; kinds: readonly SwingKind[] }[]

export function grandpaEventSpan(firstHitMs: number, lastHitMs: number) {
  return {
    startMs: firstHitMs - grandpaWindupMs - grandpaEntryMs,
    endMs: lastHitMs + grandpaRecoverMs + grandpaExitMs,
  }
}

type Tempo = ReturnType<typeof ropeTempo>

function layoutEvent(first: number, kinds: readonly SwingKind[], lagMs: number, tempo: Tempo, timing: GrandpaTiming) {
  let lag = lagMs
  const swings = kinds.map((kind, index): GrandpaSwing => {
    const anchor = first + index * swingGapPasses
    const passMs = tempo.timeForTurns(anchor) + lag
    const stretchMs = kind === 'danger'
      ? dangerStretchMs(tempo.timeForTurns(anchor + 1) - tempo.timeForTurns(anchor), timing)
      : 0
    // v2 passage n = v1 passage n + every earlier stretch. Later periods keep the v1 curve.
    lag += stretchMs
    return { kind, anchor, plannedHitMs: passMs + timing.hitOffsetMs, stretchMs, hitMs: null, result: 'pending' }
  })
  const last = swings.at(-1)!
  return {
    swings,
    lagMs: lag,
    nextPassageMs: tempo.timeForTurns(last.anchor + 1) + lag,
    ...grandpaEventSpan(swings[0]!.plannedHitMs, last.plannedHitMs),
  }
}

/**
 * Lists every first-swing passage whose whole visit fits its window, then draws one uniformly.
 * The second window is searched after the first visit's stretches have been applied.
 */
export function planGrandpaEvents(seed: number, rope: RopeProfile, timing: GrandpaTiming | null): GrandpaEvent[] {
  const random = mulberry32(grandpaSeed(seed))
  const tempo = rope.speed > 0 ? v1Tempo(rope) : null
  let lagMs = 0
  return grandpaWindows.map(({ fromMs, toMs, kinds }) => {
    const draw = random()
    const candidates: ReturnType<typeof layoutEvent>[] = []
    for (let first = 1; tempo && timing && first < 1000; first++) {
      const layout = layoutEvent(first, kinds, lagMs, tempo, timing)
      if (!(layout.startMs <= toMs)) break
      // The last dangerous swing must be followed by a passage, which delivers its stun MISS.
      if (layout.startMs >= fromMs && layout.endMs <= toMs && layout.nextPassageMs < roundDurationMs) candidates.push(layout)
    }
    const chosen = candidates[Math.floor(draw * candidates.length)]
    if (!chosen) return { windowFromMs: fromMs, windowToMs: toMs, swings: [], startMs: NaN, endMs: NaN, status: 'skipped' }
    lagMs = chosen.lagMs
    return { windowFromMs: fromMs, windowToMs: toMs, swings: chosen.swings, startMs: chosen.startMs, endMs: chosen.endMs, status: 'pending' }
  })
}

/** Held duck keys and the play-clock start of the 60 ms transition. */
export type DuckState = { keys: string[]; startMs: number | null }

export type GrandpaRuntime = {
  seed: number
  timing: GrandpaTiming | null
  events: GrandpaEvent[]
  /** Play time minus the v1 rope clock: the sum of the stretches applied so far. */
  lagMs: number
  slow: { turn: number; factor: number; lagAfterMs: number } | null
  stun: { swing: GrandpaSwing; atMs: number } | null
  duck: DuckState
  /** Scene time of the latest return to play, for blending the visit back in after a MISS. */
  resumedAt: number | null
}

export function createGrandpaRuntime(seed: number, rope: RopeProfile, timing: GrandpaTiming | null): GrandpaRuntime {
  return {
    seed: grandpaSeed(seed),
    timing,
    events: planGrandpaEvents(seed, rope, timing),
    lagMs: 0,
    slow: null,
    stun: null,
    duck: { keys: [], startMs: null },
    resumedAt: null,
  }
}

export function isDuckCode(code: string) {
  return code === 'ArrowDown' || code === 'KeyS'
}

export function pressDuck(duck: DuckState, code: string, startMs: number) {
  if (!isDuckCode(code) || duck.keys.includes(code)) return false
  duck.keys.push(code)
  // A second key keeps the posture that the first one started.
  if (duck.keys.length === 1) duck.startMs = startMs
  return true
}

export function releaseDuck(duck: DuckState, code: string) {
  const index = duck.keys.indexOf(code)
  if (index < 0) return false
  duck.keys.splice(index, 1)
  if (duck.keys.length === 0) duck.startMs = null
  return true
}

export function clearDuck(duck: DuckState) {
  duck.keys.length = 0
  duck.startMs = null
}

export function duckProgress(duck: DuckState, playedMs: number) {
  if (duck.startMs === null) return 0
  return Math.max(0, Math.min(1, (playedMs - duck.startMs) / duckTransitionMs))
}

export function isDucked(duck: DuckState, playedMs: number) {
  return duck.startMs !== null && playedMs >= duck.startMs + duckTransitionMs
}

/** While a duck key is held or the broom stun lasts, Space neither jumps nor reaches the jump log. */
export function grandpaBlocksJump(grandpa: GrandpaRuntime) {
  return grandpa.duck.keys.length > 0 || grandpa.stun !== null
}

export function activeGrandpa(round: PreviewRound) {
  return round.ranked ? undefined : round.grandpa
}

/** Starts the transition at max(key down, touchdown, end of a MISS freeze), all on the play clock. */
export function pressRoundDuck(round: PreviewRound, code: string, sceneNow: number) {
  const grandpa = activeGrandpa(round)
  const phase = round.phase.kind
  if (!grandpa || phase === 'menu' || phase === 'gameOver' || phase === 'completion' || phase === 'ended') return false
  const jump = round.motion.jump
  const landsAt = jump ? jump.startedAt + jumpPrepareMs + jump.flightMs : -Infinity
  // The play clock stands still through a MISS, so a frozen key down starts on resumption.
  const landingMs = phase === 'playing' && round.motion.ropeSpeed > 0 && landsAt > sceneNow
    ? round.playedMs + (landsAt - sceneNow)
    : round.playedMs
  return pressDuck(grandpa.duck, code, landingMs)
}

function pendingHit(grandpa: GrandpaRuntime) {
  let next: GrandpaSwing | null = null
  for (const event of grandpa.events) {
    if (event.status !== 'pending' && event.status !== 'active') continue
    for (const swing of event.swings) {
      if (swing.hitMs !== null && swing.result === 'pending' && (!next || swing.hitMs < next.hitMs!)) next = swing
    }
  }
  return next
}

function resolveHit(grandpa: GrandpaRuntime, swing: GrandpaSwing, playedMs: number) {
  if (swing.kind === 'safe') {
    swing.result = 'swung'
  } else if (isDucked(grandpa.duck, playedMs)) {
    swing.result = 'dodged'
  } else {
    swing.result = 'hit'
    grandpa.stun = { swing, atMs: playedMs }
  }
}

function fixAnchor(grandpa: GrandpaRuntime, passage: number, playedMs: number, tempo: Tempo) {
  const timing = grandpa.timing
  if (!timing) return
  for (const event of grandpa.events) {
    if (event.status !== 'pending' && event.status !== 'active') continue
    for (const swing of event.swings) {
      if (swing.anchor !== passage || swing.hitMs !== null) continue
      swing.hitMs = playedMs + timing.hitOffsetMs
      swing.plannedHitMs = swing.hitMs
      if (swing.kind !== 'danger') continue
      const periodMs = tempo.timeForTurns(1)
      swing.stretchMs = dangerStretchMs(periodMs, timing)
      if (swing.stretchMs > 0) {
        grandpa.slow = { turn: passage + 1, factor: periodMs / (periodMs + swing.stretchMs), lagAfterMs: grandpa.lagMs + swing.stretchMs }
      }
    }
  }
}

function ropeClock(acceleration: RopeAcceleration | undefined, playedMs: number, lagMs: number) {
  return acceleration ? { profile: acceleration, playedMs: playedMs - lagMs } : undefined
}

/**
 * The unranked rope with grandpa stretches. It follows the v1 rope clock shifted by the stretches,
 * slows only the turn that contains a dangerous swing, and resolves each broom contact before the next passage.
 */
export function advanceGrandpaMotion(
  motion: PreviewMotion, grandpa: GrandpaRuntime, now: number, ropeSpeed: number, settings: JudgementSettings,
  stopOnMiss: boolean, deadline: number, acceleration: RopeAcceleration | undefined, playedMs: number,
) {
  const results: PreviewPass[] = []
  if (motion.lastAt !== null && motion.ropeSpeed > 0) {
    const end = Math.min(now, deadline)
    let at = motion.lastAt
    let played = playedMs
    while (at < end) {
      const slowed = grandpa.slow?.turn === motion.passCount + 1 ? grandpa.slow : null
      const factor = slowed?.factor ?? 1
      const tempo = ropeTempo(motion.ropeSpeed, ropeClock(acceleration, played, grandpa.lagMs))
      const toPassage = tempo.timeForTurns(1 - motion.angle / revolution) / factor
      const swing = pendingHit(grandpa)
      const toHit = swing ? Math.max(0, swing.hitMs! - played) : Infinity
      const remaining = end - at
      const advance = (span: number) => {
        if (span > 0) {
          motion.angle = Math.min(revolution, motion.angle + tempo.turnsDuring(span * factor) * revolution)
          if (slowed) grandpa.lagMs += span * (1 - factor)
        }
        at += span
        played += span
      }

      if (swing && toHit <= remaining && toHit <= toPassage) {
        advance(toHit)
        resolveHit(grandpa, swing, played)
        continue
      }
      if (toPassage > remaining + 1e-9) {
        advance(remaining)
        break
      }
      const passAt = at + toPassage
      // The timer wins ties. Keep the rope at the end of the turn without recording a pass.
      if (passAt >= deadline - 1e-7) {
        motion.angle = revolution
        break
      }
      at = passAt
      played += toPassage
      motion.angle = 0
      if (slowed) {
        // Land exactly on the whole-microsecond delay instead of the accumulated frame sum.
        grandpa.lagMs = slowed.lagAfterMs
        grandpa.slow = null
      }
      const number = ++motion.passCount
      const judged = judgePass(passAt, motion.jump, settings)
      // A broom hit turns exactly the next passage into the usual MISS, then the stun ends.
      const stunned = grandpa.stun !== null
      grandpa.stun = null
      const pass: PreviewPass = { ...judged, kind: stunned ? 'miss' : judged.kind, number }
      results.push(pass)
      fixAnchor(grandpa, number, played, ropeTempo(motion.ropeSpeed, ropeClock(acceleration, played, grandpa.lagMs)))
      if (stopOnMiss && pass.kind === 'miss') {
        ropeSpeed = 0
        // The duck transition restarts when the freeze ends: max(key down, touchdown, MISS end).
        if (grandpa.duck.startMs !== null) grandpa.duck.startMs = played
        break
      }
    }
  }
  motion.lastAt = now
  motion.ropeSpeed = ropeSpeed
  motion.frame = motion.jump ? sampleJumpFrame(motion.jump, now) : { phase: 'ready', progress: 0, height: 0 }
  return results
}

/** Forecast play-clock passages from the live rope, including stretches that have not happened yet. */
function forecastPassages(grandpa: GrandpaRuntime, motion: PreviewMotion, playedMs: number, rope: RopeProfile, lastTurn: number) {
  const times = new Map<number, number>()
  const timing = grandpa.timing
  if (rope.speed <= 0 || !timing) return times
  let played = playedMs
  let lag = grandpa.lagMs
  let turn = motion.passCount
  let progress = Math.min(1, motion.angle / revolution)
  while (turn < lastTurn) {
    const tempo = ropeTempo(rope.speed, ropeClock(rope.acceleration, played, lag))
    let factor = 1
    let lagAfter = lag
    if (grandpa.slow?.turn === turn + 1) {
      factor = grandpa.slow.factor
      lagAfter = grandpa.slow.lagAfterMs
    } else if (progress === 0 && isPendingDangerAnchor(grandpa, turn)) {
      const periodMs = tempo.timeForTurns(1)
      const stretchMs = dangerStretchMs(periodMs, timing)
      factor = periodMs / (periodMs + stretchMs)
      lagAfter = lag + stretchMs
    }
    played += tempo.timeForTurns(1 - progress) / factor
    lag = lagAfter
    turn += 1
    progress = 0
    times.set(turn, played)
  }
  return times
}

function isPendingDangerAnchor(grandpa: GrandpaRuntime, passage: number) {
  return grandpa.events.some(event => event.swings.some(swing =>
    swing.kind === 'danger' && swing.anchor === passage && swing.hitMs === null))
}

/** Refresh forecasts and visit states after a round step. */
export function settleGrandpa(grandpa: GrandpaRuntime, round: PreviewRound, rope: RopeProfile) {
  if (round.endReason) {
    for (const event of grandpa.events) {
      if (event.status === 'active') event.status = round.endReason === 'missLimit' ? 'cancelled' : 'finished'
      else if (event.status === 'pending') event.status = round.endReason === 'missLimit' ? 'cancelled' : 'skipped'
    }
    grandpa.stun = null
    grandpa.slow = null
    clearDuck(grandpa.duck)
    return
  }
  const timing = grandpa.timing
  const open = grandpa.events.filter(event => event.status === 'pending' || event.status === 'active')
  const lastTurn = Math.max(0, ...open.flatMap(event => event.swings.filter(swing => swing.hitMs === null).map(swing => swing.anchor)))
  const forecast = timing && lastTurn > round.motion.passCount
    ? forecastPassages(grandpa, round.motion, round.playedMs, rope, lastTurn)
    : null
  for (const event of open) {
    if (timing && forecast) {
      for (const swing of event.swings) {
        const passMs = swing.hitMs === null ? forecast.get(swing.anchor) : undefined
        if (passMs !== undefined) swing.plannedHitMs = passMs + timing.hitOffsetMs
      }
    }
    const first = event.swings[0]!, last = event.swings.at(-1)!
    Object.assign(event, grandpaEventSpan(first.hitMs ?? first.plannedHitMs, last.hitMs ?? last.plannedHitMs))
    if (event.status === 'pending' && round.playedMs >= event.startMs) event.status = 'active'
    if (event.status === 'active' && round.playedMs >= event.endMs && event.swings.every(swing => swing.result !== 'pending')) {
      event.status = 'finished'
    }
  }
}

export function activeGrandpaEvent(grandpa: GrandpaRuntime) {
  return grandpa.events.find(event => event.status === 'active') ?? null
}
