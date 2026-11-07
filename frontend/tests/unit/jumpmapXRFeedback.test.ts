import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AvatarSnapshot } from '../../src/network/worldClient'
import { COURSE, START } from '../../src/features/jumpmap/course'

const sound = vi.hoisted(() => ({ output: { context: {} }, enabled: true,
  motion: vi.fn(), landing: vi.fn(), preload: vi.fn() }))
vi.mock('../../src/audio/bgm', () => ({ effectsOutput: () => sound.enabled ? sound.output : null }))
vi.mock('../../src/features/jumpmap/audio', () => ({
  playJumpMotionSound: sound.motion, playJumpSound: sound.landing, preloadJumpMotionSounds: sound.preload,
}))
import { JumpmapXRFeedback } from '../../src/features/jumpmap/xrFeedback'

const pad = COURSE[0]!
const avatar = (y = pad.top + .8, at = 0, x = pad.x, z = pad.z) => ({
  current: { x, y, z, yaw: 0 }, at, connected: true, moving: false, running: false,
  swimming: false, tableId: '', benchId: '', fitnessId: '', telescopeId: '', carry: null,
}) as AvatarSnapshot
function setup(actuator: object = { pulse: vi.fn(async () => true), reset: vi.fn(async () => 'complete') }) {
  const sources = ['left', 'right'].map(handedness => ({ handedness,
    gamepad: { mapping: 'xr-standard', hapticActuators: [actuator] } }))
  const session = { inputSources: sources } as unknown as XRSession
  const feedback = new JumpmapXRFeedback(); feedback.start(session)
  return { feedback, session, sources, actuator: actuator as { pulse: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> },
    sample: (y: number, at: number, allowed = true, x = pad.x, z = pad.z) => feedback.update(avatar(y, at, x, z), allowed) }
}
const feedbacks: JumpmapXRFeedback[] = []
const track = () => { const s = setup(); feedbacks.push(s.feedback); return s }
beforeEach(() => { vi.clearAllMocks(); sound.enabled = true })
afterEach(() => { for (const feedback of feedbacks.splice(0)) feedback.stop() })

