import { expect, it } from 'vitest'
import { CameraReturn, cameraScope, type RoamingView } from '../../src/world/cameraReturn'

const original = (): RoamingView => ({ perspective: 'first-person', controls: { yaw: 1.2, pitch: .3, distance: 8.5 }, mouseLook: true })
it('preserves the outer roaming choice through nested temporary views and waits for approval', () => {
  const state = new CameraReturn(), view = original()
  state.remember('a', view)
  view.controls.yaw = 9
  state.remember('a', { perspective: 'third-person', controls: { yaw: -2, pitch: 0, distance: 3 }, mouseLook: false })
  expect(state.finish('a', true)).toBeNull()
  expect(state.finish('a', false)).toEqual(original())
  expect(state.finish('a', false)).toBeNull()
})
it('never transfers an old visit to a new account or channel', () => {
  const state = new CameraReturn()
  state.remember(cameraScope('a', 'room-1'), original())
  expect(state.finish(cameraScope('a', 'room-2'), false)).toBeNull()
  expect(state.finish(cameraScope('a', 'room-1'), false)).toBeNull()
  expect(cameraScope('a/b', 'c')).not.toBe(cameraScope('a', 'b/c'))
})
it('keeps perspective and orbit restoration after explicit mouse unlock or window loss', () => {
  const state = new CameraReturn()
  state.remember('a', original()); state.cancelMouseLook()
  expect(state.finish('a', false)).toEqual({ ...original(), mouseLook: false })
  state.remember('a', original()); state.reset()
  expect(state.finish('a', false)).toBeNull()
})
