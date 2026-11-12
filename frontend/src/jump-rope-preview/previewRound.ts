import type { JudgementSettings } from './jumpRopeJudgement'
import { applyPass, createRoundStats, roundDurationMs, type RoundEndReason, type RoundStats } from './jumpRopeRules'
import { advancePreviewMotion, advanceRankedMotion, createPreviewMotion, requestJump, requestRankedJump, type PreviewPass, type RankedClock } from './previewMotion'
import { createSuccessCue, successKind, type PigeonSuccessCue } from './pigeonSuccess'
import { ropeTempo, type RopeAcceleration } from './ropeAcceleration'
import { finaleStage } from './gameOverFinale'
import { completionResultMs } from './completionFinale'

const countdownMs = 3000
const goMs = 550

type Phase =
  | { kind: 'menu' }
  | { kind: 'initialCountdown'; endsAt?: number }
  | PlayingPhase
  | { kind: 'landing'; stoppedAt: number; reactionMs: number }
  | { kind: 'reaction'; stoppedAt: number; startedAt: number; durationMs: number }
  | { kind: 'resumePending'; stoppedAt: number }
  | { kind: 'gameOver'; stoppedAt: number; startedAt: number }
  | { kind: 'completion'; startedAt: number; restWeight: number }
  | { kind: 'ended'; restWeight: number }

type PlayingPhase = { kind: 'playing'; goAt?: number; resumedAfterPass?: number }

export type PreviewRound = {
  motion: ReturnType<typeof createPreviewMotion>
  phase: Phase
  stats: RoundStats
  playedMs: number
  endReason: RoundEndReason | null
  successCue: PigeonSuccessCue | null
  shockStartedAt: number | null
  ranked?: RankedClock
}
export type RoundCue = Phase['kind'] | 'gameOverSplash' | '3' | '2' | '1' | 'GO!'
export type ScoredPreviewPass = PreviewPass & { earnedPoints: number }
type EntryPhase = 'menu' | 'initialCountdown'

export function createPreviewRound(entry: EntryPhase = 'initialCountdown'): PreviewRound {
  return {
    motion: createPreviewMotion(),
    phase: { kind: entry },
    stats: createRoundStats(),
    playedMs: 0,
    endReason: null,
    successCue: null,
    shockStartedAt: null,
  }
}

export function resetPreviewRound(round: PreviewRound, entry?: EntryPhase, startsAt?: number) {
  const { motion, ...freshRound } = createPreviewRound(entry)
  Object.assign(round.motion, motion)
  Object.assign(round, freshRound)
  round.ranked = startsAt === undefined ? undefined : { startsAt, segmentAt: startsAt, segmentUs: 0, offsets: [] }
  if (round.phase.kind === 'initialCountdown') round.phase.endsAt = startsAt
}

function beginPlaying(
  round: PreviewRound, phase: PlayingPhase, now: number, ropeSpeed: number, settings: JudgementSettings,
) {
  round.phase = phase
  round.motion.jump = null
  round.shockStartedAt = null
  if (round.ranked) {
    round.ranked.segmentAt = now
    round.ranked.segmentUs = Math.round(round.playedMs * 1000)
  }
  advancePreviewMotion(round.motion, now, ropeSpeed, settings)
}

