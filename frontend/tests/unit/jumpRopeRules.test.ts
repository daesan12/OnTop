import { describe, expect, it } from 'vitest'
import { applyPass, createRoundStats } from '../../src/jump-rope-preview/jumpRopeRules'
import { finaleImpactMs, finaleResultMs } from '../../src/jump-rope-preview/gameOverFinale'
import { completionResultMs, sampleExhaustedHolder, sampleResignedAudience } from '../../src/jump-rope-preview/completionFinale'
import {
  advancePreviewRound, createPreviewRound, requestRoundJump, resetPreviewRound, roundCue, roundSecondsLeft, ropeRestWeight,
} from '../../src/jump-rope-preview/previewRound'

const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const reactionMs = 1350

function createGame() {
  const round = createPreviewRound()
  const step = (at: number, speed = 1) => advancePreviewRound(round, at, speed, settings, reactionMs)
  const jump = (at: number) => requestRoundJump(round, at, 0.6, 0.4)
  step(0)
  return { round, step, jump }
}

describe('jump rope scoring', () => {
  it('tracks points and PERFECT streaks while ignoring duplicate and older passes', () => {
    const first = applyPass(createRoundStats(), { kind: 'perfect', number: 1 })
    const streak = applyPass(first, { kind: 'perfect', number: 2 })
    expect(streak).toMatchObject({ score: 300, combo: 2, maxCombo: 2, chances: 3 })
    expect(applyPass(streak, { kind: 'perfect', number: 2 })).toBe(streak)
    expect(applyPass(streak, { kind: 'miss', number: 1 })).toBe(streak)

    const good = applyPass(streak, { kind: 'good', number: 3 })
    expect(good).toMatchObject({ score: 400, combo: 0, maxCombo: 2 })
    const nextPerfect = applyPass(good, { kind: 'perfect', number: 4 })
    expect(nextPerfect.combo).toBe(1)
    const miss = applyPass(nextPerfect, { kind: 'miss', number: 5 })
    expect(miss).toMatchObject({ score: 550, combo: 0, maxCombo: 2, chances: 2, counts: { perfect: 3, good: 1, miss: 1 } })
  })
})

