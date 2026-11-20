import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Mesh, MeshBasicMaterial, Quaternion, Vector3, WebGLRenderer } from 'three'
import type { Camera, Object3D, Scene } from 'three'
import CoopHost from '../../../src/features/skewer/coop/CoopHost'
import { ChefPreview } from '../../../src/features/skewer/chef/model'
import type { ChefAction } from '../../../src/features/skewer/chef/model'
import { ChefScene } from '../../../src/features/skewer/chef/ChefScene'
import type { CoopSnapshot, CoopTransport } from '../../../src/features/skewer/coop/contracts'
import type { Envelope } from '../../../src/network/protocol'
import '../../../src/styles.css'

// Actual host/page/scene, with test-only transport and WebXR session/pose adapters.
const gameId = 'skewer-coop-00000000-0000-4000-8000-000000000001'
const chefPreview = new ChefPreview()
const state: CoopSnapshot = { gameId, version: 1, registered: true,
  privateState: { role: 'chef', chef: chefPreview.view() },
  publicState: { gameCode: 'SKEWER_COOP', phase: 'WAITING', channelId: 'park', actionVersion: 1,
    remaining: 240, elapsed: 0, countdown: 0, score: 432, served: 2, paused: false, chefVR: false,
    rankingEligible: true, entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
    players: [{ userId: '101', role: 'chef', ready: false, connected: true }, { userId: '202', role: 'server', ready: false, connected: true }],
    greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false } } }
