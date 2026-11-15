import { grandpaWindupMs, type GrandpaRuntime } from './grandpaEvent'
import { shoutFromMs } from './grandpaPose'
import type { DistractionCue } from './pigeonDistractionMotion'
import { poopImpactMs } from './poopDistractionMotion'
import type { PreviewRound, RoundCue } from './previewRound'

/**
 * Which sounds a round step calls for. It only reads the state the game already produced (cue, stats,
 * grandpa visits, distraction runs) and never judges anything itself. GOOD and PERFECT have no sound.
 */
export type JumpRopeSfx = 'countdownTick' | 'gameGo' | 'missLaugh' | 'grandpaEnter' | 'broomWindup' | 'broomSwing'
  | 'broomHit' | 'pigeonFlap' | 'poopSplat' | 'victory' | 'gameOver'
/** on: the loop plays. paused: it keeps its position. off: it stops and starts from the top next round. */
export type BgmState = 'on' | 'paused' | 'off'

/** A cue due on the play clock sounds once; a step that only reaches it later than this (a hidden tab) stays quiet. */
export const cueLateToleranceMs = 250
/**
 * broom_swing.ogg builds from about 80 ms and peaks at 160 ms (measured), so it starts 160 ms before the contact:
 * the audible sweep falls inside the strike (strikeLeadMs) and peaks as the broom reaches the avatar.
 */
export const broomSwingLeadMs = 160

/** One running distraction: `key` is unique per run, `elapsedMs` is measured on the clock its pose uses. */
export type AudioDistraction = { key: string; cue: Pick<DistractionCue, 'kind'>; elapsedMs: number }
export type AudioFrame = {
  round: PreviewRound
  cue: RoundCue
  /** The raid on stage. Undefined for a ranked v1 round or a preview without the grandpa, which stay silent. */
  grandpa?: GrandpaRuntime
  distractions: readonly AudioDistraction[]
}

export type AudioCueTracker = {
  cue: RoundCue | null
  misses: number
  ended: boolean
  /** One-shot cues already decided this round, sounded or skipped as late. */
  fired: Set<string>
}

export function createAudioCueTracker(): AudioCueTracker {
  return { cue: null, misses: 0, ended: false, fired: new Set() }
}

const countdown = new Set<RoundCue>(['3', '2', '1'])
const silentLoop = new Set<RoundCue>(['menu', 'initialCountdown', '3', '2', '1', 'GO!'])

/** Updates the tracker to this step and returns the sounds that start now plus the wanted loop state. */
export function observeRoundAudio(tracker: AudioCueTracker, { round, cue, grandpa, distractions }: AudioFrame) {
  const sfx: JumpRopeSfx[] = []
  function once(key: string, dueMs: number, nowMs: number, sound: JumpRopeSfx) {
    if (tracker.fired.has(key) || !(nowMs >= dueMs)) return
    tracker.fired.add(key)
    if (nowMs - dueMs <= cueLateToleranceMs) sfx.push(sound)
  }

  const previous = tracker.cue
  tracker.cue = cue
  if (cue !== previous) {
    if (countdown.has(cue)) sfx.push('countdownTick')
    else if (cue === 'GO!') sfx.push('gameGo')
  }
  // Every judged MISS, the stunned rope's included. A broom contact alone is not a MISS and stays without a laugh.
  const misses = round.stats.counts.miss
  if (misses > tracker.misses) sfx.push('missLaugh')
  tracker.misses = misses

  const ended = round.endReason !== null
  if (!ended) {
    grandpa?.events.forEach((event, visit) => {
      if (event.status !== 'active') return
      once(`enter:${visit}`, event.startMs + shoutFromMs, round.playedMs, 'grandpaEnter')
      event.swings.forEach((swing, order) => {
        const contactMs = swing.hitMs ?? swing.plannedHitMs
        // The red tell and the trembling coil start together; the first safe swing has neither.
        if (swing.kind === 'danger') once(`windup:${visit}:${order}`, contactMs - grandpaWindupMs, round.playedMs, 'broomWindup')
        once(`swing:${visit}:${order}`, contactMs - broomSwingLeadMs, round.playedMs, 'broomSwing')
        // The stun is the trigger: it is set at the contact, which float play time may reach a hair early.
        if (swing.result === 'hit') once(`hit:${visit}:${order}`, Math.min(contactMs, round.playedMs), round.playedMs, 'broomHit')
      })
    })
    for (const { key, cue: run, elapsedMs } of distractions) {
      if (run.kind === 'flight') once(`flight:${key}`, 0, elapsedMs, 'pigeonFlap')
      // The lens splat turns visible exactly at impact (poopSplatOpacity), then only fades.
      else if (run.kind === 'poop') once(`poop:${key}`, poopImpactMs, elapsedMs, 'poopSplat')
    }
  }
  if (cue === 'gameOverSplash' && previous !== 'gameOverSplash') sfx.push('poopSplat')
  if (ended && !tracker.ended && round.endReason === 'time') sfx.push('victory')
  // The game-over sting waits for the result screen, after the third MISS laugh and the finale splat.
  if (cue === 'ended' && previous !== 'ended' && round.endReason === 'missLimit') sfx.push('gameOver')
  tracker.ended = ended

  const bgm: BgmState = ended || silentLoop.has(cue) ? 'off'
    : cue === 'resumePending' || (cue === 'playing' && round.motion.ropeSpeed <= 0) ? 'paused'
      : 'on'
  return { sfx, bgm }
}
