import * as THREE from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ hit: vi.fn(), activate: vi.fn(), hover: vi.fn(),
  avatar: { current: { x: 0, y: 0, z: 0 }, swimming: false },
  display: { x: 10, y: .8, z: 20, yaw: 0 },
}))
vi.mock('../../src/network/worldClient', () => ({
  avatars: new Map([['peer', harness.avatar]]),
  sampleAvatar: (_avatar: unknown, _now: number, pose: object) => Object.assign(pose, harness.display),
  useSession: { getState: () => ({ sessionId: 'peer', roomId: 'park', mapVersion: 'map', status: 'connected', mapCompatible: true }), subscribe: () => () => {} },
}))
vi.mock('../../src/park/runtime/runtime', () => ({ parkRuntime: { move: vi.fn(), stopMovement: vi.fn() } }))
vi.mock('../../src/network/localMovementPrediction', () => ({ localMovement: { positionMode: false } }))
vi.mock('../../src/world/roamingCamera', () => ({ canControlRoamingCamera: () => true }))
vi.mock('../../src/world/inputOwnership', () => ({ clearRoamingInput: vi.fn() }))
vi.mock('../../src/world/cameraPerspective', () => ({ viewControls: { yaw: 0 } }))
vi.mock('../../src/features/jumpmap/JumpmapXRPanel', () => ({ JumpmapXRPanel: class {
  blocking = true; key = 'guide'
  hit = harness.hit; activate = harness.activate; setHover = harness.hover
  update() {} reset() {} setVisible() {} recenter() {} toggleGuide() {} primary() {} dispose() {}
} }))

import { ParkXRController } from '../../src/features/parkXR/ParkXRController'
import { parkXRView } from '../../src/world/xrView'
import { START } from '../../src/features/jumpmap/course'
import { useJumpmap } from '../../src/features/jumpmap/state'
import { useParkXR } from '../../src/features/parkXR/state'
import { jumpmapXRFeedback } from '../../src/features/jumpmap/xrFeedback'

beforeEach(() => {
  vi.clearAllMocks()
  useJumpmap.setState({ available: true })
  useParkXR.setState({ mode: 'jumpmap' })
  harness.avatar.current = { x: START.x, y: START.y + .8, z: START.z }
  harness.avatar.swimming = false
  Object.assign(harness.display, { x: 10, y: .8, z: 20, yaw: 0 })
})
afterEach(() => { parkXRView.active = false; vi.unstubAllGlobals() })

it('양손 레이저가 반복 프레임의 벡터를 재사용하고 올바른 월드 좌표와 오른손 선택을 유지한다', () => {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} })
  const source = (handedness: 'left' | 'right') => ({ handedness, targetRayMode: 'tracked-pointer',
    targetRaySpace: { handedness }, gamepad: { mapping: 'xr-standard', axes: [0, 0, 0, 0], buttons: [{ pressed: false }] } })
  const left = source('left'), right = source('right')
  const session = { visibilityState: 'visible', inputSources: [left, right],
    removeEventListener: vi.fn(), end: vi.fn(async () => {}) }
  const gl = { xr: { getControllerGrip: () => new THREE.Group(), getController: () => new THREE.Group(), getReferenceSpace: () => ({}) } }
  const controller = new ParkXRController(gl as unknown as THREE.WebGLRenderer, new THREE.PerspectiveCamera(), new THREE.Scene())
  Reflect.set(controller, 'session', session)
  Reflect.set(controller, 'scope', 'peer|park|map')
  parkXRView.active = true
  const orientation = { x: 0, y: 0, z: 0, w: 1 }
  const frame = { getViewerPose: () => ({ transform: { position: { x: 0, y: 1.6, z: 0 }, orientation } }),
    getPose: (space: { handedness: string }) => ({ transform: { orientation,
      position: space.handedness === 'left' ? { x: -.2, y: 1.1, z: -.3 } : { x: .2, y: 1.2, z: -.4 } } }) }
  const samples: { origin: THREE.Vector3; direction: THREE.Vector3; point: number[]; aim: number[] }[] = []
  harness.hit.mockImplementation((origin: THREE.Vector3, direction: THREE.Vector3) => {
    samples.push({ origin, direction, point: origin.toArray(), aim: direction.toArray() })
    return origin.x < 10 ? 'continue' : 'ranking'
  })
  try {
    for (let i = 0; i < 120; i++) controller.update(frame as unknown as XRFrame)

    expect(samples).toHaveLength(240)
    expect(samples.every(s => s.origin === samples[0]!.origin && s.direction === samples[0]!.direction)).toBe(true)
    expect(samples[0]!.point).toEqual([9.8, 1.1, 19.7])
    expect(samples[1]!.point).toEqual([10.2, 1.2, 19.6])
    expect(samples.every(s => s.aim[0] === 0 && s.aim[1] === 0 && s.aim[2] === -1)).toBe(true)
    expect(harness.activate).not.toHaveBeenCalled()
    right.gamepad.buttons[0]!.pressed = true
    controller.update(frame as unknown as XRFrame)
    controller.update(frame as unknown as XRFrame)
    expect(harness.activate).toHaveBeenCalledExactlyOnceWith('ranking')
    expect(harness.hover).toHaveBeenLastCalledWith('ranking')
  } finally { controller.dispose() }
})

