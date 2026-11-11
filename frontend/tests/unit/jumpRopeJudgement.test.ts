import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { ropeCenter } from '../../src/jump-rope-preview/gameRopeGeometry'
import { advanceRope, judgePass } from '../../src/jump-rope-preview/jumpRopeJudgement'
import { advancePreviewMotion, createPreviewMotion, requestJump } from '../../src/jump-rope-preview/previewMotion'

const rules = { ropeWidth: 0.035, clearanceMargin: 0.03, perfectWindowMs: 50 }
const flight = { flightMs: 400, peak: 0.6 }

describe('jump rope passes', () => {
  it.each([
    ['peak', 730, 'perfect'],
    ['slightly early', 660, 'good'],
    ['slightly late', 800, 'good'],
    ['no jump', null, 'miss'],
    ['already landed', 500, 'miss'],
    ['not airborne yet', 950, 'miss'],
    ['after the pass', 1020, 'miss'],
  ] as const)('grades %s at the foot crossing', (_, startedAt, expected) => {
    expect(judgePass(1000, startedAt === null ? null : { ...flight, startedAt }, rules).kind).toBe(expected)
  })

  it('requires clearance before awarding a timing grade', () => {
    const lowJump = judgePass(1000, { ...flight, startedAt: 730, peak: 0.05 }, rules)
    expect(lowJump).toMatchObject({ kind: 'miss', inputLeadMs: 270, footHeight: 0.05, requiredHeight: 0.082 })
    const justAirborne = judgePass(1000, { ...flight, startedAt: 925 }, rules)
    expect(justAirborne.footHeight).toBeGreaterThan(0)
    expect(justAirborne.kind).toBe('miss')
  })

  it('crosses once at the rendered bottom, even across several dropped turns', () => {
    const point = new Vector3()
    const radius = rules.ropeWidth / 2
    const sample = (angle: number) => ropeCenter(point, angle, 0, 0.3, 1, 0.7, 0.12, radius)
    expect(sample(0).y + radius + rules.clearanceMargin).toBeCloseTo(0.082)
    expect(sample(0).z).toBeCloseTo(0.3)
    expect(sample(Math.PI).y).toBeGreaterThan(1.8)
    const half = advanceRope(0, 0, 500, 1)
    expect(half.passages).toEqual([])
    expect(advanceRope(half.angle, 500, 3100, 1).passages).toEqual([1000, 2000, 3000])
  })

  it('produces the same grades with 30 FPS, 144 FPS and delayed frames', () => {
    function run(frameMs: number) {
      const motion = createPreviewMotion()
      const inputs = [730, 1660, 3020, 4500]
      const results: ReturnType<typeof advancePreviewMotion> = []
      for (let at = 0; at < 5000; at += frameMs) {
        while (inputs[0] !== undefined && inputs[0] <= at) {
          const now = inputs.shift()!
          results.push(...advancePreviewMotion(motion, now, 1, rules))
          expect(requestJump(motion, now, 0.6, 0.4)).toBe(true)
          expect(requestJump(motion, now + 1, 0.6, 0.4)).toBe(false)
        }
        results.push(...advancePreviewMotion(motion, at, 1, rules))
      }
      results.push(...advancePreviewMotion(motion, 5000, 1, rules))
      return results.map(pass => [pass.number, Math.round(pass.at), pass.kind])
    }

    const expected = [[1, 1000, 'perfect'], [2, 2000, 'good'], [3, 3000, 'miss'], [4, 4000, 'miss'], [5, 5000, 'miss']]
    for (const frameMs of [1000 / 30, 1000 / 144, 4900]) expect(run(frameMs)).toEqual(expected)
  })

  it('freezes rope time on pause and judges once after resuming', () => {
    const motion = createPreviewMotion()
    advancePreviewMotion(motion, 0, 1, rules)
    expect(advancePreviewMotion(motion, 980, 0, rules)).toEqual([])
    const pausedAngle = motion.angle
    expect(advancePreviewMotion(motion, 3000, 1, rules)).toEqual([])
    expect(motion.angle).toBe(pausedAngle)
    expect(advancePreviewMotion(motion, 3019, 1, rules)).toEqual([])
    expect(advancePreviewMotion(motion, 3020, 1, rules)).toMatchObject([{ number: 1, kind: 'miss' }])
    expect(advancePreviewMotion(motion, 3020, 1, rules)).toEqual([])
  })
})