describe('jump rope game', () => {
  it('starts at 60 seconds and charges only play up to the exact MISS or manual pause', () => {
    const { round, step, jump } = createGame()
    step(2999)
    expect(roundSecondsLeft(round)).toBe(60)
    step(3000)
    expect(roundCue(round, 3000)).toBe('GO!')
    step(3500, 0)
    expect(round.playedMs).toBe(500)
    step(10000, 0)
    expect(jump(10000)).toBe(false)
    expect(round.playedMs).toBe(500)
    step(11000)
    expect(step(14000)).toMatchObject({ at: 11500, kind: 'miss' })
    expect(round.playedMs).toBe(1000)
    expect(roundSecondsLeft(round)).toBe(59)
    expect(round.stats.chances).toBe(2)
    step(15349)
    expect(round.phase.kind).toBe('reaction')
    expect(jump(15349)).toBe(false)
    step(15350)
    expect(round.phase.kind).toBe('playing')
    expect(round.playedMs).toBe(1000)
    step(15400)
    expect(round.playedMs).toBe(1050)
  })

  it('resumes twice, locks the third MISS immediately, shows the result after the finale, and resets', () => {
    const { round, step, jump } = createGame()
    step(3000)
    step(3730)
    expect(jump(3730)).toBe(true)
    expect(step(4000)).toMatchObject({ kind: 'perfect' })
    expect(round.stats).toMatchObject({ score: 150, combo: 1, maxCombo: 1 })

    for (const [at, chances] of [[5000, 2], [7350, 1], [9700, 0]] as const) {
      expect(step(at)).toMatchObject({ kind: 'miss' })
      expect(round.stats).toMatchObject({ chances, combo: 0, maxCombo: 1 })
      expect(round.phase.kind).toBe(chances > 0 ? 'reaction' : 'gameOver')
      expect(jump(at + 100)).toBe(false)
      expect(round.endReason).toBe(chances > 0 ? null : 'missLimit')
      const duration = chances > 0 ? reactionMs : finaleResultMs
      if (chances === 0) {
        expect(round.shockStartedAt).toBe(at)
        expect(step(at + finaleImpactMs)).toBeUndefined()
        expect(roundCue(round, at + finaleImpactMs)).toBe('gameOverSplash')
      }
      expect(step(at + duration - 1)).toBeUndefined()
      expect(round.phase.kind).toBe(chances > 0 ? 'reaction' : 'gameOver')
      step(at + duration)
      expect(round.phase.kind).toBe(chances > 0 ? 'playing' : 'ended')
    }

    const final = round.stats
    expect(final).toMatchObject({ score: 150, chances: 0, combo: 0, maxCombo: 1, counts: { perfect: 1, good: 0, miss: 3 } })
    expect(step(100000)).toBeUndefined()
    expect(jump(100000)).toBe(false)
    expect(round.stats).toBe(final)
    expect(round.playedMs).toBe(4000)
    resetPreviewRound(round)
    expect(round).toEqual(createPreviewRound())
    expect(roundCue(round, 100000)).toBe('3')
    expect(roundSecondsLeft(round)).toBe(60)
  })

  it('keeps passes before 60 seconds and lets the timer win a tie in a delayed frame', () => {
    const { round, step, jump } = createGame()
    step(3000)
    for (let pass = 1; pass <= 59; pass++) {
      const at = 3000 + pass * 1000
      step(at - 270)
      expect(jump(at - 270)).toBe(true)
      expect(step(at)).toMatchObject({ kind: 'perfect' })
    }

    step(62000, 2)
    step(62250, 2)
    expect(jump(62250)).toBe(true)
    expect(step(65000, 2)).toMatchObject({ number: 60, at: 62500, kind: 'perfect' })
    expect(round.endReason).toBe('time')
    expect(roundCue(round, 65000)).toBe('completion')
    expect(round.playedMs).toBe(60000)
    expect(roundSecondsLeft(round)).toBe(0)
    expect(round.motion.passCount).toBe(60)
    expect(round.stats).toMatchObject({ score: 9000, chances: 3, combo: 60, maxCombo: 60, counts: { perfect: 60, good: 0, miss: 0 } })
    expect(jump(65000)).toBe(false)
    const finalStats = round.stats
    const stoppedAngle = round.motion.angle
    expect(step(65000 + completionResultMs - 1)).toBeUndefined()
    expect(roundCue(round, 65000 + completionResultMs - 1)).toBe('completion')
    expect(step(65000 + completionResultMs + 500)).toBeUndefined()
    expect(roundCue(round, 65000 + completionResultMs + 500)).toBe('ended')
    expect(round.motion.angle).toBe(stoppedAngle)
    expect(round.stats).toBe(finalStats)
    expect(round.playedMs).toBe(60000)
    resetPreviewRound(round)
    expect(round).toEqual(createPreviewRound())
  })

  it('honors a third MISS before the time boundary even when observed after it', () => {
    const { round, step, jump } = createGame()
    step(3000)
    step(4000)
    step(5350)
    step(6350)
    step(7700, 0.1)
    for (let pass = 1; pass <= 5; pass++) {
      const at = 7700 + pass * 10000
      step(at - 270, 0.1)
      expect(jump(at - 270)).toBe(true)
      step(at, 0.1)
    }
    step(57700, 0.2)
    expect(step(69700, 0.2)).toMatchObject({ at: 62700, kind: 'miss' })
    expect(round.endReason).toBe('missLimit')
    expect(round.playedMs).toBe(57000)
    expect(round.phase.kind).toBe('gameOver')
    step(69700 + finaleResultMs + 500, 0.2)
    expect(round.phase.kind).toBe('ended')
  })

  it('finishes the first resumed turn without scoring or resetting its rope pose when it ties the timer', () => {
    const { round, step } = createGame()
    step(3000)
    step(4000)
    step(5350, 1 / 58)
    step(63350, 1 / 58)
    step(64700)
    expect(round.playedMs).toBe(59000)
    expect(ropeRestWeight(round, 64700)).toBe(1)
    expect(step(65700)).toBeUndefined()
    expect(round.endReason).toBe('time')
    expect(round.phase.kind).toBe('completion')
    expect(round.stats.chances).toBe(1)
    expect(round.motion.passCount).toBe(2)
    expect(ropeRestWeight(round, 65700)).toBe(0)
  })

  it.each([30, 144])('reaches the same 60-second deadline at %i FPS', fps => {
    const { round, step } = createGame()
    step(3000, 0.01)
    for (let frame = 1; frame <= 60 * fps; frame++) step(3000 + frame * 1000 / fps, 0.01)
    expect(round.playedMs).toBe(60000)
    expect(round.endReason).toBe('time')
    expect(round.stats).toEqual(createRoundStats())
  })
})

describe('completion poses', () => {
  it('shows sideways glances before four staggered head drops that stay down through the result', () => {
    const audience = [0, 1, 2, 3]
    const glances = audience.map(index => sampleResignedAudience(610, index))
    expect(glances.map(pose => Math.sign(pose.gazeX))).toEqual([1, -1, 1, -1])
    expect(glances.every(pose => pose.slump === 0)).toBe(true)
    const startedCounts = [1120, 1400, 1650, 2050].map(age =>
      audience.filter(index => sampleResignedAudience(age, index).slump > 0).length)
    expect(startedCounts).toEqual([1, 2, 3, 4])
    for (const index of audience) {
      let previousPitch = sampleResignedAudience(930, index).pitch
      for (let age = 950; age < completionResultMs; age += 20) {
        const { pitch } = sampleResignedAudience(age, index)
        expect(pitch).toBeGreaterThanOrEqual(previousPitch)
        previousPitch = pitch
      }
      const final = sampleResignedAudience(completionResultMs, index)
      expect(final.slump).toBe(1)
      expect(final.pitch).toBeGreaterThanOrEqual(0.9)
      expect(sampleResignedAudience(completionResultMs - 260, index)).toEqual(final)
      expect(sampleResignedAudience(completionResultMs + 1000, index)).toEqual(final)
    }
  })

  it('lets the holders slump at different times and hold their exhausted pose through the result', () => {
    expect(sampleExhaustedHolder(100, 0).pitch).toBeGreaterThan(0)
    expect(sampleExhaustedHolder(100, 1).pitch).toBe(0)
    for (const index of [0, 1]) {
      expect(sampleExhaustedHolder(completionResultMs, index)).toMatchObject({ sink: -0.104, wingDrop: -0.26 })
    }
  })
})
