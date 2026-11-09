import { Quaternion, Vector3 } from 'three'
import type { PerspectiveCamera, WebGLRenderer } from 'three'
import { ChefScene } from '../../../src/features/skewer/chef/ChefScene'
import { ChefPreview } from '../../../src/features/skewer/chef/model'
import type { ChefAction } from '../../../src/features/skewer/chef/model'
import '../../../src/styles.css'
import '../../../src/features/skewer/chef/chef.css'

// Test-only XR pose/session adapter. Production code receives a normal WebXR frame.
const host = document.getElementById('host')!, view = new ChefPreview().view()
view.cooperative = { phase: 'PLAYING', round: 0, greetingIndex: 0, greetingRemaining: 5,
  greeting: true, answered: false, speech: false, countdown: 0, paused: false }
const actions: ChefAction[] = []
const kitchen = new ChefScene(host, view, 'vr', () => view, action => actions.push(action), () => {}, () => {})
const internal = kitchen as unknown as {
  renderer: WebGLRenderer; camera: PerspectiveCamera; dolly: import('three').Group; greetingPanel: import('three').Mesh
  render(time: number, frame?: XRFrame): void; activate(pick: { action: 'coop' }): void
}
internal.renderer.setAnimationLoop(null)
let now = performance.now(), yaw = 0, tracked = true, session: XRSession
let space = new EventTarget() as XRReferenceSpace
const orientation = new Quaternion(), position = new Vector3(0, 1.6, 0)
Object.defineProperty(navigator, 'xr', { configurable: true, value: {
  requestSession: async () => {
    session = Object.assign(new EventTarget(), { visibilityState: 'visible', inputSources: [], end: async () => session.dispatchEvent(new Event('end')) }) as unknown as XRSession
    return session
  }, isSessionSupported: async () => true,
} })
internal.renderer.xr.setSession = async () => {}
internal.renderer.xr.getReferenceSpace = () => space
const frame = () => ({ session, getViewerPose: () => tracked ? { transform: { orientation, position } } : null }) as unknown as XRFrame
function tick(ms = 25) {
  orientation.setFromAxisAngle(new Vector3(0, 1, 0), yaw * Math.PI / 180)
  internal.camera.position.copy(position); internal.camera.quaternion.copy(orientation)
  internal.render(now += ms, session ? frame() : undefined)
}
Reflect.set(window, 'greetingTurnQA', {
  enter: async () => { await kitchen.enterVR(); tick() },
  turn: (degrees: number) => { const initial = yaw; for (let i = 1; i <= 100; i++) { yaw = initial + degrees * i / 100; tick() } },
  virtualTurn: () => { for (let i = 1; i <= 100; i++) { internal.dolly.rotation.y = i / 100 * Math.PI * 2; tick() } },
  select: () => { internal.activate({ action: 'coop' }); tick() },
  paused: (value: boolean) => { view.cooperative!.paused = value; tick() },
  blocked: (value: boolean) => { kitchen.setGreetingBlocked(value); tick() },
  guide: (value: boolean) => { kitchen.showVRGuide(value); tick() },
  tracked: (value: boolean) => { tracked = value; tick() },
  visibility: (value: XRVisibilityState) => { Object.defineProperty(session, 'visibilityState', { configurable: true, value }); session.dispatchEvent(new Event('visibilitychange')); tick() },
  recenter: () => { space.dispatchEvent(new Event('reset')); tick() },
  start: (index: number, round = 0) => { Object.assign(view.cooperative!, { phase: 'PLAYING', round, greetingIndex: index, greeting: true, answered: false, greetingOutcome: '' }); tick() },
  finish: () => { view.cooperative!.greeting = false; view.cooperative!.greetingOutcome = 'missed'; tick() },
  acknowledge: () => { view.cooperative!.answered = true; tick() },
  end: async () => { await session.end(); tick() },
  dispose: () => kitchen.dispose(),
  snapshot: () => ({ count: actions.filter(action => action.type === 'greet').length, progress: Number(host.dataset.greetingTurn),
    followsHead: internal.greetingPanel.parent === internal.dolly, panelYaw: internal.greetingPanel.quaternion.angleTo(orientation) }),
})
tick()
host.dataset.fixtureReady = 'true'
