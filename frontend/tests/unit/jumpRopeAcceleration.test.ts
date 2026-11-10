import { describe, expect, it } from 'vitest'
import { advanceRope } from '../../src/jump-rope-preview/jumpRopeJudgement'
import { advancePreviewRound, createPreviewRound, requestRoundJump, resetPreviewRound } from '../../src/jump-rope-preview/previewRound'
import { defaultRopeAcceleration as profile, ropePeriodMs } from '../../src/jump-rope-preview/ropeAcceleration'
import { isSuccessActive } from '../../src/jump-rope-preview/pigeonSuccess'

const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const startAt = 3000
const reactionMs = 1350
const slope = 200 / 60000
const playTimeAtTurn = (turn: number, speed = 1) => -1000 * Math.expm1(-slope * turn / speed) / slope

function startRound(speed = 1) {
  const round = createPreviewRound()
  const step = (at: number, nextSpeed = speed) => advancePreviewRound(round, at, nextSpeed, settings, reactionMs, profile)
  const jump = (at: number) => requestRoundJump(round, at, 0.6, 0.4)
  step(0)
  step(startAt)
  return { round, step, jump }
}

describe('accelerating jump rope', () => {
  it('decreases the period continuously from 1000 to 800 ms only over the play clock', () => {
    const periodAt = (playedMs: number) => ropePeriodMs(1, { profile, playedMs })
    expect([0, 15000, 30000, 45000, 60000].map(periodAt)).toEqual([1000, 950, 900, 850, 800])
    expect(periodAt(7500)).toBe(975)
    expect(periodAt(70000)).toBe(800)
    for (let ms = 1; ms <= 60000; ms += 137) expect(periodAt(ms)).toBeLessThan(periodAt(ms - 1))
    expect(ropePeriodMs(0.5, { profile, playedMs: 45000 })).toBe(1700)
    expect(ropePeriodMs(0.5)).toBe(2000)
    expect(ropePeriodMs(1, { profile: { startPeriodMs: 800, endPeriodMs: 1000 }, playedMs: 45000 })).toBe(800)
  })

  it.each([1000 / 30, 1000 / 144, 60_000])('keeps phase and every crossing at the same time with %f ms frames', frameMs => {
    const passages: number[] = []
    let angle = 0
    let playedMs = 0
    while (playedMs < 60000) {
      const end = Math.min(60000, playedMs + frameMs)
      const next = advanceRope(angle, startAt + playedMs, startAt + end, 1, { profile, playedMs })
      angle = next.angle
      passages.push(...next.passages)
      playedMs = end
    }
    expect(passages).toHaveLength(66)
    passages.forEach((at, index) => expect(at).toBeCloseTo(startAt + playTimeAtTurn(index + 1), 7))
    const turns = -Math.log(0.8) / slope
    expect(angle).toBeCloseTo((turns % 1) * 2 * Math.PI, 8)
  })

  it.each([1000 / 30, 1000 / 144, 1800])('keeps PERFECT, GOOD and MISS aligned through %f ms frames', frameMs => {
    const { round, step, jump } = startRound()
    const passes = []
    let frame = startAt + frameMs
    function tick(at: number) {
      const pass = step(at)
      if (pass) passes.push(pass)
    }
    for (const [index, leadMs] of [270, 350, 270, 25].entries()) {
      const inputAt = startAt + playTimeAtTurn(index + 1) - leadMs
      while (frame < inputAt) { tick(frame); frame += frameMs }
      tick(inputAt)
      expect(jump(inputAt)).toBe(true)
    }
    tick(startAt + playTimeAtTurn(4) + 500)
    expect(passes.map(({ number, kind }) => [number, kind])).toEqual([[1, 'perfect'], [2, 'good'], [3, 'perfect'], [4, 'miss']])
    passes.forEach(({ at }, index) => expect(at).toBeCloseTo(startAt + playTimeAtTurn(index + 1), 7))
    expect(round.stats).toMatchObject({ score: 400, chances: 2 })
  })

  it('freezes tempo during the reaction and manual pause, and resumes with a full accelerated turn', () => {
    const { round, step, jump } = startRound()
    expect(round.playedMs).toBe(0)
    for (let turn = 1; turn < 34; turn++) {
      const at = startAt + playTimeAtTurn(turn)
      step(at - 270)
      expect(jump(at - 270)).toBe(true)
      expect(step(at)?.kind).toBe('perfect')
    }
    const missedAt = startAt + playTimeAtTurn(34)
    const seenAt = missedAt + 60
    expect(step(seenAt)?.kind).toBe('miss')
    expect(round.playedMs).toBeCloseTo(playTimeAtTurn(34), 8)
    const frozen = round.playedMs
    expect(round.shockStartedAt).toBe(seenAt)
    step(seenAt + reactionMs - 1)
    expect(round.playedMs).toBe(frozen)
    expect(round.phase.kind).toBe('reaction')

    const resumed = seenAt + reactionMs
    step(resumed)
    expect(round.playedMs).toBe(frozen)
    expect(round.shockStartedAt).toBeNull()
    expect(round.motion.angle).toBe(0)
    step(resumed + 200, 0)
    const pausedAngle = round.motion.angle
    step(resumed + 1700, 0)
    expect(round.playedMs).toBeCloseTo(frozen + 200, 8)
    expect(round.motion.angle).toBe(pausedAngle)
    step(resumed + 1700)

    const due = resumed + 1500 + playTimeAtTurn(35) - playTimeAtTurn(34)
    step(due - 270)
    expect(jump(due - 270)).toBe(true)
    expect(step(due - 1)).toBeUndefined()
    expect(step(due)).toMatchObject({ number: 35, kind: 'perfect' })
    expect(step(due)).toBeUndefined()
    resetPreviewRound(round)
    expect(round.playedMs).toBe(0)
    expect(round.motion.angle).toBe(0)
  })

  it('prioritizes time expiry over an accelerated passage at the same instant', () => {
    const speed = 60 * slope / -Math.log(0.8)
    const { round, step, jump } = startRound(speed)
    for (let turn = 1; turn < 60; turn++) {
      const at = startAt + playTimeAtTurn(turn, speed)
      step(at - 270)
      expect(jump(at - 270)).toBe(true)
      expect(step(at)?.kind).toBe('perfect')
    }
    step(startAt + 60000 - 270)
    expect(jump(startAt + 60000 - 270)).toBe(true)
    expect(step(startAt + 62000)).toBeUndefined()
    expect(round.endReason).toBe('time')
    expect(round.stats).toMatchObject({ score: 8850, chances: 3, lastPassNumber: 59 })
  })

  it('supports consecutive jumps and lets success poses settle in the last, fastest turns', () => {
    const { round, step, jump } = startRound()
    let previousInput = startAt
    for (let turn = 1; turn <= 66; turn++) {
      const at = startAt + playTimeAtTurn(turn)
      const leadMs = turn === 65 ? 350 : turn === 66 ? 25 : 270
      const input = at - leadMs
      if (turn === 64) {
        step(previousInput + 514)
        expect(jump(previousInput + 514)).toBe(false)
        step(previousInput + 515)
        expect(round.motion.frame.phase).toBe('recover')
        expect(requestRoundJump({ ...round, motion: { ...round.motion } }, previousInput + 515, 0.6, 0.4)).toBe(true)
        step(previousInput + 579)
        expect(round.motion.frame.phase).toBe('recover')
        step(previousInput + 580)
        expect(round.motion.frame.phase).toBe('ready')
      }
      step(input)
      expect(jump(input)).toBe(true)
      previousInput = input
      expect(step(at)?.kind).toBe(turn < 65 ? 'perfect' : turn === 65 ? 'good' : 'miss')
      if (turn >= 60 && turn < 65) {
        const cue = round.successCue!
        const nextPass = startAt + playTimeAtTurn(turn + 1)
        expect(cue.kind).toBe('combo10')
        expect(nextPass - at).toBeLessThan(820)
        expect(cue.durationMs).toBeGreaterThanOrEqual(720)
        expect(isSuccessActive(cue, nextPass - 40)).toBe(false)
      }
    }
    expect(round.stats).toMatchObject({ score: 9700, chances: 2, combo: 0, lastPassNumber: 66 })
  })
})