describe('돌탑 VR 도약·착지 피드백', () => {
  it('잠깐 멈춘 뒤 A를 눌러도 실제 상승 때 도약하며 거절·만료 입력은 소리를 내지 않는다', () => {
    const s = track(), y = pad.top + .8
    let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now)
    s.sample(y, 0); s.feedback.requestJump(); s.sample(y, 100)
    expect(sound.motion).not.toHaveBeenCalled()
    now = 300; s.sample(y + .7, 300)
    expect(sound.motion).toHaveBeenCalledTimes(1)
    s.sample(y + .3, 400); s.sample(y, 500)
    s.feedback.requestJump(); now = 1000; s.sample(y + .05, 1100)
    expect(sound.motion).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })
  it('서버 도약에만 약한 양손 진동과 점프음을 한 번 주고 같은 스냅샷은 반복하지 않는다', () => {
    const s = track(), y = pad.top + .8
    s.sample(y, 0); expect(s.actuator.pulse).not.toHaveBeenCalled()
    s.sample(y + .62, 100); s.sample(y + .62, 100)
    expect(s.actuator.pulse).toHaveBeenCalledTimes(2)
    expect(s.actuator.pulse).toHaveBeenCalledWith(.16, 40)
    expect(sound.motion).toHaveBeenCalledExactlyOnceWith('jump', expect.objectContaining({ output: sound.output }))
    expect(sound.preload).toHaveBeenCalledTimes(1)
  })
  it('정지한 채 같은 발판에 내려와도 첫 접촉에 한 번 착지음을 주고 다음 점프를 구분한다', () => {
    const s = track(), y = pad.top + .8
    s.sample(y, 0); s.sample(y + .62, 100); s.sample(y + .32, 200); s.sample(y, 300)
    s.sample(y, 300); s.sample(y, 400)
    expect(sound.landing).toHaveBeenCalledTimes(1)
    expect(sound.landing.mock.calls[0]![0]).toMatchObject({ kind: 'land', pad: { theme: pad.theme } })
    const [strength, duration] = s.actuator.pulse.mock.calls.at(-1)!
    expect(strength).toBeGreaterThan(.16); expect(strength).toBeLessThanOrEqual(.4)
    expect(duration).toBeGreaterThan(40); expect(duration).toBeLessThanOrEqual(90)
    s.sample(y + .62, 500); s.sample(y + .32, 600); s.sample(y, 700)
    expect(sound.landing).toHaveBeenCalledTimes(2)
    expect(sound.motion).toHaveBeenCalledTimes(2)
  })
  it('공중에서 하강이 잠깐 느려져도 착지로 취급하지 않는다', () => {
    const s = track(), y = pad.top + .8
    s.sample(y, 0); s.sample(y + .62, 100); s.sample(y + 1.8, 200)
    s.sample(y + 1, 300); s.sample(y + .99, 400)
    expect(sound.landing).not.toHaveBeenCalled()
    s.sample(y + .4, 500); s.sample(y, 600)
    expect(sound.landing).toHaveBeenCalledTimes(1)
  })
  it.each(['안내판', '추적 중단'])('%s 동안 정지하고 복귀 때 과거 도약·착지를 재생하지 않는다', () => {
    const s = track(), y = pad.top + .8
    s.sample(y, 0); s.sample(y + .62, 100)
    const signal = sound.motion.mock.calls[0]![1].signal as AbortSignal
    s.sample(y + .3, 200, false)
    expect(signal.aborted).toBe(true); expect(s.actuator.reset).toHaveBeenCalled()
    s.sample(y, 300); s.sample(y, 400)
    expect(sound.landing).not.toHaveBeenCalled()
    expect(sound.motion).toHaveBeenCalledTimes(1)
  })
  it('세션 종료·재시작은 진동과 지연 소리를 취소하고 새 착지를 만들지 않는다', () => {
    const s = track(), y = pad.top + .8
    s.sample(y, 0); s.sample(y + .62, 100)
    const signal = sound.motion.mock.calls[0]![1].signal as AbortSignal
    s.feedback.stop(); expect(s.feedback.active).toBe(false)
    expect(signal.aborted).toBe(true); expect(s.actuator.reset).toHaveBeenCalled()
    s.sample(y, 200); expect(sound.landing).not.toHaveBeenCalled()
    s.feedback.start(s.session); s.sample(y, 300)
    expect(sound.landing).not.toHaveBeenCalled()
  })
  it('출발 자리의 바닥 점프는 기존 도약·착지 클립으로 피드백한다', () => {
    const s = track(), sample = (dy: number, at: number) => s.sample(.8 + dy, at, true, START.x, START.z)
    sample(0, 0); sample(.62, 100); sample(.3, 200); sample(0, 300)
    expect(sound.motion.mock.calls.map(c => c[0])).toEqual(['jump', 'land'])
    expect(sound.landing).not.toHaveBeenCalled()
  })
  it('큰 좌표 보정과 낙수는 진동·착지음으로 바꾸지 않는다', () => {
    const s = track(), y = pad.top + .8
    s.sample(y, 0); s.sample(y + 20, 100); s.sample(y, 200)
    s.feedback.update({ ...avatar(y + .62, 300), swimming: true }, true)
    expect(sound.motion).not.toHaveBeenCalled(); expect(sound.landing).not.toHaveBeenCalled()
    expect(s.actuator.pulse).not.toHaveBeenCalled()
  })
  it('지원하지 않는 기기에서도 소리는 유지하고 음소거와 진동은 독립적이다', () => {
    const s = setup({}); feedbacks.push(s.feedback)
    const y = pad.top + .8
    s.sample(y, 0); s.sample(y + .62, 100)
    expect(sound.motion).toHaveBeenCalledTimes(1)
    sound.enabled = false
    const supported = track(); supported.sample(y, 0); supported.sample(y + .62, 100)
    expect(supported.actuator.pulse).toHaveBeenCalledTimes(2)
    expect(sound.motion).toHaveBeenCalledTimes(1)
  })
  it.each(['throw', 'reject'])('진동 장치의 %s 오류가 게임 루프로 전파되지 않는다', async mode => {
    const pulse = vi.fn(() => { if (mode === 'throw') throw new Error('disconnected'); return Promise.reject(new Error('unsupported')) })
    const s = setup({ pulse }); feedbacks.push(s.feedback)
    const y = pad.top + .8
    expect(() => { s.sample(y, 0); s.sample(y + .62, 100); s.feedback.stop() }).not.toThrow()
    await Promise.resolve()
  })
  it('레거시 pulse가 없는 장치는 dual-rumble을 사용하고 종료 때 reset한다', () => {
    const playEffect = vi.fn(async () => 'complete'), reset = vi.fn(async () => 'complete')
    const feedback = new JumpmapXRFeedback(); feedbacks.push(feedback)
    feedback.start({ inputSources: [{ handedness: 'right', gamepad: { mapping: 'xr-standard', vibrationActuator: { playEffect, reset } } }] } as unknown as XRSession)
    const y = pad.top + .8; feedback.update(avatar(y, 0), true); feedback.update(avatar(y + .62, 100), true)
    expect(playEffect).toHaveBeenCalledExactlyOnceWith('dual-rumble', expect.objectContaining({ duration: 40, strongMagnitude: .16 }))
    feedback.stop(); expect(reset).toHaveBeenCalledTimes(1)
  })
})
