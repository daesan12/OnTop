import { describe, expect, it } from 'vitest'
import { createSuccessCue, isSuccessActive, neutralSuccessPose, samplePigeonSuccess, successDurationMs, type PigeonSuccessKind } from '../../src/jump-rope-preview/pigeonSuccess'
import { advancePreviewRound, createPreviewRound, requestRoundJump, resetPreviewRound } from '../../src/jump-rope-preview/previewRound'

const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }

function startGame() {
  const round = createPreviewRound()
  const step = (at: number, speed = 1, rules = settings) => advancePreviewRound(round, at, speed, rules, 1350)
  function jumpBefore(passAt: number, leadMs = 270) {
    const at = passAt - leadMs
    step(at)
    expect(requestRoundJump(round, at, 0.6, 0.4)).toBe(true)
    return step(passAt)
  }
  step(0)
  step(3000)
  return { round, step, jumpBefore }
}

describe('pigeon success cues', () => {
  it('repeats the tier pose on every PERFECT and returns to normal after GOOD or MISS', () => {
    const { round, step, jumpBefore } = startGame()
    const tiers = ['perfect', 'perfect', 'perfect', 'perfect', 'combo5', 'combo5', 'combo5', 'combo5', 'combo5', 'combo10', 'combo10', 'combo10']
    for (const [index, kind] of tiers.entries()) {
      const at = 4000 + index * 1000
      expect(jumpBefore(at)?.kind).toBe('perfect')
      const cue = round.successCue
      expect(cue).toMatchObject({ kind, startedAt: at, variant: index })
      expect(step(at)).toBeUndefined()
      expect(round.successCue).toBe(cue)
    }
    expect(jumpBefore(16000, 350)?.kind).toBe('good')
    expect(round.successCue?.kind).toBe('good')
    expect(round.stats.combo).toBe(0)
    jumpBefore(17000)
    expect(round.successCue?.kind).toBe('perfect')
    expect(round.stats).toMatchObject({ score: 2050, combo: 1, maxCombo: 12 })
    step(18000)
    expect(round.phase.kind).toBe('reaction')
    expect(round.successCue).toBeNull()
    expect(round.stats.combo).toBe(0)
    step(19350)
    expect(jumpBefore(20350)?.kind).toBe('perfect')
    expect(round.successCue?.kind).toBe('perfect')
    resetPreviewRound(round)
    expect(round.successCue).toBeNull()
  })

  it('shows the latest GOOD if a delayed frame also processes a PERFECT', () => {
    const { round, step, jumpBefore } = startGame()
    jumpBefore(4000)
    jumpBefore(5000)
    step(5100, 0)
    // Resume after a pause with a flight that can clear two turns in one frame.
    const wide = { ...settings, perfectWindowMs: 150 }
    step(6000, 2.4, wide)
    expect(requestRoundJump(round, 6000, 0.6, 0.9)).toBe(true)
    expect(step(6800, 2.4, wide)).toMatchObject({ number: 4, kind: 'good' })
    expect(round.stats).toMatchObject({ combo: 0, maxCombo: 3, score: 550 })
    expect(round.successCue).toMatchObject({ kind: 'good', startedAt: 6800, variant: 3 })
  })

  it('suppresses a valid success cue in the frame that ends the game', () => {
    const { round, step } = startGame()
    step(3000, 0.02)
    step(52730, 0.02)
    expect(requestRoundJump(round, 52730, 0.6, 0.4)).toBe(true)
    expect(step(63500, 0.02)).toMatchObject({ kind: 'perfect' })
    expect(round.endReason).toBe('time')
    expect(round.stats.score).toBe(150)
    expect(round.successCue).toBeNull()
  })
})

describe('pigeon success poses', () => {
  const actors = [0, 1, 2, 3]
  const cue = (kind: PigeonSuccessKind, variant = 0) => createSuccessCue(kind, 1000, variant, Infinity)

  it('rotates the audience members for GOOD and keeps holders still', () => {
    expect(samplePigeonSuccess(cue('good'), 'holder', 0, 1250)).toEqual(neutralSuccessPose)
    const active = (variant: number) => actors.filter(index => samplePigeonSuccess(cue('good', variant), 'audience', index, 1250) !== neutralSuccessPose)
    expect(active(0)).toEqual([0])
    expect(active(1)).toEqual([1, 2])
    expect(samplePigeonSuccess(cue('perfect'), 'audience', 0, 1250).pitch).toBeLessThan(-0.3)
  })

  it('staggers the five- and ten-combo audience poses and settles all actors again', () => {
    const murmur = cue('combo5')
    const panic = cue('combo10')
    expect(samplePigeonSuccess(murmur, 'audience', 0, 1140).yaw).toBeGreaterThan(0)
    expect(samplePigeonSuccess(murmur, 'audience', 1, 1140)).toEqual(neutralSuccessPose)
    expect(samplePigeonSuccess(murmur, 'audience', 1, 1270).yaw).toBeLessThan(0)
    const active = actors.map(index => samplePigeonSuccess(panic, 'audience', index, 1470))
    expect(new Set(active.map(pose => pose.leftWing)).size).toBe(4)
    expect(active.every(pose => Math.abs(pose.bodyRoll) > 0)).toBe(true)
    expect(samplePigeonSuccess(panic, 'holder', 1, 1470)).toMatchObject({ leftWing: 0, rightWing: 0, bodyRoll: 0 })
    expect(isSuccessActive(panic, 2180)).toBe(false)
    for (const index of actors) expect(samplePigeonSuccess(panic, 'audience', index, 2180)).toEqual(neutralSuccessPose)
  })

  it('shortens only the combo reactions at normal rope speeds and makes room for late frames', () => {
    const kinds = ['good', 'perfect', 'combo5', 'combo10'] as const
    expect(kinds.map(kind => successDurationMs(kind, 1000))).toEqual([550, 680, 960, 920])
    expect(kinds.map(kind => successDurationMs(kind, 800))).toEqual([550, 680, 700, 720])
    expect(successDurationMs('combo10', 800, 160)).toBe(560)
    expect(successDurationMs('combo10', 800, 510)).toBe(0)
  })

  it('keeps the wing beat at the same local age and settles every pigeon before the next fast turn', () => {
    const original = cue('combo10')
    const fast = createSuccessCue('combo10', 1000, 0, 800)
    const sameLocalAge = 310
    const from = samplePigeonSuccess(original, 'audience', 0, 1000 + 35 + sameLocalAge)
    const to = samplePigeonSuccess(fast, 'audience', 0, 1000 + 35 * fast.durationMs / original.durationMs + sameLocalAge)
    expect(to.leftWing).toBeCloseTo(from.leftWing, 10)
    expect(to.bodyRoll).toBeCloseTo(from.bodyRoll, 10)
    for (const kind of ['combo5', 'combo10'] as const) {
      const reaction = createSuccessCue(kind, 1000, 0, 800)
      for (const index of actors) {
        expect(samplePigeonSuccess(reaction, 'audience', index, 1400)).not.toEqual(neutralSuccessPose)
        expect(samplePigeonSuccess(reaction, 'audience', index, 1000 + reaction.durationMs)).toEqual(neutralSuccessPose)
      }
      expect(isSuccessActive(reaction, 1799)).toBe(false)
    }
  })
})
