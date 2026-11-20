import { beforeEach, describe, expect, it } from 'vitest'
import { Group } from 'three'
import { acceptSnowball, acceptSnowballWindup, acceptWinterState, resetWinter, useWinter, winterMotion } from '../../src/features/winter/state'
import { parseSnowballAim, snowballPoint } from '../../src/features/winter/trajectory'
import { poseWinterAvatar } from '../../src/features/winter/avatarPose'

const now = Date.parse('2026-11-20T01:00:00Z')
const player = { userId: 'self', snowballs: 0, hits: 0, freezeId: '', frozenUntil: null, escapePresses: 0 }
const aim = { channelId: 'park', userId: 'self', yaw: 0, x: 0, y: 1.2, z: 0, endX: 0, endY: 1.2, endZ: 16, distance: 16, hitUserId: '' }
describe('눈덩이 동작과 조준', () => {
  beforeEach(resetWinter)
  it('기존 소지량 복구는 재생하지 않고 승인된 0→1 변화에만 줍고 뭉치는 동작을 재생한다', () => {
    acceptWinterState({ channelId: 'park', version: 1, players: [{ ...player, snowballs: 1 }] }, 'park', now)
    expect(winterMotion('self', now)).toBeNull()
    acceptWinterState({ channelId: 'park', version: 2, players: [player] }, 'park', now)
    acceptWinterState({ channelId: 'park', version: 3, players: [{ ...player, snowballs: 1 }] }, 'park', now)
    expect(winterMotion('self', now)?.kind).toBe('gather')
    expect(winterMotion('self', now + 800)).toBeNull()
  })
  it('같은 채널의 준비 동작 뒤 실발사 동작으로 전환하고 동결·초기화 때 정리한다', () => {
    acceptWinterState({ channelId: 'park', version: 1, players: [{ ...player, snowballs: 1 }] }, 'park', now)
    const windup = { motionId: 'prepare', channelId: 'park', userId: 'self', yaw: 0, startedAt: new Date(now).toISOString(), durationMs: 300 }
    acceptSnowballWindup(windup, 'other', now)
    expect(winterMotion('self', now)).toBeNull()
    acceptSnowballWindup(windup, 'park', now)
    expect(winterMotion('self', now)?.kind).toBe('windup')
    acceptSnowball({ ...aim, shotId: 'shot', sentAt: new Date(now + 300).toISOString(), durationMs: 727 }, 'park', 'self', now + 300)
    expect(winterMotion('self', now + 300)?.kind).toBe('throw')
    acceptSnowballWindup(windup, 'park', now + 310)
    expect(winterMotion('self', now + 310)?.kind).toBe('throw')
    acceptWinterState({ channelId: 'park', version: 2, players: [{ ...player, hits: 3, freezeId: 'ice', frozenUntil: new Date(now + 5000).toISOString() }] }, 'park', now)
    expect(winterMotion('self', now)).toBeNull()
    resetWinter(); expect(useWinter.getState().motions).toEqual({})
  })
  it('손에서 출발해 서버 궤적과 같은 목표점·낮아진 포물선으로 연결한다', () => {
    const hand = { x: -.3, y: 1.5, z: .2 }
    expect(snowballPoint(aim, 0, hand)).toEqual(hand)
    expect(snowballPoint(aim, .5, hand)).toEqual({ x: 0, y: 1.75, z: 8 })
    expect(snowballPoint(aim, 1, hand).x).toBeCloseTo(aim.endX)
    expect(snowballPoint(aim, 1, hand).y).toBeCloseTo(aim.endY)
    expect(snowballPoint(aim, 1, hand).z).toBeCloseTo(aim.endZ)
    expect(parseSnowballAim(aim, 'park', 'self')).toEqual(aim)
    expect(parseSnowballAim(aim, 'other', 'self')).toBeNull()
    expect(parseSnowballAim({ ...aim, endZ: 90 }, 'park', 'self')).toBeNull()
  })
  it('오른손을 들어 던지고 이동 중에는 다리 자세를 덮어쓰지 않는다', () => {
    acceptWinterState({ channelId: 'park', version: 1, players: [player] }, 'park', now)
    acceptWinterState({ channelId: 'park', version: 2, players: [{ ...player, snowballs: 1 }] }, 'park', now)
    const hands: Record<string, number[]> = {}, joints: string[] = []
    const model = { reachFitnessHand: (side: string, ...p: number[]) => { hands[side] = p }, handPose: () => {}, set: (joint: string) => { joints.push(joint) } }
    poseWinterAvatar(model as never, new Group(), 'self', now + 100, 0, true)
    expect(joints.some(j => /Leg/.test(j))).toBe(false)
    acceptSnowballWindup({ motionId: 'prepare', channelId: 'park', userId: 'self', yaw: 0, startedAt: new Date(now).toISOString(), durationMs: 300 }, 'park', now)
    poseWinterAvatar(model as never, new Group(), 'self', now + 280, 0, false)
    expect(hands.R![0]).toBeLessThan(0)
    expect(hands.R![1]).toBeGreaterThan(hands.L![1]!)
    expect(hands.R![2]).toBeLessThan(hands.L![2]!)
  })
})