let receive: ((message: Envelope) => boolean) | undefined
const publish = () => { state.version++; receive?.({ type: 'GAME_STATE', payload: structuredClone(state) } as unknown as Envelope) }
const calls: string[] = []
let hold = false, fail = false, failLeave = false, release: (() => void) | undefined, protectionReleased = 0
let failGreeting = false, loseGreetingReply = false, failCooking = false, connected = true
let failProtection = false, rejectSession = false
const transport: CoopTransport = {
  scope: () => ({ userId: '101', channelId: 'park', connected }),
  protectVR: async () => {
    if (failProtection) { failProtection = false; throw new Error('VR 플레이 보호를 확인하지 못했어요. 공원 연결을 확인하고 다시 시작해 주세요.') }
    return () => { protectionReleased++ }
  },
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
      if (input.type === 'THREAD' && failCooking) { failCooking = false; throw { code: 'GAME_ACTION_INVALID_ACTION' } }
      if (input.type === 'SUBMIT') {
        chefPreview.action({ type: 'submit' })
        state.privateState.chef = chefPreview.view()
      }
      if (input.type === 'GREET') {
        if (hold) await new Promise<void>(resolve => { release = resolve })
        if (failGreeting) { failGreeting = false; throw new Error('일시 통신 오류') }
        state.publicState.greeting.answered = true
        if (loseGreetingReply) { loseGreetingReply = false; state.version++; throw new Error('응답만 유실') }
      }
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
let requestedWithActivation = false
let yaw = 0, clock = performance.now(), renderFrame: (() => void) | undefined
const space = new EventTarget() as XRReferenceSpace
const right = { handedness: 'right', gamepad: { mapping: 'xr-standard', buttons: Array.from({ length: 6 }, () => ({ pressed: false })) } } as unknown as XRInputSource
Object.defineProperty(navigator, 'xr', { configurable: true, value: {
  isSessionSupported: async () => true,
  requestSession: async () => {
    requested++
    requestedWithActivation = navigator.userActivation.isActive
    if (rejectSession) { rejectSession = false; throw new DOMException('VR 접근 권한을 허용해 주세요.', 'SecurityError') }
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
  try { await enterVR.call(this) }
  catch (error) { renderer.setAnimationLoop(time => internal.render(time)); throw error }
  if (timer) clearInterval(timer)
  renderFrame = () => {
    const current = session
    if (current) frames++
    const orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw * Math.PI / 180)
    const frame = current ? { session: current, getViewerPose: () => tracked ? { transform: { orientation, position: new Vector3(0, 1.6, 0) } } : null } as unknown as XRFrame : undefined
    if (current) { internal.camera.position.set(0, 1.6, 0); internal.camera.quaternion.copy(orientation); internal.camera.updateMatrixWorld(true) }
    internal.render(clock, frame)
  }
  timer = setInterval(() => { clock = Math.max(clock + 40, performance.now()); renderFrame?.() }, 40)
}
function aimAt(target: Object3D, x = .25, y = 1.3) {
  if (!renderer || !scene) throw new Error('주방 준비 전')
  const controller = renderer.xr.getController(0)
  controller.visible = true; controller.position.set(x, y, -.15)
  scene.updateMatrixWorld(true)
  const point = target.getWorldPosition(new Vector3()); controller.parent!.worldToLocal(point)
  controller.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), point.sub(controller.position).normalize())
  controller.updateMatrix(); controller.updateWorldMatrix(true, true)
  return controller
}

async function select(action: string) {
  await new Promise(resolve => setTimeout(resolve, 80)) // publish 이후 실제 Scene 프레임에 메뉴를 반영한다.
  if (!scene) throw new Error('주방 준비 전')
  let target: Object3D | undefined
  scene.traverse(object => { if (object.userData.pick?.action === action) target = object })
  if (!target) throw new Error(`선택 대상 없음: ${action}`)
  const controller = aimAt(target)
  const hit = (kitchen as unknown as { controllerHit(index: number): { object: import('three').Object3D } | undefined }).controllerHit(0)
  controller.dispatchEvent({ type: 'selectstart', data: right })
  return { pick: hit?.object.userData.pick, targetVisible: target.visible, parentVisible: target.parent?.visible }
}

async function measureAssembly() {
  await new Promise(resolve => setTimeout(resolve, 80))
  if (!kitchen) throw new Error('주방 준비 전')
  const assembly = kitchen as unknown as { skewer: import('three').Group; kitchen: import('three').Group; marker: Mesh<import('three').BufferGeometry, MeshBasicMaterial> }
  const controller = aimAt(assembly.skewer, -.25, 1.13)
  const length = () => assembly.skewer.localToWorld(new Vector3(-1.51, 0, 0)).distanceTo(assembly.marker.getWorldPosition(new Vector3()))
  const restingLength = length()
  controller.dispatchEvent({ type: 'squeezestart', data: right })
  const heldLength = length(), held = assembly.skewer.parent === controller
  controller.dispatchEvent({ type: 'squeezeend', data: right })
  return { restingLength, heldLength, held, returned: assembly.skewer.parent === assembly.kitchen,
    counterHeight: assembly.kitchen.localToWorld(new Vector3(0, 1.02, 0)).y,
    markerOccluded: assembly.marker.material.depthTest, markerRenderOrder: assembly.marker.renderOrder }
}

function submitHolding(targetName: string) {
  if (!scene || !kitchen) throw new Error('주방 준비 전')
  const { skewer } = kitchen as unknown as { skewer: Object3D }
  const target = scene.getObjectByName(targetName)
  const hint = scene.getObjectByName('chef-submit-hint')
  if (!target || !hint) throw new Error(`전달대 대상 없음: ${targetName}`)
  renderFrame?.()
  const hintVisible = hint.visible
  const controller = aimAt(skewer, -.25, 1.13)
  controller.dispatchEvent({ type: 'squeezestart', data: right })
  const held = skewer.parent === controller
  aimAt(target).dispatchEvent({ type: 'selectstart', data: right })
  controller.dispatchEvent({ type: 'squeezeend', data: right })
  return { held, hintVisible }
}
const showModal = HTMLDialogElement.prototype.showModal
let modalCalls = 0
HTMLDialogElement.prototype.showModal = function () { if (session) modalCalls++; showModal.call(this) }
Reflect.set(window, 'vrPauseQA', {
  start: () => { state.publicState.phase = 'PLAYING'; publish() },
  finishSkewer: () => {
    for (const ingredient of chefPreview.view().visible[0].recipe) chefPreview.action({ type: 'thread', ingredient })
    state.privateState.chef = chefPreview.view()
    publish()
  },
  submitHolding,
  phase: (value: CoopSnapshot['publicState']['phase']) => { state.publicState.phase = value; publish() },
  finish: () => { Object.assign(state.publicState, { phase: 'FINISHED', paused: false, pausedBy: [], endReason: 'SKEWER_FORFEIT' }); publish() },
  // Scene 앞단의 허용 여부와 별개로 상위 입력이 Page 콜백에 직접 들어오는 경로를 검증한다.
  dispatch: (action: ChefAction) => { if (!kitchen) throw new Error('주방 준비 전'); (kitchen as unknown as { action(action: ChefAction): void }).action(action) },
  b: (pressed: boolean) => Object.assign(right.gamepad!.buttons[5], { pressed }),
  select, hold: (value: boolean) => { hold = value }, fail: () => { fail = true }, failLeave: () => { failLeave = true },
  measureAssembly,
  failProtection: () => { failProtection = true }, rejectSession: () => { rejectSession = true },
  endSession: () => session?.end(),
  release: () => { hold = false; release?.(); release = undefined },
  tracked: (value: boolean) => { tracked = value },
  greeting: () => { Object.assign(state.publicState.greeting, { active: true, index: state.publicState.greeting.index + 1, remaining: 5, answered: false }); publish() },
  turn: (degrees: number) => { const start = yaw; for (let i = 0; i <= 36; i++) { yaw = start + degrees * i / 36; clock += 40; renderFrame?.() } },
  failGreeting: () => { failGreeting = true }, loseGreetingReply: () => { loseGreetingReply = true }, failCooking: () => { failCooking = true },
  friend: (value: boolean) => {
    state.publicState.players[1].connected = value
    state.publicState.paused = !value || !!state.publicState.pausedBy?.length
    state.publicState.pauseReason = !value ? 'DISCONNECTED' : state.publicState.paused ? 'EXIT_CONFIRM' : ''
    publish()
  },
  connection: (value: boolean) => { connected = value },
  snapshot: () => ({ calls: [...calls], modalCalls, frames, requested, requestedWithActivation, rendererAttached: !!renderer, protected: !!session, protectionReleased, paused: state.publicState.paused, answered: state.publicState.greeting.answered }),
})
function App() {
  const [closed, setClosed] = useState(false)
  return closed ? <p role="status">공원으로 돌아왔어요</p> : <CoopHost transport={transport} onClose={() => setClosed(true)} />
}
createRoot(document.getElementById('root')!).render(<App />)
