import { judgePass, type JudgementSettings } from './jumpRopeJudgement'
import {
  grandpaEventSpan, grandpaSeed, grandpaTiming, isDuckCode, planGrandpaEvents, type GrandpaRuntime, type GrandpaSwing,
  type SwingKind, type SwingResult,
} from './grandpaEvent'
import { activeUs, rankedDurationUs, rankedPassageUs, sampleJumpFrame, type PreviewMotion, type PreviewPass, type RankedClock } from './previewMotion'
import type { PreviewRound } from './previewRound'
import { defaultRopeAcceleration } from './ropeAcceleration'

/**
 * Story 430: rules version 2 for the ranked park game, the FE twin of the server's JumpRopeRulesV2.
 *
 * The visit plan is the preview's planGrandpaEvents (double milliseconds, the same candidates as the server).
 * Everything judged afterwards uses whole active-time microseconds, exactly like the server replay:
 * passage n = rankedPassageUs(n) + every earlier danger stretch, and a contact is its anchor passage + 480 ms.
 * The duck log the server receives is the same set of integers this module judges with.
 */
export const rankedV2 = {
  rulesVersion: 2,
  hitOffsetUs: 480_000,
  minDangerPeriodUs: 930_000,
  duckTransitionUs: 60_000,
  /** A jump touches down 70 ms + 400 ms after its input. */
  landingUs: 470_000,
  maxDuckSpans: 64,
} as const

/** The fixed ranked jump and judgement settings; the ranked game locks every preview slider. */
export const rankedTiming = grandpaTiming({ peak: 0.6, flightMs: 400 }, { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 })!
const rankedRope = { speed: 1, acceleration: defaultRopeAcceleration }

export type RankedSwing = { kind: SwingKind; anchor: number; hitUs: number; stretchUs: number }
/** [startUs, endUs] on the active play clock. */
export type DuckSpan = [startUs: number, endUs: number]

export type RankedV2State = {
  swings: RankedSwing[]
  results: SwingResult[]
  /** The next swing whose anchor passage is still ahead. */
  nextSwing: number
  /** A swing whose contact falls between the latest passage and the next one. */
  pending: number | null
  /** Sum of the stretches after the anchors passed so far. */
  lagUs: number
  /** A broom hit: the next passage is a MISS, and Space is refused until then. */
  stun: { swing: number; atUs: number } | null
  lastMissUs: number
  /** The latest accepted jump, cleared by a MISS like the server's lastJump. */
  lastJumpUs: number
  /** Held duck keys. Either one keeps the posture. */
  keys: string[]
  /** Start of the span being held, as it will be logged. */
  openUs: number | null
  spans: DuckSpan[]
  /** The round ended and its log is final. */
  closed: boolean
}

export type RankedV2Plan = { swings: RankedSwing[]; runtime: GrandpaRuntime }

/** The server's schedule for this seed, plus a preview runtime whose contacts are fixed in advance for the visuals. */
export function planRankedV2(seed: number): RankedV2Plan {
  const events = planGrandpaEvents(seed, rankedRope, rankedTiming)
  // The server refuses to invent or skip a visit when a window has no candidate, so the FE does not either.
  const skipped = events.find(event => event.status === 'skipped')
  if (skipped) throw new Error(`Jump rope v2 grandpa window ${skipped.windowFromMs}-${skipped.windowToMs} ms has no visit candidate (seed ${seed})`)
  const swings: RankedSwing[] = []
  let lagUs = 0
  for (const swing of events.flatMap(event => event.swings)) {
    // dangerStretchMs is a whole number of microseconds divided by 1000.
    const stretchUs = Math.round(swing.stretchMs * 1000)
    const hitUs = rankedPassageUs(swing.anchor) + lagUs + rankedV2.hitOffsetUs
    swings.push({ kind: swing.kind, anchor: swing.anchor, hitUs, stretchUs })
    lagUs += stretchUs
  }
  let index = 0
  const runtimeEvents = events.map(event => {
    const shown = event.swings.map((swing): GrandpaSwing => {
      const ranked = swings[index++]!
      const hitMs = ranked.hitUs / 1000
      return { ...swing, plannedHitMs: hitMs, hitMs, stretchMs: ranked.stretchUs / 1000, result: 'pending' }
    })
    return { ...event, swings: shown, ...grandpaEventSpan(shown[0]!.hitMs!, shown.at(-1)!.hitMs!), status: 'pending' as const }
  })
  return {
    swings,
    runtime: {
      seed: grandpaSeed(seed), timing: rankedTiming, events: runtimeEvents, lagMs: 0, slow: null, stun: null,
      duck: { keys: [], startMs: null }, resumedAt: null,
    },
  }
}

