import { describe, expect, it } from 'vitest'
import fixture from '../../../backend/src/test/resources/jump-rope/rules-v1.json'
import { createPreviewRound, advancePreviewRound, requestRoundJump, resetPreviewRound } from '../../src/jump-rope-preview/previewRound'
import { rankedPassageUs } from '../../src/jump-rope-preview/previewMotion'
import { defaultRopeAcceleration } from '../../src/jump-rope-preview/ropeAcceleration'

const settings = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const startAt = 3123

function play() {
  const round = createPreviewRound('menu')
  resetPreviewRound(round, 'initialCountdown', startAt)
  let now = startAt - 1000
  function step(at: number) {
    now = at
    return advancePreviewRound(round, now, 1, settings, 1350, defaultRopeAcceleration)
  }
  function advanceActive(us: number) {
    const clock = round.ranked!
    return step(clock.segmentAt + (us - clock.segmentUs) / 1000)
  }
  function jumpAt(us: number) {
    advanceActive(us)
    return requestRoundJump(round, now, 0.6, 0.4)
  }
  function resume() {
    if (round.phase.kind === 'landing') step(now + 600)
    if (round.phase.kind === 'reaction') step(now + 1350)
  }
  return { round, step, advanceActive, jumpAt, resume }
}

describe('Story 409 ranked play clock', () => {
  it('uses the supplied countdown deadline even if the first animation frame is late', () => {
    const game = play()
    game.step(startAt - 1)
    expect(requestRoundJump(game.round, startAt - 1, 0.6, 0.4)).toBe(false)
    game.step(startAt + 125)
    expect(game.round.playedMs).toBe(125)
    expect(game.jumpAt(728335)).toBe(true)
    expect(game.advanceActive(998335)).toMatchObject({ kind: 'perfect', earnedPoints: 15 })
  })

  it('matches every passage and judgement boundary from the backend fixture', () => {
    expect(fixture.passagesUs.map((_, index) => rankedPassageUs(index + 1))).toEqual(fixture.passagesUs)
    for (const { leadUs, kind } of fixture.judgements) {
      const game = play()
      game.step(startAt)
      game.jumpAt(rankedPassageUs(1) - leadUs)
      expect(game.advanceActive(rankedPassageUs(1))?.kind.toUpperCase()).toBe(kind)
    }
  })

  it('submits only accepted inputs and excludes landing and MISS reaction from the replay offsets', () => {
    for (const expected of fixture.rounds) {
      const game = play()
      game.step(startAt)
      let input = 0
      for (const passage of fixture.passagesUs) {
        while (input < expected.offsets.length && expected.offsets[input]! < passage) {
          expect(game.jumpAt(expected.offsets[input++]!)).toBe(true)
        }
        const result = game.advanceActive(passage)
        if (game.round.endReason) break
        if (result?.kind === 'miss') {
          const stopped = game.round.playedMs
          expect(requestRoundJump(game.round, startAt + passage / 1000 + 1, 0.6, 0.4)).toBe(false)
          game.resume()
          expect(game.round.playedMs).toBe(stopped)
          expect(game.jumpAt(passage)).toBe(false)
        }
      }
      expect(game.round.endReason).toBe('missLimit')
      expect(game.round.ranked?.offsets).toEqual(expected.offsets)
      expect(game.round.stats).toMatchObject({ score: expected.score, counts: { perfect: expected.perfect, good: expected.good, miss: expected.miss } })
    }
  })

  it('matches a 60-second perfect run and never accepts input at the quantized deadline', () => {
    const game = play()
    game.step(startAt)
    for (const passage of fixture.passagesUs.slice(0, 66)) {
      expect(game.jumpAt(passage - 270000)).toBe(true)
      game.advanceActive(passage)
    }
    expect(game.jumpAt(59_999_999)).toBe(true)
    game.step(startAt + 59_999.9996)
    expect(requestRoundJump(game.round, startAt + 59_999.9996, 0.6, 0.4)).toBe(false)
    game.step(startAt + 60_000)
    expect(game.round.endReason).toBe('time')
    expect(game.round.stats).toMatchObject({ score: 1965, counts: { perfect: 66, good: 0, miss: 0 } })
  })
})
