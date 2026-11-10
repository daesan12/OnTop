import { describe, expect, it } from 'vitest'
import { isSuccessActive, neutralSuccessPose, samplePigeonSuccess, type PigeonSuccessCue } from '../../src/jump-rope-preview/pigeonSuccess'
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
      expect(cue).toEqual({ kind, startedAt: at, variant: index })
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
    expect(round.successCue).toEqual({ kind: 'good', startedAt: 6800, variant: 3 })
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
  const cue = (kind: PigeonSuccessCue['kind'], variant = 0) => ({ kind, variant, startedAt: 1000 })

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
})