/** P2(n): the v1 passage plus every stretch applied after an earlier dangerous anchor. */
export function rankedV2PassageUs(swings: readonly RankedSwing[], turn: number) {
  let lagUs = 0
  for (const swing of swings) if (swing.anchor < turn) lagUs += swing.stretchUs
  return rankedPassageUs(turn) + lagUs
}

export function createRankedV2State(swings: RankedSwing[]): RankedV2State {
  return {
    swings, results: swings.map(() => 'pending'), nextSwing: 0, pending: null, lagUs: 0, stun: null,
    lastMissUs: -1, lastJumpUs: -1, keys: [], openUs: null, spans: [], closed: false,
  }
}

/** Attaches the v2 rules to a ranked round right after resetPreviewRound(..., startsAt). */
export function startRankedV2(round: PreviewRound, seed: number) {
  if (!round.ranked) throw new Error('A v2 round needs the ranked play clock')
  const plan = planRankedV2(seed)
  round.ranked.v2 = createRankedV2State(plan.swings)
  round.grandpa = plan.runtime
}

/**
 * The server's readiness for the held span: max(key down, touchdown of an airborne jump) + 60 ms, restarted at
 * each MISS passage while held. Null while no span is held.
 */
export function duckReadyUs(v2: RankedV2State) {
  const start = v2.openUs
  if (start === null) return null
  if (v2.lastMissUs >= start) return v2.lastMissUs
  return v2.lastJumpUs >= 0 ? Math.max(start, v2.lastJumpUs + rankedV2.landingUs) : start
}

function resolveContact(v2: RankedV2State, index: number) {
  const swing = v2.swings[index]!
  const ready = duckReadyUs(v2)
  if (swing.kind === 'safe') {
    v2.results[index] = 'swung'
  } else if (ready !== null && v2.openUs! < swing.hitUs && ready + rankedV2.duckTransitionUs <= swing.hitUs) {
    v2.results[index] = 'dodged'
  } else {
    v2.results[index] = 'hit'
    v2.stun = { swing: index, atUs: swing.hitUs }
  }
  v2.pending = null
}

/**
 * Ranked v2 rope: like advanceRankedMotion, plus broom contacts before each passage and the stun MISS.
 * Inputs logged at a microsecond are applied after this step reaches it, so events at that time resolve first.
 */
export function advanceRankedV2Motion(motion: PreviewMotion, clock: RankedClock, now: number, settings: JudgementSettings) {
  const v2 = clock.v2!
  let playedUs = Math.min(rankedDurationUs, activeUs(clock, now))
  const passes: PreviewPass[] = []
  for (;;) {
    // Every contact lands inside the turn after its anchor: 480 ms is shorter than any turn.
    if (v2.pending !== null) {
      if (v2.swings[v2.pending]!.hitUs > playedUs) break
      resolveContact(v2, v2.pending)
      continue
    }
    const passage = Math.min(rankedDurationUs, rankedPassageUs(motion.passCount + 1) + v2.lagUs)
    // The timer wins ties at 60 s.
    if (passage > playedUs || passage >= rankedDurationUs) break
    const jumpUs = motion.jump ? clock.offsets.at(-1) : undefined
    const leadMs = jumpUs === undefined ? null : (passage - jumpUs) / 1000
    const verdict = judgePass(0, leadMs === null ? null : { startedAt: -leadMs, flightMs: 400, peak: 0.6 }, settings)
    // A broom hit turns exactly the next passage into the usual MISS, then the stun ends.
    const kind = v2.stun ? 'miss' : verdict.kind
    v2.stun = null
    const at = clock.segmentAt + (passage - clock.segmentUs) / 1000
    passes.push({ ...verdict, kind, at, number: ++motion.passCount })
    if (kind === 'miss') {
      v2.lastMissUs = passage
      v2.lastJumpUs = -1
      playedUs = passage
    }
    const swing = v2.swings[v2.nextSwing]
    if (swing?.anchor === motion.passCount) {
      v2.pending = v2.nextSwing++
      v2.lagUs += swing.stretchUs
    }
    if (kind === 'miss') break
  }
  const stopped = passes.at(-1)?.kind === 'miss'
  // The rope crosses the feet exactly at each integer passage; a stretched turn simply takes longer.
  const from = rankedV2PassageUs(v2.swings, motion.passCount)
  const to = rankedPassageUs(motion.passCount + 1) + v2.lagUs
  motion.angle = stopped ? 0 : Math.min(1, Math.max(0, (playedUs - from) / (to - from))) * 2 * Math.PI
  motion.lastAt = now
  motion.ropeSpeed = stopped ? 0 : 1
  motion.frame = motion.jump ? sampleJumpFrame(motion.jump, now) : { phase: 'ready', progress: 0, height: 0 }
  return { passes, playedUs }
}

