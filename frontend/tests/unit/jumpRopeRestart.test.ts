import { describe, expect, it } from 'vitest'
import { samplePigeonLaugh } from '../../src/jump-rope-preview/pigeonLaugh'
import { missShockMs, sampleMissShock } from '../../src/jump-rope-preview/missShock'
import { advancePreviewRound, createPreviewRound, requestRoundJump, resetPreviewRound, roundCue, ropeRestWeight } from '../../src/jump-rope-preview/previewRound'

const rules = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const reactionMs = 1350

function createRound() {
  const round = createPreviewRound()
  const step = (at: number, speed = 1) => advancePreviewRound(round, at, speed, rules, reactionMs)
  const jump = (at: number) => requestRoundJump(round, at, 0.6, 0.4)
  return { round, step, jump }
}

function start() {
  const { round, step, jump } = createRound()
  step(0)
  step(3000)
  return { round, step, jump }
}

describe('jump rope restart', () => {
  it('counts down once before play and starts a new countdown on reset', () => {
    const { round, step, jump } = createRound()
    for (const [at, cue] of [[0, '3'], [1000, '2'], [2000, '1']] as const) {
      expect(step(at)).toBeUndefined()
      expect(roundCue(round, at)).toBe(cue)
      expect(jump(at)).toBe(false)
      expect(round.motion.angle).toBe(0)
      expect(round.motion.passCount).toBe(0)
    }
    expect(step(3000)).toBeUndefined()
    expect(roundCue(round, 3000)).toBe('GO!')
    expect(step(3999)).toBeUndefined()
    expect(step(4000)).toMatchObject({ number: 1, kind: 'miss' })

    resetPreviewRound(round)
    expect(round.motion.passCount).toBe(0)
    expect(step(5000)).toBeUndefined()
    expect(roundCue(round, 5000)).toBe('3')
  })

  it('stops at the first miss even if several turns elapsed between frames', () => {
    const { round, step, jump } = start()
    expect(step(7200)).toMatchObject({ number: 1, at: 4000, kind: 'miss' })
    expect(round.motion.angle).toBe(0)
    expect(round.phase).toMatchObject({ kind: 'reaction', startedAt: 7200 })
    expect(jump(7200)).toBe(false)
    expect(step(7210)).toBeUndefined()
    expect(round.motion.passCount).toBe(1)
  })

  it('waits for a committed late jump to land before starting the reaction', () => {
    const { round, step, jump } = start()
    step(3950)
    expect(jump(3950)).toBe(true)
    expect(step(4000)).toMatchObject({ kind: 'miss' })
    expect(round.phase.kind).toBe('landing')
    step(4250)
    expect(round.motion.frame.phase).toBe('air')
    expect(jump(4250)).toBe(false)
    step(4530)
    expect(round.motion.frame.phase).toBe('ready')
    expect(round.phase).toMatchObject({ kind: 'reaction', startedAt: 4530 })
  })

  it('blocks input during repeated reactions and resumes for a full turn without a countdown or GO', () => {
    const { round, step, jump } = start()
    for (const [missAt, passNumber] of [[4000, 1], [6350, 2]] as const) {
      expect(step(missAt)).toMatchObject({ number: passNumber, kind: 'miss' })
      expect(ropeRestWeight(round, missAt)).toBe(0)
      expect(ropeRestWeight(round, missAt + 140)).toBe(1)
      const resumeAt = missAt + reactionMs
      expect(step(resumeAt - 1)).toBeUndefined()
      expect(roundCue(round, resumeAt - 1)).toBe('reaction')
      expect(jump(resumeAt - 1)).toBe(false)
      expect(round.motion.ropeSpeed).toBe(0)
      expect(step(resumeAt)).toBeUndefined()
      expect(roundCue(round, resumeAt)).toBe('playing')
      expect(round.motion.jump).toBeNull()
      expect(round.motion.angle).toBe(0)
      expect(ropeRestWeight(round, resumeAt)).toBe(1)
      expect(step(resumeAt + 999)).toBeUndefined()
      expect(ropeRestWeight(round, resumeAt + 999)).toBe(0)
      expect(round.motion.passCount).toBe(passNumber)
    }
  })

  it('honors manual pause through both the initial countdown and MISS reaction', () => {
    const { round, step, jump } = createRound()
    step(0, 0)
    step(8000, 0)
    expect(roundCue(round, 8000)).toBe('1')
    expect(jump(8000)).toBe(false)
    expect(step(9000, 1)).toBeUndefined()
    expect(roundCue(round, 9000)).toBe('GO!')
    expect(step(10000)).toMatchObject({ number: 1, kind: 'miss' })

    expect(step(16000, 0)).toBeUndefined()
    expect(roundCue(round, 16000)).toBe('resumePending')
    expect(jump(16000)).toBe(false)
    expect(round.motion.passCount).toBe(1)
    expect(step(17000)).toBeUndefined()
    expect(roundCue(round, 17000)).toBe('playing')
    expect(step(17730)).toBeUndefined()
    expect(jump(17730)).toBe(true)
    expect(step(18000)).toMatchObject({ number: 2, at: 18000, kind: 'perfect' })
  })

  it('keeps PERFECT and GOOD on the normal playing path', () => {
    const { round, step, jump } = start()
    step(3730)
    expect(jump(3730)).toBe(true)
    expect(step(4000)).toMatchObject({ kind: 'perfect' })
    step(4660)
    expect(jump(4660)).toBe(true)
    expect(step(5000)).toMatchObject({ kind: 'good' })
    expect(round.phase.kind).toBe('playing')
  })
})