export function advancePreviewRound(
  round: PreviewRound, now: number, ropeSpeed: number, settings: JudgementSettings, reactionMs: number,
  acceleration?: RopeAcceleration,
) {
  const { motion, phase } = round
  if (phase.kind === 'menu') {
    // A manual jump preview can animate here without starting the round clock.
    if (motion.jump) advancePreviewMotion(motion, now, 0, settings)
    return
  }
  const playing = phase.kind === 'playing'
  // The previous speed describes the elapsed interval, even when this call pauses or resumes it.
  const intervalSpeed = motion.ropeSpeed
  const playedBefore = round.playedMs
  const activeFrom = playing && intervalSpeed > 0 ? motion.lastAt : null
  const deadline = activeFrom === null ? Infinity : round.ranked
    ? round.ranked.segmentAt + roundDurationMs - round.ranked.segmentUs / 1000
    : activeFrom + (roundDurationMs - round.playedMs)
  const expires = now >= deadline
  const clock = acceleration ? { profile: acceleration, playedMs: round.playedMs } : undefined
  const rankedStep = playing && round.ranked ? advanceRankedMotion(motion, round.ranked, now, settings) : null
  const passes = rankedStep?.passes ?? advancePreviewMotion(motion, now, playing && !expires ? ropeSpeed : 0, settings, playing, deadline, clock)
  const last = passes.at(-1)
  const miss = last?.kind === 'miss' ? last : undefined
  if (rankedStep) {
    round.playedMs = rankedStep.playedUs / 1000
  } else if (activeFrom !== null) {
    const playedUntil = miss?.at ?? Math.min(now, deadline)
    round.playedMs = expires && !miss ? roundDurationMs : round.playedMs + (playedUntil - activeFrom)
  }
  let successCue: PigeonSuccessCue | null = null
  let latest: ScoredPreviewPass | undefined
  for (const pass of passes) {
    const stats = applyPass(round.stats, pass)
    if (stats === round.stats) continue
    latest = { ...pass, earnedPoints: stats.score - round.stats.score }
    round.stats = stats
    const kind = successKind(pass.kind, stats.combo)
    // Show the latest success if a late frame processes several passes together.
    if (kind && activeFrom !== null) {
      const passClock = acceleration ? { profile: acceleration, playedMs: playedBefore + (pass.at - activeFrom) } : undefined
      const nextTurnMs = ropeTempo(intervalSpeed, passClock).timeForTurns(1)
      successCue = createSuccessCue(kind, now, pass.number - 1, nextTurnMs, now - pass.at)
    }
  }
  if (miss || expires) round.successCue = null
  else if (successCue) round.successCue = successCue

  if (phase.kind === 'initialCountdown') {
    phase.endsAt ??= now + countdownMs
    if (now >= phase.endsAt && ropeSpeed > 0) {
      const begins = round.ranked?.startsAt ?? now
      beginPlaying(round, { kind: 'playing', goAt: begins }, begins, ropeSpeed, settings)
      if (round.ranked) return advancePreviewRound(round, now, ropeSpeed, settings, reactionMs, acceleration)
    }
  } else if (playing && miss) {
    round.shockStartedAt = now
    if (round.stats.chances === 0) {
      round.endReason = 'missLimit'
      round.phase = { kind: 'gameOver', stoppedAt: miss.at, startedAt: now }
    } else {
      round.phase = motion.frame.phase === 'ready'
        ? { kind: 'reaction', stoppedAt: miss.at, startedAt: now, durationMs: reactionMs }
        : { kind: 'landing', stoppedAt: miss.at, reactionMs }
    }
  } else if (expires) {
    motion.ropeSpeed = 0
    round.shockStartedAt = null
    round.endReason = 'time'
    round.phase = { kind: 'completion', startedAt: now, restWeight: ropeRestWeight(round, now) }
  } else if (phase.kind === 'landing' && motion.frame.phase === 'ready') {
    round.phase = { kind: 'reaction', stoppedAt: phase.stoppedAt, startedAt: now, durationMs: phase.reactionMs }
  } else if (phase.kind === 'gameOver' && finaleStage(now - phase.startedAt) === 'result') {
    round.shockStartedAt = null
    round.phase = { kind: 'ended', restWeight: 1 }
  } else if (phase.kind === 'completion' && now - phase.startedAt >= completionResultMs) {
    round.phase = { kind: 'ended', restWeight: phase.restWeight }
  } else if (phase.kind === 'resumePending' || (phase.kind === 'reaction' && now - phase.startedAt >= phase.durationMs)) {
    if (ropeSpeed > 0) {
      beginPlaying(round, { kind: 'playing', resumedAfterPass: motion.passCount }, now, ropeSpeed, settings)
    } else if (phase.kind === 'reaction') {
      round.phase = { kind: 'resumePending', stoppedAt: phase.stoppedAt }
    }
  }
  return latest
}

export function requestRoundJump(round: PreviewRound, now: number, peak: number, flightSeconds: number) {
  return round.phase.kind === 'playing' && round.motion.ropeSpeed > 0
    && (round.ranked ? requestRankedJump(round.motion, round.ranked, now) : requestJump(round.motion, now, peak, flightSeconds))
}

export function roundSecondsLeft(round: PreviewRound) {
  return Math.ceil((roundDurationMs - round.playedMs) / 1000)
}

export function roundCue(round: PreviewRound, now: number): RoundCue {
  const phase = round.phase
  if (phase.kind === 'initialCountdown') {
    const left = (phase.endsAt ?? now + countdownMs) - now
    return left > 2000 ? '3' : left > 1000 ? '2' : '1'
  }
  if (phase.kind === 'playing' && phase.goAt !== undefined && now - phase.goAt < goMs) return 'GO!'
  if (phase.kind === 'gameOver' && finaleStage(now - phase.startedAt) === 'splash') return 'gameOverSplash'
  return phase.kind
}

function ease01(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** Let a stopped rope settle behind the heels, then blend into its first upswing. */
export function ropeRestWeight(round: PreviewRound, now: number) {
  const phase = round.phase
  if (phase.kind === 'menu' || phase.kind === 'initialCountdown') return 0
  if (phase.kind === 'ended' || phase.kind === 'completion') return phase.restWeight
  if (phase.kind !== 'playing') return ease01((now - phase.stoppedAt) / 140)
  return phase.resumedAfterPass === round.motion.passCount ? 1 - ease01(round.motion.angle / (Math.PI / 2)) : 0
}
