/** Browser-only XR frame/session simulation. No production hooks or auth bypass. */
import { _roots, advance } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { JumpmapXRAction, JumpmapXRView } from '../../src/features/jumpmap/xrModel'
import { parkXRView } from '../../src/world/xrView'
import { useParkXR } from '../../src/features/parkXR/state'
import { avatars, sampleAvatar, useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'

let left: Gamepad, right: Gamepad, session: XRSession
let timer: ReturnType<typeof setInterval>
let targetAction: JumpmapXRAction | null = null
let tracked = true
const feedbackPulses: { hand: string; strength: number; duration: number }[] = []
let feedbackResets = 0
export const feedbackSnapshot = () => ({ pulses: [...feedbackPulses], resets: feedbackResets })
const root = () => _roots.get(document.querySelector('canvas')!)!.store.getState()
export function guideTexturePNG() {
  const mesh = root().scene.getObjectByName('jumpmap-xr-dialog') as import('three').Mesh<import('three').PlaneGeometry, import('three').MeshBasicMaterial>
  return (mesh.material.map!.image as HTMLCanvasElement).toDataURL('image/png')
}
export function sceneFramePNG() {
  const state = root()
  state.gl.render(state.scene, state.camera)
  return state.gl.domElement.toDataURL('image/png')
}
export function install(options: { haptics?: boolean } = {}) {
  const state = root()
  feedbackPulses.length = 0; feedbackResets = 0
  const pad = (hand: string) => ({ mapping: 'xr-standard', axes: [0, 0, 0, 0],
    hapticActuators: options.haptics ? [{ pulse: async (strength: number, duration: number) => {
      feedbackPulses.push({ hand, strength, duration }); return true
    }, reset: async () => { feedbackResets++; return 'complete' } }] : [],
    buttons: Array.from({ length: 6 }, () => ({ pressed: false, touched: false, value: 0 })) }) as unknown as Gamepad
  let current: XRSession | null = null
  // Exercise our bridge and the real park intent/socket path while keeping desktop WebGL rendering.
  state.gl.xr.setSession = async value => { current = value }
  state.gl.xr.getSession = () => current
  state.gl.xr.getReferenceSpace = () => ({}) as XRReferenceSpace
  navigator.xr!.requestSession = async () => {
    left = pad('left'); right = pad('right')
    session = Object.assign(new EventTarget(), { visibilityState: 'visible', inputSources: [
      { handedness: 'left', gamepad: left, targetRayMode: 'tracked-pointer', targetRaySpace: { hand: 'left' } },
      { handedness: 'right', gamepad: right, targetRayMode: 'tracked-pointer', targetRaySpace: { hand: 'right' } },
    ], end: async () => {
      clearInterval(timer); current = null
      session.dispatchEvent(new Event('end'))
      state.setFrameloop('always')
    } }) as unknown as XRSession
    state.setFrameloop('never')
    tracked = true; targetAction = null
    const frame = { getViewerPose: () => tracked ? ({ transform: {
      position: { x: .3, y: 1.65, z: -.2 }, orientation: { x: 0, y: 0, z: 0, w: 1 },
    } }) : null, getPose: () => {
      const { scene } = root(), rig = scene.getObjectByName('park-xr-rig')!
      const panel = scene.getObjectByName('jumpmap-xr-dialog')!
      const view = panel.parent!.userData.view as JumpmapXRView | undefined
      const index = view?.buttons.findIndex(b => b.id === targetAction) ?? -1
      const position = { x: .55, y: 1.35, z: -.45 }
      if (index < 0 || !view) return { transform: { position, orientation: new Quaternion() } }
      const count = view.buttons.length, width = (1536 - 112 - (count - 1) * 24) / count
      const pixelX = 56 + index * (width + 24) + width / 2
      const point = new Vector3((pixelX / 1536 - .5) * 1.38, (.5 - 866 / 1024) * .92, 0)
      panel.localToWorld(point); rig.worldToLocal(point)
      const direction = point.sub(new Vector3(position.x, position.y, position.z)).normalize()
      return { transform: { position, orientation: new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), direction) } }
    } } as unknown as XRFrame
    timer = setInterval(() => advance(root().clock.elapsedTime + .016, false, root(), frame), 32)
    return session
  }
}
export function input(forward: number, jump = false, turn = 0, exit = false) {
  (left.axes as number[])[3] = -forward
  ;(right.axes as number[])[2] = turn
  Object.assign(right.buttons[4]!, { pressed: jump, value: Number(jump) })
  Object.assign(right.buttons[5]!, { pressed: exit, value: Number(exit) })
}
export function visibility(value: XRVisibilityState) {
  Object.defineProperty(session, 'visibilityState', { configurable: true, value })
  session.dispatchEvent(new Event('visibilitychange'))
}
export function buttons({ run = false, guide = false, trigger = false }: { run?: boolean; guide?: boolean; trigger?: boolean }) {
  Object.assign(left.buttons[1]!, { pressed: run, value: Number(run) })
  Object.assign(left.buttons[4]!, { pressed: guide, value: Number(guide) })
  Object.assign(right.buttons[0]!, { pressed: trigger, value: Number(trigger) })
}
export function aim(action: JumpmapXRAction | null) { targetAction = action }
export function tracking(value: boolean) { tracked = value }
export function menu(open: boolean) { inputState.mapOpen = open }
export function disconnectWithoutFrames() {
  clearInterval(timer)
  useSession.setState({ status: 'reconnecting' })
}
export function snapshot() {
  const { camera, scene } = root()
  const avatar = avatars.get(useSession.getState().sessionId)!
  const pose = sampleAvatar(avatar, performance.now(), { ...avatar.current })
  const panel = scene.getObjectByName('jumpmap-xr-dialog')!.parent!
  const status = scene.getObjectByName('jumpmap-xr-status')!.parent!
  return { phase: useParkXR.getState().phase, active: parkXRView.active, ownsInput: parkXRView.ownsInput,
    position: camera.getWorldPosition(new Vector3()).toArray(), viewPosition: parkXRView.position.toArray(),
    parent: camera.parent?.type ?? null, pose,
    dialogBounds: [[-.69, -.46], [.69, .46]].map(([x, y]) => panel.localToWorld(new Vector3(x!, y!, 0)).project(camera).toArray()),
    ownVisible: scene.getObjectByName('avatar-' + useSession.getState().sessionId)?.visible,
    dialogVisible: panel.visible, statusVisible: status.visible, view: panel.userData.view as JumpmapXRView | undefined }
}
