import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { receive, resetWorld, useSession } from '../../src/network/worldClient'
import { inputState, panelOwnsKeys } from '../../src/world/inputOwnership'
import { flightCaption, welcomeFlight, welcomeFlightPose } from '../../src/features/welcomeTour/flight'
import { requestWelcomeTour, takeWelcomeTour } from '../../src/features/welcomeTour/pending'
import {
  beginWelcomeFlight, endWelcomeTour, finishWelcomeFlight, noteTourAction, noteTourWalk,
  replayWelcomeTour, tourBlockReason, useWelcomeTour,
} from '../../src/features/welcomeTour/state'
import { completeStep, currentStep, stepForAction, TOUR_STEPS, TOUR_WALK_GOAL, walkedDistance } from '../../src/features/welcomeTour/steps'

const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
beforeEach(() => {
  resetWorld()
  for (const key of Object.keys(inputState) as (keyof typeof inputState)[]) inputState[key] = false
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'] })
  emit('WORLD_STATE', { channelId: 'a', version: 1, mapVersion: EXPECTED_MAP_VERSION, avatars: [{ userId: '101',
    position: { x: 0, y: 0.8, z: 0, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false } }] })
})
afterEach(() => { endWelcomeTour(); resetWorld() })

describe('공원 체험 투어 단계', () => {
  it('순서와 상관없이 해낸 단계를 체크하고 남은 첫 단계를 지금 할 일로 둔다', () => {
    let done = completeStep([], 'map')
    expect(currentStep(done)?.id).toBe('walk')
    done = completeStep(done, 'walk')
    expect(done).toEqual(['walk', 'map'])
    expect(currentStep(done)?.id).toBe('greet')
    expect(completeStep(done, 'walk')).toEqual(done)
    expect(currentStep(TOUR_STEPS.map(s => s.id))).toBeNull()
  })
  it('채팅과 이모트는 인사하기, 나머지 동작은 각자의 단계로 이어진다', () => {
    expect(stepForAction('chat')).toBe('greet')
    expect(stepForAction('emote')).toBe('greet')
    expect(stepForAction('navigate')).toBe('map')
    expect(stepForAction('minigame')).toBe('minigame')
    expect(stepForAction('table')).toBe('table')
  })
  it('순간 이동처럼 한 번에 크게 바뀐 좌표는 걸은 거리로 치지 않는다', () => {
    expect(walkedDistance({ x: 0, z: 0 }, { x: 0.6, z: 0.8 })).toBeCloseTo(1)
    expect(walkedDistance({ x: 0, z: 0 }, { x: 40, z: 0 })).toBe(0)
    expect(walkedDistance({ x: 0, z: 0 }, { x: NaN, z: 0 })).toBe(0)
  })
})

describe('환영 비행', () => {
  const end = { position: { x: 30, y: 4, z: -20 }, look: { x: 28, y: 1.5, z: -14 } }
  it('공원 상공에서 시작해 끝에서는 평소 3인칭 시점과 정확히 겹친다', () => {
    const start = welcomeFlightPose(0, end, 180)
    expect(start.position.y).toBeGreaterThan(100)
    expect(start.look).toEqual({ x: 0, y: 4, z: 0 })
    expect(welcomeFlightPose(1, end, 180)).toEqual(end)
    expect(welcomeFlightPose(2, end, 180)).toEqual(end)
    const heights = [0, .25, .5, .75, 1].map(t => welcomeFlightPose(t, end, 180).position.y)
    expect(heights).toEqual([...heights].sort((a, b) => b - a))
  })
  it('지나가는 장소 이름을 차례로 보여 준다', () => {
    expect([0, .4, .8].map(flightCaption)).toEqual(['중앙 게임마당', '붕어빵 카트', '호숫가 전망대'])
  })
  it('온보딩 직후 한 번만 시작하고, 비행 중에는 이동과 단축키를 막는다', () => {
    expect(takeWelcomeTour()).toBe(false)
    requestWelcomeTour()
    expect(takeWelcomeTour()).toBe(true)
    expect(takeWelcomeTour()).toBe(false)
    beginWelcomeFlight(false)
    expect(useWelcomeTour.getState().phase).toBe('flight')
    expect(welcomeFlight.active).toBe(true)
    expect(panelOwnsKeys()).toBe(true)
    expect(tourBlockReason()).toMatch(/환영 연출/)
    finishWelcomeFlight()
    expect(welcomeFlight.active).toBe(false)
    expect(panelOwnsKeys()).toBe(false)
    expect(useWelcomeTour.getState()).toMatchObject({ phase: 'tour', owner: '101', done: [] })
  })
  it('움직임 줄이기 설정이면 카메라는 움직이지 않고 같은 시간 동안 환영 카드만 보여 준다', () => {
    beginWelcomeFlight(true)
    expect(welcomeFlight.active).toBe(false)
    expect(inputState.welcomeFlight).toBe(true)
  })
})

describe('투어 진행과 다시 보기', () => {
  it('투어 중에만 동작을 세고, 다섯 단계를 마치면 완료 카드로 넘어간다', () => {
    noteTourAction('chat')
    expect(useWelcomeTour.getState().phase).toBe('idle')
    expect(replayWelcomeTour()).toBe(true)
    noteTourWalk(TOUR_WALK_GOAL / 2)
    expect(useWelcomeTour.getState()).toMatchObject({ done: [], walked: TOUR_WALK_GOAL / 2 })
    noteTourWalk(TOUR_WALK_GOAL / 2)
    for (const action of ['emote', 'navigate', 'minigame'] as const) noteTourAction(action)
    expect(useWelcomeTour.getState().phase).toBe('tour')
    noteTourAction('table')
    expect(useWelcomeTour.getState()).toMatchObject({ phase: 'finished', done: TOUR_STEPS.map(s => s.id) })
  })
  it('다시 보기는 비행 없이 1단계부터 시작하고, 테이블에 앉아 있거나 연결 전이면 막는다', () => {
    expect(replayWelcomeTour()).toBe(true)
    noteTourAction('chat')
    expect(replayWelcomeTour()).toBe(true)
    expect(useWelcomeTour.getState()).toMatchObject({ phase: 'tour', done: [] })
    expect(welcomeFlight.active).toBe(false)
    useSession.setState({ tableId: 'table-1' })
    expect(tourBlockReason()).toMatch(/테이블/)
    expect(replayWelcomeTour()).toBe(false)
    useSession.setState({ tableId: '', status: 'reconnecting' })
    expect(tourBlockReason()).toMatch(/연결/)
  })
  it('공원을 나가면 투어와 이동 잠금을 함께 정리한다', () => {
    beginWelcomeFlight(false)
    endWelcomeTour()
    expect(useWelcomeTour.getState().phase).toBe('idle')
    expect(inputState.welcomeFlight).toBe(false)
    expect(welcomeFlight.active).toBe(false)
  })
})
