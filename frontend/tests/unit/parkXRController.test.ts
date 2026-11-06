import * as THREE from 'three'
import { afterEach, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ hit: vi.fn(), activate: vi.fn(), hover: vi.fn() }))
vi.mock('../../src/network/worldClient', () => ({
  avatars: new Map([['peer', {}]]),
  sampleAvatar: (_avatar: unknown, _now: number, pose: object) => Object.assign(pose, { x: 10, y: .8, z: 20, yaw: 0 }),
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
