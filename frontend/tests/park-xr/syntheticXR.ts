/** Browser-only XR frame/session simulation. No production hooks or auth bypass. */
import { _roots, advance } from '@react-three/fiber'
import { Group, Matrix4, Quaternion, Vector3 } from 'three'
import type { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, ShaderMaterial } from 'three'
import type { JumpmapXRAction, JumpmapXRView } from '../../src/features/jumpmap/xrModel'
import { parkXRView } from '../../src/world/xrView'
import { useParkXR } from '../../src/features/parkXR/state'
import { XRNames } from '../../src/features/parkXR/xrNames'
import { avatars, sampleAvatar, useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'
import { useXRComfort } from '../../src/features/parkXR/comfort'
import { stonePoint } from '../../src/game/omokPresentation'

let left: Gamepad, right: Gamepad, session: XRSession
let timer: ReturnType<typeof setInterval>
let targetAction: JumpmapXRAction | 'skewer-entry' | 'skewer-entry-edge' | null = null
let canvasTarget: { name: string; u: number; v: number } | null = null
let boardTarget: { x: number; y: number } | null = null
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
export function checkNicknamePanelLifetime(id: string) {
  const avatar = avatars.get(id)
  if (!avatar?.connected) return null
  const scene = new Group()
  const names = new XRNames(scene)
  const now = performance.now()
  const { x, y, z } = sampleAvatar(avatar, now, { x: 0, y: 0, z: 0, yaw: 0 })
  const near = new Vector3(x + 2, y + 1.05, z)
  const far = new Vector3(x + 1000, y, z)
  try {
    names.update(now, near)
    const mesh = scene.getObjectByName('park-xr-nickname') as Mesh<PlaneGeometry, MeshBasicMaterial> | undefined
    if (!mesh?.visible) return null
    const disposed: string[] = []
    mesh.geometry.addEventListener('dispose', () => disposed.push('geometry'))
    mesh.material.addEventListener('dispose', () => disposed.push('material'))
    mesh.material.map!.addEventListener('dispose', () => disposed.push('texture'))
    names.update(now + 1000, far)
    const hidden = !mesh.visible && mesh.parent === scene
    names.update(now + 5000, near)
    const reused = mesh.visible && mesh.parent === scene && disposed.length === 0
    names.update(now + 15001, far)
    const removed = mesh.parent === null
    names.update(now + 15002, near)
    const recreated = scene.children.some(child => child !== mesh && child.visible)
    return { hidden, reused, removed, recreated, disposed }
  } finally {
    names.dispose()
  }
}
export function guideTexturePNG() {
  const mesh = root().scene.getObjectByName('jumpmap-xr-dialog') as import('three').Mesh<import('three').PlaneGeometry, import('three').MeshBasicMaterial>
  return (mesh.material.map!.image as HTMLCanvasElement).toDataURL('image/png')
}
export function sceneFramePNG() {
  const state = root()
  state.gl.render(state.scene, state.camera)
  return state.gl.domElement.toDataURL('image/png')
}
export function crowdRenderStats() {
  const { scene, camera, gl } = root()
  let avatars = 0, detailedAvatars = 0, avatarTriangles = 0, names = 0
  for (const peer of scene.getObjectByName('visitors')?.children ?? []) {
    if (!peer.name.startsWith('avatar-') || !peer.visible) continue
    avatars++
    let detailed = false
    peer.traverseVisible(node => {
      const mesh = node as Mesh
      if (!mesh.isMesh) return
      if (mesh.name.startsWith('near-')) detailed = true
      avatarTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3
    })
    if (detailed) detailedAvatars++
  }
  for (const node of scene.children) if (node.name === 'park-xr-nickname' && node.visible) names++
  gl.render(scene, camera)
  return { avatars, detailedAvatars, avatarTriangles, names, calls: gl.info.render.calls, triangles: gl.info.render.triangles,
    desktopOverlays: document.querySelectorAll('.avatar-overhead[style*="visibility: visible"]').length }
}
export function watchTelescopeSky() {
  const { scene, camera } = root()
  const sky = scene.getObjectByName('dynamic-sky') as Mesh<never, ShaderMaterial>
  const lens = scene.getObjectByName('park-xr-telescope-lens') as Mesh<never, MeshBasicMaterial>
  const focus = { lens: { index: -1, time: 0 }, park: { index: -1, time: 0 }, night: 0 }
  const drawSky = sky.onBeforeRender
  sky.onBeforeRender = function (...args) {
    drawSky.apply(this, args)
    const [renderer, , view] = args
    const output = renderer.getRenderTarget()?.texture === lens.material.map ? focus.lens
      : view === camera ? focus.park : undefined
    if (!output) return
    const { focusedConstellation, revealTime, night } = sky.material.uniforms
    output.index = focusedConstellation!.value
    output.time = revealTime!.value
    focus.night = night!.value
  }
  skyFocus = focus
}
let skyFocus: { lens: { index: number; time: number }; park: { index: number; time: number }; night: number } | undefined
export const readTelescopeSky = () => skyFocus
export function install(options: { haptics?: boolean; frameStep?: number } = {}) {
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
  const space = new EventTarget() as XRReferenceSpace
  state.gl.xr.getReferenceSpace = () => space
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
    tracked = true; targetAction = null; canvasTarget = boardTarget = null; viewerRotation.identity(); turnSamples = []; endDeferred = false; finishEnd = undefined
    const frame = { session, getViewerPose: () => tracked ? ({ transform: {
      position: { x: .3, y: viewerHeight, z: -.2 }, orientation: viewerRotation,
    } }) : null, getPose: () => {
      const { scene } = root(), rig = scene.getObjectByName('park-xr-rig')!
      const panel = scene.getObjectByName('jumpmap-xr-dialog')!
      const view = panel.parent!.userData.view as JumpmapXRView | undefined
      const index = view?.buttons.findIndex(b => b.id === targetAction) ?? -1
      const position = { x: .55, y: 1.35, z: -.45 }
      let point: Vector3
      const board = boardTarget && omokBoard()
      if (board && boardTarget) {
        const [x, , z] = stonePoint(boardTarget.x, boardTarget.y)
        point = board.localToWorld(new Vector3(x, .0005, z))
      } else if (canvasTarget) {
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
      advance(root().clock.elapsedTime + (options.frameStep ?? .016), false, root(), frame)
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
export function aimCanvas(name: string, u: number, v: number) { boardTarget = null; canvasTarget = { name, u, v } }
function omokBoard() {
  const { bindings, roomId, tableId } = useSession.getState()
  const anchor = bindings.find(b => b.channelId === roomId && b.tableId === tableId)?.anchorId
  return root().scene.getObjectByName('omok-board-' + anchor)
}
export function aimOmok(x: number, y: number) { canvasTarget = null; boardTarget = { x, y } }
export function omokPingVisible() {
  const ping = omokBoard()?.children.find(child => child.name.startsWith('omok-spectator-ping-'))
  return !!ping?.visible && ping.children.some(child => child.visible && child.layers.test(root().camera.layers))
}
export function faceOmok() {
  const board = omokBoard()
  if (!board?.getObjectByName('gomoku-playing-surface')) return false
  const point = board.getWorldPosition(new Vector3())
  lookAt(point.x, point.y + .1, point.z)
  return true
}
export function visibleXRObject(name: string) { return !!root().scene.getObjectByName(name)?.visible }
export function selectKitchen(action: string) {
  const { gl } = root()
  const original = gl.render
  let target: Object3D | undefined
  gl.render = (scene, camera) => {
    scene.traverseVisible(node => { if (node.userData.pick?.action === action) target = node })
    original.call(gl, scene, camera)
  }
  try { parkXRView.renderKitchen?.() }
  finally { gl.render = original }
  if (!target) return false
  const controller = gl.xr.getController(1)
  const point = target.getWorldPosition(new Vector3())
  controller.visible = true
  controller.position.set(.25, 1.3, -.15)
  controller.parent!.worldToLocal(point)
  controller.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), point.sub(controller.position).normalize())
  controller.updateMatrix()
  controller.updateWorldMatrix(true, true)
  const data = session.inputSources[1]!
  controller.dispatchEvent({ type: 'selectstart', data })
  controller.dispatchEvent({ type: 'selectend', data })
  return true
}
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
export function lookAt(x: number, y: number, z: number) {
  const { scene, camera } = root()
  const rig = scene.getObjectByName('park-xr-rig')!
  const view = new Matrix4().lookAt(camera.getWorldPosition(new Vector3()), new Vector3(x, y, z), camera.up)
  viewerRotation.setFromRotationMatrix(view).premultiply(rig.getWorldQuaternion(new Quaternion()).invert())
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