function jumpmapSession() {
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} })
  const session = { visibilityState: 'visible', inputSources: [], removeEventListener: vi.fn(), end: vi.fn(async () => {}) }
  const gl = { xr: { getControllerGrip: () => new THREE.Group(), getController: () => new THREE.Group(), getReferenceSpace: () => ({}) } }
  const controller = new ParkXRController(gl as unknown as THREE.WebGLRenderer, new THREE.PerspectiveCamera(), new THREE.Scene())
  Reflect.set(controller, 'session', session); Reflect.set(controller, 'scope', 'peer|park|map'); Reflect.set(controller, 'kind', 'jumpmap')
  parkXRView.active = true
  let tracked = true
  const frame = { getViewerPose: () => tracked ? { transform: {
    position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 },
  } } : null }
  const now = vi.spyOn(performance, 'now')
  return { session, controller, track: (value: boolean) => { tracked = value },
    update: (at: number) => { now.mockReturnValue(at); controller.update(frame as unknown as XRFrame) } }
}
const outside = () => { harness.avatar.current = { x: -150, y: .8, z: -150 } }
const inside = () => { harness.avatar.current = { x: START.x, y: START.y + .8, z: START.z } }

it('서버 위치로 피드백 모드만 전환하고 표시 예측이나 장시간 구역 이탈로 VR을 종료하지 않는다', () => {
  const s = jumpmapSession()
  try {
    Object.assign(harness.display, { x: -150, y: .8, z: -150 })
    s.update(0); s.update(1000)
    expect(useParkXR.getState().mode).toBe('jumpmap')
    expect(s.session.end).not.toHaveBeenCalled()
    Object.assign(harness.display, harness.avatar.current)
    outside(); s.update(1100); s.update(1599)
    expect(s.session.end).not.toHaveBeenCalled()
    s.update(1600); s.update(10000)
    expect(useParkXR.getState().mode).toBe('park')
    expect(jumpmapXRFeedback.active).toBe(false)
    expect(s.session.end).not.toHaveBeenCalled()
  } finally { s.controller.dispose() }
})

it('공원과 출발점을 왕복해도 같은 세션을 유지하며 점프 피드백을 다시 연결한다', () => {
  const s = jumpmapSession()
  try {
    outside(); s.update(0); s.update(400)
    inside(); s.update(450)
    expect(useParkXR.getState().mode).toBe('jumpmap')
    expect(jumpmapXRFeedback.active).toBe(true)
    outside(); s.update(600); s.update(1099)
    expect(s.session.end).not.toHaveBeenCalled()
    s.update(1100)
    expect(s.session.end).not.toHaveBeenCalled()
    expect(useParkXR.getState().mode).toBe('park')
  } finally { s.controller.dispose() }
})

it('구역 밖에서 추적이 중단됐다가 복구되어도 세션을 종료하지 않는다', () => {
  const s = jumpmapSession()
  try {
    outside(); s.update(0); s.update(400)
    s.track(false); s.update(450)
    s.track(true); s.update(2000); s.update(2499)
    expect(s.session.end).not.toHaveBeenCalled()
    s.update(2500)
    expect(s.session.end).not.toHaveBeenCalled()
  } finally { s.controller.dispose() }
})

it('서버 낙수는 VR을 유지하고 전용 점프 피드백만 중단한다', () => {
  const s = jumpmapSession()
  try {
    s.update(0)
    harness.avatar.swimming = true
    s.update(1)
    expect(s.session.end).not.toHaveBeenCalled()
    expect(useParkXR.getState().mode).toBe('park')
    expect(jumpmapXRFeedback.active).toBe(false)
  } finally { s.controller.dispose() }
})
