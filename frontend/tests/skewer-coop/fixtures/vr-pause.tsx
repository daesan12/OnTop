import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Quaternion, Vector3, WebGLRenderer } from 'three'
import type { Camera, Scene } from 'three'
import CoopHost from '../../../src/features/skewer/coop/CoopHost'
import { ChefPreview } from '../../../src/features/skewer/chef/model'
import { ChefScene } from '../../../src/features/skewer/chef/ChefScene'
import type { CoopSnapshot, CoopTransport } from '../../../src/features/skewer/coop/contracts'
import type { Envelope } from '../../../src/network/protocol'
import '../../../src/styles.css'

// Actual host/page/scene, with test-only transport and WebXR session/pose adapters.
const gameId = 'skewer-coop-00000000-0000-4000-8000-000000000001'
const state: CoopSnapshot = { gameId, version: 1, registered: true,
  privateState: { role: 'chef', chef: new ChefPreview().view() },
  publicState: { gameCode: 'SKEWER_COOP', phase: 'WAITING', channelId: 'park', actionVersion: 1,
    remaining: 240, elapsed: 0, countdown: 0, score: 432, served: 2, paused: false, chefVR: false,
    rankingEligible: true, entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
    players: [{ userId: '101', role: 'chef', ready: false, connected: true }, { userId: '202', role: 'server', ready: false, connected: true }],
    greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false } } }
let receive: ((message: Envelope) => boolean) | undefined
const publish = () => { state.version++; receive?.({ type: 'GAME_STATE', payload: structuredClone(state) } as unknown as Envelope) }
const calls: string[] = []
let hold = false, fail = false, failLeave = false, release: (() => void) | undefined, protectionReleased = 0
const transport: CoopTransport = {
  scope: () => ({ userId: '101', channelId: 'park', connected: true }),
  protectVR: async () => () => { protectionReleased++ },
  subscribe: fn => { receive = fn; return () => { receive = undefined } },
  requestJSON: async (path, init) => {
    if (path.endsWith('/leave') && init?.method === 'POST') { calls.push('LEAVE'); if (failLeave) { failLeave = false; throw new Error('일시 오류') }; return {} }
    return { mine: structuredClone(state), rooms: [] }
  },
  request: async (type, payload) => {
    const input = payload.input as { type: string; paused?: boolean; vr?: boolean }
    if (type === 'GAME_FORFEIT') { calls.push('FORFEIT'); return { type: 'GAME_FORFEIT_RESULT', payload: {} } as Envelope }
    if (type === 'GAME_ACTION_SEND') {
      calls.push(input.type === 'PAUSE' ? `PAUSE:${input.paused}` : input.type)
      if (input.type === 'PAUSE') {
        if (hold) await new Promise<void>(resolve => { release = resolve })
        if (fail) { fail = false; throw { code: 'GAME_ACTION_INVALID_ACTION' } }
        state.publicState.paused = !!input.paused
        state.publicState.pausedBy = input.paused ? ['101'] : []
      }
      if (input.type === 'CHEF_MODE') state.publicState.chefVR = !!input.vr
      publish()
    }
    return { type: type === 'GAME_STATE_CHECK' ? 'GAME_STATE' : 'GAME_ACTION_RESULT', payload: structuredClone(state) } as unknown as Envelope
  },
}
let session: XRSession | null = null, renderer: WebGLRenderer | null = null, scene: Scene | null = null, kitchen: ChefScene | null = null
let tracked = true, frames = 0, requested = 0, timer: ReturnType<typeof setInterval> | undefined
const space = new EventTarget() as XRReferenceSpace
const right = { handedness: 'right', gamepad: { mapping: 'xr-standard', buttons: Array.from({ length: 6 }, () => ({ pressed: false })) } } as unknown as XRInputSource
Object.defineProperty(navigator, 'xr', { configurable: true, value: {
  isSessionSupported: async () => true,
  requestSession: async () => {
    requested++
    const created = Object.assign(new EventTarget(), { visibilityState: 'visible', inputSources: [right], end: async () => { session = null; created.dispatchEvent(new Event('end')) } }) as unknown as XRSession
    session = created; return created
  },
} })
const enterVR = ChefScene.prototype.enterVR
ChefScene.prototype.enterVR = async function () {
  const internal = this as unknown as { renderer: WebGLRenderer; scene: Scene; camera: Camera; render(time: number, frame?: XRFrame): void }
  renderer = internal.renderer; scene = internal.scene; kitchen = this
  renderer.setAnimationLoop(null)
  renderer.xr.setSession = async () => {}; renderer.xr.getReferenceSpace = () => space
  renderer.xr.getCamera = () => internal.camera as ReturnType<WebGLRenderer['xr']['getCamera']>
  await enterVR.call(this)
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    const current = session
    if (current) frames++
    const frame = current ? { session: current, getViewerPose: () => tracked ? { transform: { orientation: new Quaternion(), position: new Vector3(0, 1.6, 0) } } : null } as unknown as XRFrame : undefined
    if (current) { internal.camera.position.set(0, 1.6, 0); internal.camera.quaternion.identity(); internal.camera.updateMatrixWorld(true) }
    internal.render(performance.now(), frame)
  }, 40)
}
async function select(action: string) {
  await new Promise(resolve => setTimeout(resolve, 80)) // publish 이후 실제 Scene 프레임에 메뉴를 반영한다.
  if (!renderer || !scene) throw new Error('주방 준비 전')
  let target: import('three').Object3D | undefined
  scene.traverse(object => { if (object.userData.pick?.action === action) target = object })
  if (!target) throw new Error(`선택 대상 없음: ${action}`)
  const controller = renderer.xr.getController(0)
  controller.visible = true; controller.position.set(.25, 1.3, -.15)
  scene.updateMatrixWorld(true)
  const point = target.getWorldPosition(new Vector3()); controller.parent!.worldToLocal(point)
  controller.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), point.sub(controller.position).normalize())
  controller.updateMatrix(); controller.updateWorldMatrix(true, true)
  const hit = (kitchen as unknown as { controllerHit(index: number): { object: import('three').Object3D } | undefined }).controllerHit(0)
  controller.dispatchEvent({ type: 'selectstart', data: right })
  return { pick: hit?.object.userData.pick, targetVisible: target.visible, parentVisible: target.parent?.visible }
}
const showModal = HTMLDialogElement.prototype.showModal
let modalCalls = 0
HTMLDialogElement.prototype.showModal = function () { if (session) modalCalls++; showModal.call(this) }
Reflect.set(window, 'vrPauseQA', {
  start: () => { state.publicState.phase = 'PLAYING'; publish() },
  b: (pressed: boolean) => Object.assign(right.gamepad!.buttons[5], { pressed }),
  select, hold: (value: boolean) => { hold = value }, fail: () => { fail = true }, failLeave: () => { failLeave = true },
  release: () => { hold = false; release?.(); release = undefined },
  tracked: (value: boolean) => { tracked = value },
  snapshot: () => ({ calls: [...calls], modalCalls, frames, requested, rendererAttached: !!renderer, protected: !!session, protectionReleased, paused: state.publicState.paused }),
})
function App() {
  const [closed, setClosed] = useState(false)
  return closed ? <p role="status">공원으로 돌아왔어요</p> : <CoopHost transport={transport} onClose={() => setClosed(true)} />
}
createRoot(document.getElementById('root')!).render(<App />)