it('gives all six pigeons staggered reactions that return to the resting pose', () => {
  const actors = [
    ['holder', 0, 0], ['holder', 1, 65],
    ['audience', 0, 95], ['audience', 1, 170], ['audience', 2, 230], ['audience', 3, 285],
  ] as const
  const resting = samplePigeonLaugh('holder', 0, 0, reactionMs)
  const active = actors.map(([role, index, delay]) => {
    expect(samplePigeonLaugh(role, index, delay, reactionMs)).toEqual(resting)
    expect(samplePigeonLaugh(role, index, reactionMs, reactionMs)).toEqual(resting)
    const pose = samplePigeonLaugh(role, index, 570, reactionMs)
    expect(pose.pitch).toBeLessThan(-Math.PI / 2)
    expect(pose.pitch).toBeGreaterThanOrEqual(-1.78)
    expect(pose.headLift).toBeGreaterThan(0.1)
    expect(pose.lift).toBeGreaterThan(0)
    expect(pose.lift).toBeLessThan(0.085)
    if (role === 'holder') expect(pose.jaw).toBe(0)
    else expect(pose.jaw).toBeGreaterThan(0)
    return JSON.stringify(pose)
  })
  expect(new Set(active).size).toBe(6)
})

it('adjusts the laugh angle without changing the stagger or body bounce', () => {
  const weak = samplePigeonLaugh('audience', 2, 570, reactionMs, 0.65)
  const strong = samplePigeonLaugh('audience', 2, 570, reactionMs, 1.1)
  expect(strong.pitch).toBeLessThan(weak.pitch)
  expect(strong.headLift).toBeGreaterThan(weak.headLift)
  expect(strong.lift).toBe(weak.lift)
  expect(strong.lean).toBe(weak.lean)
})

it('uses one continuous X-ray exposure and releases the stance within the shock window', () => {
  const exposure = Array.from({ length: 51 }, (_, index) => sampleMissShock(index * 10).xray)
  expect(exposure.slice(0, 5)).toEqual([...exposure.slice(0, 5)].sort((a, b) => a - b))
  expect(exposure.slice(4)).toEqual([...exposure.slice(4)].sort((a, b) => b - a))
  expect(sampleMissShock(100)).toMatchObject({ xray: 1, stiffness: 1 })
  expect(sampleMissShock(430)).toMatchObject({ xray: 0 })
  expect(sampleMissShock(430).stiffness).toBeGreaterThan(0)
  expect(sampleMissShock(missShockMs)).toMatchObject({ intensity: 0, xray: 0, stiffness: 0 })
})

it('starts shock immediately on a late-jump MISS and clears it without extending the restart', () => {
  const { round, step, jump } = start()
  step(3730)
  expect(jump(3730)).toBe(true)
  expect(step(4000)?.kind).toBe('perfect')
  expect(round.shockStartedAt).toBeNull()

  step(4950)
  expect(jump(4950)).toBe(true)
  expect(step(5000)?.kind).toBe('miss')
  expect(round.shockStartedAt).toBe(5000)
  expect(round.phase.kind).toBe('landing')
  const rest = sampleMissShock(Infinity)
  expect(sampleMissShock(95).intensity).toBeGreaterThan(0)
  expect(sampleMissShock(missShockMs)).toEqual(rest)
  step(5530)
  expect(round.phase.kind).toBe('reaction')
  step(5530 + reactionMs)
  expect(round.phase.kind).toBe('playing')
  expect(round.shockStartedAt).toBeNull()
  expect(round.stats).toMatchObject({ score: 150, chances: 2, combo: 0 })

  step(5530 + reactionMs + 1000)
  expect(round.shockStartedAt).not.toBeNull()
  resetPreviewRound(round)
  expect(round.shockStartedAt).toBeNull()
})
