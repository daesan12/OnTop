import type { JudgementSettings } from './jumpRopeJudgement'
import { advancePreviewMotion, createPreviewMotion, requestJump } from './previewMotion'

const countdownMs = 3000
const goMs = 550

type Phase =
  | { kind: 'initialCountdown'; endsAt?: number }
  | PlayingPhase
  | { kind: 'landing'; stoppedAt: number; reactionMs: number }
  | { kind: 'reaction'; stoppedAt: number; startedAt: number; durationMs: number }
  | { kind: 'resumePending'; stoppedAt: number }

type PlayingPhase = { kind: 'playing'; goAt?: number; resumedAfterPass?: number }

export type PreviewRound = { motion: ReturnType<typeof createPreviewMotion>; phase: Phase }
export type RoundCue = 'playing' | 'landing' | 'reaction' | 'resumePending' | '3' | '2' | '1' | 'GO!'

export function createPreviewRound(): PreviewRound {
  return { motion: createPreviewMotion(), phase: { kind: 'initialCountdown' } }
}

export function resetPreviewRound(round: PreviewRound) {
  Object.assign(round.motion, createPreviewMotion())
  round.phase = { kind: 'initialCountdown' }
}

function beginPlaying(
  round: PreviewRound, phase: PlayingPhase, now: number, ropeSpeed: number, settings: JudgementSettings,
) {
  round.phase = phase
  round.motion.jump = null
  // Start the first turn at the observed transition even if the frame arrived late.
  advancePreviewMotion(round.motion, now, ropeSpeed, settings)
}

export function advancePreviewRound(
  round: PreviewRound, now: number, ropeSpeed: number, settings: JudgementSettings, reactionMs: number,
) {
  const { motion, phase } = round
  const playing = phase.kind === 'playing'
  const passes = advancePreviewMotion(motion, now, playing ? ropeSpeed : 0, settings, playing)
  const last = passes.at(-1)

  if (phase.kind === 'initialCountdown') {
    phase.endsAt ??= now + countdownMs
    if (now >= phase.endsAt && ropeSpeed > 0) {
      beginPlaying(round, { kind: 'playing', goAt: now }, now, ropeSpeed, settings)
    }
  } else if (playing && last?.kind === 'miss') {
    round.phase = motion.frame.phase === 'ready'
      ? { kind: 'reaction', stoppedAt: last.at, startedAt: now, durationMs: reactionMs }
      : { kind: 'landing', stoppedAt: last.at, reactionMs }
  } else if (phase.kind === 'landing' && motion.frame.phase === 'ready') {
    round.phase = { kind: 'reaction', stoppedAt: phase.stoppedAt, startedAt: now, durationMs: phase.reactionMs }
  } else if (phase.kind === 'resumePending' || (phase.kind === 'reaction' && now - phase.startedAt >= phase.durationMs)) {
    if (ropeSpeed > 0) {
      beginPlaying(round, { kind: 'playing', resumedAfterPass: motion.passCount }, now, ropeSpeed, settings)
    } else if (phase.kind === 'reaction') {
      round.phase = { kind: 'resumePending', stoppedAt: phase.stoppedAt }
    }
  }
  return last
}

export function requestRoundJump(round: PreviewRound, now: number, peak: number, flightSeconds: number) {
  return round.phase.kind === 'playing' && round.motion.ropeSpeed > 0
    && requestJump(round.motion, now, peak, flightSeconds)
}

export function roundCue(round: PreviewRound, now: number): RoundCue {
  const phase = round.phase
  if (phase.kind === 'initialCountdown') {
    const left = (phase.endsAt ?? now + countdownMs) - now
    return left > 2000 ? '3' : left > 1000 ? '2' : '1'
  }
  if (phase.kind === 'playing' && phase.goAt !== undefined && now - phase.goAt < goMs) return 'GO!'
  return phase.kind
}

function ease01(value: number) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** Let a stopped rope settle behind the heels, then blend into its first upswing. */
export function ropeRestWeight(round: PreviewRound, now: number) {
  const phase = round.phase
  if (phase.kind === 'initialCountdown') return 0
  if (phase.kind !== 'playing') return ease01((now - phase.stoppedAt) / 140)
  return phase.resumedAfterPass === round.motion.passCount ? 1 - ease01(round.motion.angle / (Math.PI / 2)) : 0
}