/** Space is refused while a duck key is held, during a stun, and at the microsecond of a duck release. */
export function rankedV2BlocksJump(clock: RankedClock, now: number) {
  const v2 = clock.v2
  if (!v2) return false
  return v2.keys.length > 0 || v2.stun !== null || v2.closed || v2.spans.at(-1)?.[1] === activeUs(clock, now)
}

export function noteRankedV2Jump(clock: RankedClock) {
  if (clock.v2) clock.v2.lastJumpUs = clock.offsets.at(-1)!
}

/** The active play time after the latest step: 0 in the countdown, the frozen passage through a MISS. */
function playUs(round: PreviewRound) {
  return Math.min(rankedDurationUs, Math.max(0, Math.round(round.playedMs * 1000)))
}

function canDuck(round: PreviewRound) {
  const phase = round.phase.kind
  return !round.endReason && phase !== 'menu' && phase !== 'gameOver' && phase !== 'completion' && phase !== 'ended'
}

/**
 * Starts holding (↓ or S). Call after stepping the round to the key's time. The span is logged from this
 * microsecond; the server adds the touchdown wait and the 60 ms transition itself, as {@link duckReadyUs} does.
 * Returns false when the key changes nothing, including a press beyond the server's 64-span limit: the avatar
 * then keeps standing and Space stays available, so the screen and the log agree.
 */
export function pressRankedDuck(round: PreviewRound, code: string) {
  const v2 = round.ranked?.v2
  if (!v2 || v2.closed || !isDuckCode(code) || v2.keys.includes(code) || !canDuck(round)) return false
  if (v2.keys.length > 0) {
    // A second key keeps the posture that the first one started.
    v2.keys.push(code)
    return true
  }
  let at = playUs(round)
  // A press in the microsecond of an accepted jump is logged one microsecond later. The jump is airborne, so the
  // duck still starts at touchdown and the result is unchanged; the server only refuses the shared boundary.
  if (round.ranked!.offsets.at(-1) === at) at += 1
  const last = v2.spans.at(-1)
  if (last && last[1] === at) {
    // Released and pressed again in one microsecond (for example inside one MISS freeze): one continuous span.
    v2.spans.pop()
    v2.openUs = last[0]
  } else if (v2.spans.length >= rankedV2.maxDuckSpans) {
    return false
  } else {
    v2.openUs = at
  }
  v2.keys.push(code)
  return true
}

function closeSpan(v2: RankedV2State, at: number) {
  // A press and release inside one frozen microsecond leaves nothing to log.
  if (v2.openUs !== null && at > v2.openUs) v2.spans.push([v2.openUs, at])
  v2.openUs = null
}

export function releaseRankedDuck(round: PreviewRound, code: string) {
  const v2 = round.ranked?.v2
  if (!v2) return false
  const index = v2.keys.indexOf(code)
  if (index < 0) return false
  v2.keys.splice(index, 1)
  if (v2.keys.length === 0 && !v2.closed) closeSpan(v2, playUs(round))
  return true
}

/** Focus loss releases every key at the current play time. */
export function clearRankedDuck(round: PreviewRound) {
  const v2 = round.ranked?.v2
  if (!v2 || v2.keys.length === 0) return false
  v2.keys.length = 0
  if (!v2.closed) closeSpan(v2, playUs(round))
  return true
}

/** At the end, a held span closes at the final play time: 60 000 000 for a finish, the third MISS passage otherwise. */
export function finishRankedV2(round: PreviewRound) {
  const v2 = round.ranked?.v2
  if (!v2 || v2.closed) return
  closeSpan(v2, playUs(round))
  v2.keys.length = 0
  v2.closed = true
}

/** The submitted duck log: a frozen copy of the closed spans. */
export function rankedDuckSpans(v2: RankedV2State): readonly (readonly [number, number])[] {
  return v2.spans.map(([start, end]) => [start, end] as const)
}

/** Mirrors the integer state onto the preview runtime that drives the grandpa, the avatar and the audience. */
export function syncRankedGrandpa(round: PreviewRound) {
  const v2 = round.ranked?.v2
  const grandpa = round.grandpa
  if (!v2 || !grandpa) return
  const shown = grandpa.events.flatMap(event => event.swings)
  shown.forEach((swing, index) => { swing.result = v2.results[index]! })
  grandpa.stun = v2.stun ? { swing: shown[v2.stun.swing]!, atMs: v2.stun.atUs / 1000 } : null
  grandpa.lagMs = v2.lagUs / 1000
  const ready = duckReadyUs(v2)
  grandpa.duck.keys.splice(0, grandpa.duck.keys.length, ...v2.keys)
  grandpa.duck.startMs = v2.keys.length > 0 && ready !== null ? ready / 1000 : null
}
