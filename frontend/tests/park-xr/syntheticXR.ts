/** Browser-only XR frame/session simulation. No production hooks or auth bypass. */
import { _roots, advance } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { JumpmapXRAction, JumpmapXRView } from '../../src/features/jumpmap/xrModel'
import { parkXRView } from '../../src/world/xrView'
import { useParkXR } from '../../src/features/parkXR/state'
import { avatars, sampleAvatar, useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'
import { useXRComfort } from '../../src/features/parkXR/comfort'

let left: Gamepad, right: Gamepad, session: XRSession
let timer: ReturnType<typeof setInterval>
let targetAction: JumpmapXRAction | 'skewer-entry' | 'skewer-entry-edge' | null = null
let canvasTarget: { name: string; u: number; v: number } | null = null
let endDeferred = false, finishEnd: (() => void) | undefined
const viewerRotation = new Quaternion()
let turnSamples: number[] = []
let tracked = true
let viewerHeight = 1.65
export function height(value: number) { viewerHeight = value }
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
      if (endDeferred) await new Promise<void>(resolve => { finishEnd = resolve })
      clearInterval(timer); current = null
      session.dispatchEvent(new Event('end'))
      state.setFrameloop('always')
    } }) as unknown as XRSession
    state.setFrameloop('never')
    tracked = true; targetAction = null; canvasTarget = null; viewerRotation.identity(); turnSamples = []; endDeferred = false; finishEnd = undefined
    const frame = { getViewerPose: () => tracked ? ({ transform: {
      position: { x: .3, y: viewerHeight, z: -.2 }, orientation: viewerRotation,
    } }) : null, getPose: () => {
      const { scene } = root(), rig = scene.getObjectByName('park-xr-rig')!
      const panel = scene.getObjectByName('jumpmap-xr-dialog')!
      const view = panel.parent!.userData.view as JumpmapXRView | undefined
      const index = view?.buttons.findIndex(b => b.id === targetAction) ?? -1
      const position = { x: .55, y: 1.35, z: -.45 }
      let point: Vector3
      if (canvasTarget) {
        const mesh = scene.getObjectByName(canvasTarget.name) as import('three').Mesh<import('three').PlaneGeometry>
        const { width, height } = mesh.geometry.parameters
        point = mesh.localToWorld(new Vector3((canvasTarget.u - .5) * width, (.5 - canvasTarget.v) * height, 0))
      } else if (targetAction === 'skewer-entry') point = scene.getObjectByName('park-xr-skewer-entry')!.localToWorld(new Vector3(0, (.5 - 233 / 384) * .3, 0))
      else if (targetAction === 'skewer-entry-edge') point = scene.getObjectByName('park-xr-skewer-entry')!.localToWorld(new Vector3(.58, .13, 0))
      else {
        if (index < 0 || !view) return { transform: { position, orientation: new Quaternion() } }
        const rect = (panel.userData.buttons as { x: number; y: number; width: number; height: number }[])[index]!
        const pixelX = rect.x + rect.width / 2, pixelY = rect.y + rect.height / 2
        point = panel.localToWorld(new Vector3((pixelX / 1536 - .5) * 1.38, (.5 - pixelY / 1024) * .92, 0))
      }
      rig.worldToLocal(point)
      const direction = point.sub(new Vector3(position.x, position.y, position.z)).normalize()
      return { transform: { position, orientation: new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), direction) } }
    } } as unknown as XRFrame
    timer = setInterval(() => {
      advance(root().clock.elapsedTime + .016, false, root(), frame)
      turnSamples.push(root().scene.getObjectByName('park-xr-rig')!.rotation.y)
    }, 32)
    return session
  }
}
export function input(forward: number, jump = false, turn = 0, exit = false) {
  (left.axes as number[])[3] = -forward
  ;(right.axes as number[])[2] = turn
  Object.assign(right.buttons[4]!, { pressed: jump, value: Number(jump) })
  Object.assign(right.buttons[5]!, { pressed: exit, value: Number(exit) })
}
export function tiltRightStick(tilt: number) { (right.axes as number[])[3] = tilt }
export function visibility(value: XRVisibilityState) {
  Object.defineProperty(session, 'visibilityState', { configurable: true, value })
  session.dispatchEvent(new Event('visibilitychange'))
}
export function buttons({ run = false, guide = false, chat = false, trigger = false }: { run?: boolean; guide?: boolean; chat?: boolean; trigger?: boolean }) {
  Object.assign(left.buttons[1]!, { pressed: run, value: Number(run) })
  Object.assign(left.buttons[4]!, { pressed: guide, value: Number(guide) })
  Object.assign(left.buttons[5]!, { pressed: chat, value: Number(chat) })
  Object.assign(right.buttons[0]!, { pressed: trigger, value: Number(trigger) })
}
export function aim(action: JumpmapXRAction | 'skewer-entry' | 'skewer-entry-edge' | null) { targetAction = action }
export function aimCanvas(name: string, u: number, v: number) { canvasTarget = { name, u, v } }
export function visibleXRObject(name: string) { return !!root().scene.getObjectByName(name)?.visible }
export function xrCanvasInView(name: string) {
  const { scene, camera } = root()
  const mesh = scene.getObjectByName(name) as import('three').Mesh<import('three').PlaneGeometry> | undefined
  if (!mesh?.visible) return false
  const { width, height } = mesh.geometry.parameters
  return [-.5, .5].every(x => [-.5, .5].every(y => {
    const point = mesh.localToWorld(new Vector3(x * width, y * height, 0)).project(camera)
    return Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1
  }))
}
export function holdEnd() { endDeferred = true }
export function completeEnd() { endDeferred = false; finishEnd?.(); finishEnd = undefined }
export function rotationSamples() { return [...turnSamples] }
export function faceSkewerEntry() {
  const { scene, camera } = root(), rig = scene.getObjectByName('park-xr-rig')!
  const direction = scene.getObjectByName('park-xr-skewer-entry')!.getWorldPosition(new Vector3())
    .sub(camera.getWorldPosition(new Vector3())).applyQuaternion(rig.getWorldQuaternion(new Quaternion()).invert()).normalize()
  viewerRotation.setFromUnitVectors(new Vector3(0, 0, -1), direction)
}
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
  return { settings: useXRComfort.getState().settings, heightNotice: useXRComfort.getState().heightNotice,
    phase: useParkXR.getState().phase, mode: useParkXR.getState().mode, active: parkXRView.active, ownsInput: parkXRView.ownsInput,
    position: camera.getWorldPosition(new Vector3()).toArray(), viewPosition: parkXRView.position.toArray(),
    parent: camera.parent?.type ?? null, pose,
    dialogBounds: [[-.69, -.46], [.69, .46]].map(([x, y]) => panel.localToWorld(new Vector3(x!, y!, 0)).project(camera).toArray()),
    ownVisible: scene.getObjectByName('avatar-' + useSession.getState().sessionId)?.visible,
    rigYaw: scene.getObjectByName('park-xr-rig')!.rotation.y,
    skewerEntryVisible: scene.getObjectByName('park-xr-skewer-entry')!.visible,
    entryBounds: [[-.6, -.15], [.6, .15]].map(([x, y]) => scene.getObjectByName('park-xr-skewer-entry')!
      .localToWorld(new Vector3(x!, y!, 0)).project(camera).toArray()),
    dialogVisible: panel.visible, statusVisible: status.visible, view: panel.userData.view as JumpmapXRView | undefined }
}
