import * as THREE from 'three'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { localMovement } from '../../network/localMovementPrediction'
import { canControlRoamingCamera } from '../../world/roamingCamera'
import { clearRoamingInput } from '../../world/inputOwnership'
import { viewControls } from '../../world/cameraPerspective'
import { parkXRView } from '../../world/xrView'
import { emptyInput, readXRInput } from '../../world/xrInput'
import { JumpmapXRPanel } from '../jumpmap/JumpmapXRPanel'
import type { JumpmapXRAction } from '../jumpmap/xrModel'
import { ParkXRMovement } from './movement'
import { useParkXR } from './state'
import { useJumpmap, closeJumpCompletion } from '../jumpmap/state'
import { canStartJumpmapXR, inJumpmapXRRegion } from '../jumpmap/xrEntry'
import { acquireVRProtection } from '../vrSession/protection'
import { createTouchModel, disposeTouchModel } from '../vrSession/touchModel'
import { OmokXR, ownOmokGame } from '../../game/omok/OmokXR'
import { XRChat } from './xrChat'
import { XRNames } from './xrNames'
import { TelescopeXR } from '../telescopes/TelescopeXR'

type XRMode = 'park' | 'jumpmap' | 'omok'
import { jumpmapXRFeedback } from '../jumpmap/xrFeedback'
import { SkewerXREntry } from './SkewerXREntry'
import { canReachParkVr, openParkVrZone } from '../vrZone/parkBridge'
import { setXRHeightNotice, useXRComfort, XRHeightCalibration } from './comfort'

/** XR follows the existing predicted/replicated avatar; it never integrates a second player. */
export class ParkXRController {
  private kind: XRMode = 'park'
  private omokGameId = ''
  private releaseVR?: () => void
  private session: XRSession | null = null
  private referenceSpace: XRReferenceSpace | null = null
  private disposed = false
  private ending = false
  private scope = ''
  private started = false
  private yaw = 0
  private headYaw = 0
  private readonly rig = new THREE.Group()
  private readonly headAnchor = new THREE.Group()
  private readonly panel: JumpmapXRPanel
  private readonly skewerEntry: SkewerXREntry
  private chat?: XRChat
  private omok?: OmokXR
  private telescope?: TelescopeXR
  private readonly names: XRNames
  private enterSkewerAfterEnd = false
  private readonly rotation = new THREE.Quaternion()
  private readonly direction = new THREE.Vector3()
  private readonly head = new THREE.Vector3()
  private readonly offset = new THREE.Vector3()
  private readonly rotated = new THREE.Vector3()
  private readonly rayOrigin = new THREE.Vector3()
  private readonly rayDirection = new THREE.Vector3()
  private readonly rayRotation = new THREE.Quaternion()
  private readonly pose = { x: 0, y: 0, z: 0, yaw: 0 }
  private readonly saved: { parent: THREE.Object3D | null; position: THREE.Vector3; rotation: THREE.Quaternion; up: THREE.Vector3; projection: THREE.Matrix4; inverse: THREE.Matrix4; layers: number }
  private readonly handles: { grip: THREE.Group; model: THREE.Group }[] = []
  private readonly rays: { target: THREE.Group; line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> }[] = []
  private readonly movement = new ParkXRMovement(parkRuntime, () => {
    if (this.kind === 'jumpmap') jumpmapXRFeedback.requestJump()
  })
  private exitArmed = false
  private guideArmed = false
  private chatArmed = false
  private primaryArmed = false
  private selectArmed = false
  private panelKey = ''
  private comfortSettings = useXRComfort.getState().settings
  private readonly heightCalibration = new XRHeightCalibration()
  private heightReady = false
  private heightRevision = -1
  private heightRequestRevision = -1
  private stationaryAt: number | null = null
  private stationaryHeadY = 0
  private calibrationFrame = -Infinity
  private readonly calibrationPose = new THREE.Vector3()
  private readonly unsubscribe: () => void

  constructor(private readonly gl: THREE.WebGLRenderer, private readonly camera: THREE.Camera, private readonly scene: THREE.Scene) {
    this.saved = { parent: camera.parent, position: camera.position.clone(), rotation: camera.quaternion.clone(), up: camera.up.clone(), projection: camera.projectionMatrix.clone(), inverse: camera.projectionMatrixInverse.clone(), layers: camera.layers.mask }
    this.rig.name = 'park-xr-rig'; this.headAnchor.name = 'park-xr-head'
    this.rig.add(this.headAnchor); this.rig.visible = false; scene.add(this.rig)
    this.panel = new JumpmapXRPanel(scene, this.headAnchor)
    this.skewerEntry = new SkewerXREntry(scene)
    this.names = new XRNames(scene)
    for (let index = 0; index < 2; index++) {
      const grip = gl.xr.getControllerGrip(index)
      const model = createTouchModel()
      grip.add(model); this.rig.add(grip); this.handles.push({ grip, model })
      const target = gl.xr.getController(index)
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2.5)]),
        new THREE.LineBasicMaterial({ color: '#e9c577', transparent: true, depthTest: false, depthWrite: false }))
      line.renderOrder = 10020; line.visible = false
      target.add(line); this.rig.add(target); this.rays.push({ target, line })
    }
    window.addEventListener('ontop-clear-input', this.interrupted)
    window.addEventListener('ontop-browser-interrupt', this.interrupted)
    document.addEventListener('visibilitychange', this.interrupted)
    this.unsubscribe = useSession.subscribe(() => {
      if (this.session && (this.currentScope() !== this.scope || useSession.getState().status !== 'connected' || !useSession.getState().mapCompatible))
        void this.end('공원 연결 상태가 바뀌어 VR을 종료했어요.')
    })
  }

  start = (): Promise<void> => this.begin('park')
  startJumpmap = (): Promise<void> => this.begin('jumpmap')
  startOmok = (): Promise<void> => this.begin('omok')
  private canKeepSession(kind: XRMode) {
    if (kind !== 'omok') return canControlRoamingCamera(this.telescope?.id)
    const session = useSession.getState()
    return !!this.omokGameId && ownOmokGame()?.gameId === this.omokGameId && !!session.tableId && session.seatIndex >= 0
  }

  private async begin(kind: XRMode): Promise<void> {
    if (this.disposed || useParkXR.getState().phase !== 'idle') return
    const own = avatars.get(useSession.getState().sessionId)
    if (!own?.connected || own.carry) {
      useParkXR.setState({ error: '다른 행동을 마친 뒤 공원에 연결된 상태에서 VR을 시작해 주세요.' }); return
    }
    if (kind === 'jumpmap' && (!canStartJumpmapXR(own.current) || !useJumpmap.getState().available || own.swimming)) {
      useParkXR.setState({ error: '다른 행동을 마친 뒤 돌탑 안내 비석이나 출발 지점에서 VR을 시작해 주세요.' }); return
    }
    this.kind = kind
    this.omokGameId = kind === 'omok' ? ownOmokGame()?.gameId ?? '' : ''
    this.gl.domElement.focus({ preventScroll: true })
    if (!this.canKeepSession(kind)) {
      useParkXR.setState({ error: '공원에 연결된 산책 상태에서 시작해 주세요. 열린 메뉴나 게임을 먼저 닫아주세요.', notice: '' }); return
    }
    if (!window.isSecureContext || !navigator.xr) {
      useParkXR.setState({ error: 'Quest 기본 브라우저에서 HTTPS 또는 USB로 연결한 localhost 주소를 열어주세요.' }); return
    }
    if (this.gl.xr.isPresenting || this.gl.xr.getSession()) {
      useParkXR.setState({ error: '현재 실행 중인 VR 화면을 종료한 뒤 다시 시작해 주세요.' }); return
    }
    this.scope = this.currentScope()
    clearRoamingInput(); this.movement.reset(); parkXRView.ownsInput = true
    useParkXR.setState({ phase: 'requesting', mode: kind, error: '', notice: '' })
    let granted: XRSession | null = null
    try {
      // Preserve user activation: request the immersive session before any other await.
      granted = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] })
      // A confirmed game seat already blocks carry; the server rejects world-presence changes during a match.
      const release = kind === 'omok' ? undefined : await acquireVRProtection(parkRuntime)
      const current = avatars.get(useSession.getState().sessionId)
      if (this.disposed || this.currentScope() !== this.scope || !this.canKeepSession(kind)
        || !current?.connected || current.carry
        || kind === 'jumpmap' && (!canStartJumpmapXR(current.current) || current.swimming || !useJumpmap.getState().available)) {
        release?.(); await granted.end(); return
      }
      this.releaseVR = release
      if (kind === 'omok') this.omok ??= new OmokXR(this.headAnchor)
      else this.telescope ??= new TelescopeXR(this.scene, this.headAnchor)
      this.session = granted; this.ending = false; this.started = false
      this.exitArmed = this.guideArmed = this.chatArmed = this.primaryArmed = this.selectArmed = false
      this.saved.parent = this.camera.parent; this.saved.layers = this.camera.layers.mask
      this.saved.position.copy(this.camera.position); this.saved.rotation.copy(this.camera.quaternion); this.saved.up.copy(this.camera.up)
      this.saved.projection.copy(this.camera.projectionMatrix); this.saved.inverse.copy(this.camera.projectionMatrixInverse)
      this.yaw = viewControls.yaw; this.offset.set(0, 0, 0)
      this.heightCalibration.reset(); this.heightReady = false; this.heightRevision = this.heightRequestRevision = -1; this.stationaryAt = null
      sampleAvatar(avatars.get(useSession.getState().sessionId)!, performance.now(), this.pose)
      this.rig.position.set(this.pose.x, this.pose.y - .8, this.pose.z); this.rig.rotation.set(0, this.yaw, 0)
      this.rig.add(this.camera); this.rig.visible = true; this.headAnchor.visible = false; this.camera.layers.set(0)
      granted.addEventListener('end', this.finished)
      granted.addEventListener('visibilitychange', this.interrupted)
      granted.addEventListener('inputsourceschange', this.interrupted)
      this.gl.xr.enabled = true; this.gl.xr.setReferenceSpaceType('local-floor'); this.gl.xr.setFramebufferScaleFactor(.8)
      await this.gl.xr.setSession(granted)
      if (this.disposed || this.session !== granted) return
      this.gl.xr.setFoveation(1)
      this.referenceSpace = this.gl.xr.getReferenceSpace()
      this.referenceSpace?.addEventListener?.('reset', this.recentered)
      this.panel.inCourse = kind === 'jumpmap'; this.panel.reset(); this.panelKey = ''; parkXRView.active = true
      if (kind === 'jumpmap') jumpmapXRFeedback.start(granted)
      useParkXR.setState({ phase: 'active', notice: '왼쪽 스틱 이동 · A 점프 · 왼손 그립 달리기 · X 놀이 방법 · B VR 종료' })
    } catch (error) {
      if (granted) await granted.end().catch(() => undefined)
      if (!this.disposed) {
        this.restore()
        const name = error instanceof Error ? error.name : ''
        useParkXR.setState({ phase: 'idle', error: name === 'NotAllowedError' || name === 'SecurityError'
          ? 'VR 실행 권한이 허용되지 않았어요. 권한을 확인한 뒤 다시 시작해 주세요.'
          : name === 'NotSupportedError' ? '이 브라우저에서 VR 또는 바닥 추적을 시작할 수 없어요. Quest 기본 브라우저를 사용해 주세요.'
            : error instanceof Error ? error.message : 'VR 연결을 확인하지 못했어요.' })
      }
    } finally {
      if (!this.session && !this.disposed) { parkXRView.ownsInput = false; useParkXR.setState({ phase: 'idle' }) }
    }
  }

  end = async (notice = 'VR을 종료했어요. 기존 공원 조작으로 돌아왔어요.', reason: 'exit' | 'skewer' = 'exit'): Promise<void> => {
    // A later ordinary exit overrides an entrance request, even while end() is pending.
    if (reason !== 'skewer') this.enterSkewerAfterEnd = false
    if (!this.session || this.ending) return
    jumpmapXRFeedback.suspend()
    this.ending = true; this.movement.reset(); useParkXR.setState({ phase: 'ending', notice })
    try { await this.session.end() }
    catch {
      this.enterSkewerAfterEnd = false
      this.ending = false
      if (!this.disposed) useParkXR.setState({ phase: 'active', error: 'VR 종료 요청을 완료하지 못했어요. Meta 버튼으로 브라우저 메뉴를 열어 종료해 주세요.' })
    }
  }
  showGuide = () => {
    if (this.session && useParkXR.getState().phase === 'active' && this.kind !== 'omok' && !this.chat?.open && !this.telescope?.id) {
      this.panel.toggleGuide(this.kind === 'park')
    }
  }
  showSettings = () => {
    if (this.session && useParkXR.getState().phase === 'active' && this.kind !== 'omok' && !this.chat?.open && !this.telescope?.id) this.panel.showComfort()
  }

  private currentScope(): string { const s = useSession.getState(); return `${s.sessionId}|${s.roomId}|${s.mapVersion}` }
  private recentered = (): void => {
    this.started = false; this.heightReady = false; this.stationaryAt = null
    this.yaw = viewControls.yaw; this.panel.recenter(); this.interrupted()
  }
  private interrupted = (): void => {
    this.enterSkewerAfterEnd = false
    if (!this.session) return
    jumpmapXRFeedback.suspend()
    this.movement.reset(); this.exitArmed = this.guideArmed = this.chatArmed = this.primaryArmed = this.selectArmed = false
    this.panel.setVisible(false); this.skewerEntry.hide(); this.chat?.hide(); this.omok?.hide(); this.names.hide()
    this.telescope?.hide()
    // Other games may suspend the render loop; don't wait for a frame to release XR.
    queueMicrotask(() => {
      if (this.session && !document.hidden && this.session.visibilityState === 'visible' && !this.canKeepSession(this.kind))
        void this.end('공원 메뉴·활동이 열려 VR을 종료했어요. 화면에서 확인 후 다시 시작해 주세요.')
    })
  }
  private finished = (): void => {
    const enterSkewer = this.enterSkewerAfterEnd && !this.exitPressed() && this.currentScope() === this.scope
    this.restore()
    if (!this.disposed) {
      useParkXR.setState({ phase: 'idle' })
      if (enterSkewer && !openParkVrZone()) useParkXR.setState({ error: '꼬치왕 입구와 공원 연결을 확인한 뒤 다시 선택해 주세요.' })
    }
  }
  private enterSkewer(): void {
    const own = avatars.get(useSession.getState().sessionId)
    if (!own?.connected || own.carry || !canReachParkVr(own.current) || this.ending || !this.session) return
    this.enterSkewerAfterEnd = true
    void this.end('꼬치왕 준비 화면으로 이동해요.', 'skewer')
  }
  private exitPressed(): boolean {
    return Array.from(this.session?.inputSources ?? []).some(source => source.handedness === 'right'
      && source.gamepad?.mapping === 'xr-standard' && source.gamepad.buttons[5]?.pressed)
  }
  private restore(): void {
    jumpmapXRFeedback.stop()
    this.enterSkewerAfterEnd = false; this.skewerEntry.hide()
    this.telescope?.hide()
    if (this.telescope?.id) void this.telescope.close()
    this.omokGameId = ''; this.chat?.reset(); this.omok?.hide(); this.names.hide()
    this.releaseVR?.(); this.releaseVR = undefined
    closeJumpCompletion()
    this.session?.removeEventListener('end', this.finished)
    this.session?.removeEventListener('visibilitychange', this.interrupted)
    this.session?.removeEventListener('inputsourceschange', this.interrupted)
    this.referenceSpace?.removeEventListener?.('reset', this.recentered); this.referenceSpace = null
    this.session = null; this.ending = false; this.started = false; this.movement.reset()
    this.heightCalibration.reset(); this.heightReady = false; this.stationaryAt = null
    this.heightRevision = this.heightRequestRevision = -1
    setXRHeightNotice('')
    parkXRView.active = parkXRView.ownsInput = false; this.rig.visible = false
    this.panel.reset(); this.rays.forEach(({ line }) => { line.visible = false })
    if (this.camera.parent === this.rig) {
      this.camera.removeFromParent(); this.saved.parent?.add(this.camera)
      this.camera.position.copy(this.saved.position); this.camera.quaternion.copy(this.saved.rotation); this.camera.up.copy(this.saved.up)
      this.camera.projectionMatrix.copy(this.saved.projection); this.camera.projectionMatrixInverse.copy(this.saved.inverse)
      this.camera.layers.mask = this.saved.layers; this.camera.updateMatrixWorld()
    }
    clearRoamingInput()
  }

  update(frame?: XRFrame): void {
    const session = this.session
    if (!session || !parkXRView.active || this.disposed) return
    // Closing can stop tracking/rendering. Sample cancellation before the early return,
    // and check once more in finished() if no further XR frame reaches us.
    if (this.ending && this.exitPressed()) this.enterSkewerAfterEnd = false
    if (this.currentScope() !== this.scope || useSession.getState().status !== 'connected') {
      void this.end('공원 연결 상태가 바뀌어 VR을 종료했어요.'); return
    }
    const space = this.gl.xr.getReferenceSpace(), viewer = frame && space ? frame.getViewerPose(space) : null
    if (document.hidden || session.visibilityState !== 'visible' || !viewer || this.ending) {
      this.stationaryAt = null; this.calibrationFrame = -Infinity
      jumpmapXRFeedback.suspend()
      this.movement.update(emptyInput(), this.headYaw, performance.now(), false)
      this.exitArmed = this.guideArmed = this.chatArmed = this.primaryArmed = this.selectArmed = false
      this.headAnchor.visible = false; this.panel.setVisible(false); this.skewerEntry.hide(); this.chat?.hide(); this.omok?.hide(); this.names.hide()
      this.telescope?.hide()
      this.rays.forEach(({ line }) => { line.visible = false }); return
    }
    if (!this.canKeepSession(this.kind)) { void this.end('일반 화면으로 돌아왔어요.'); return }
    const now = performance.now(), transform = viewer.transform
    this.head.set(transform.position.x, transform.position.y, transform.position.z)
    this.rotation.set(transform.orientation.x, transform.orientation.y, transform.orientation.z, transform.orientation.w)
    if (!this.started) {
      this.direction.set(0, 0, -1).applyQuaternion(this.rotation)
      this.headYaw = Math.hypot(this.direction.x, this.direction.z) > .01 ? Math.atan2(-this.direction.x, -this.direction.z) : 0
      this.yaw -= this.headYaw; this.rig.rotation.set(0, this.yaw, 0)
      this.offset.copy(this.head).applyQuaternion(this.rig.quaternion); this.offset.y = 0; this.started = true
    }
    this.direction.set(0, 0, -1).applyQuaternion(this.rotation).applyQuaternion(this.rig.quaternion)
    if (Math.hypot(this.direction.x, this.direction.z) > .01) this.headYaw = Math.atan2(-this.direction.x, -this.direction.z)
    const input = readXRInput(session.inputSources)
    let exit = false, guide = false, chat = false, trigger = false, telescopeTilt = 0
    for (const source of session.inputSources) {
      if (source.gamepad?.mapping !== 'xr-standard') continue
      if (source.handedness === 'right') {
        exit = !!source.gamepad.buttons[5]?.pressed
        telescopeTilt = source.gamepad.axes[3] ?? 0
      }
      if (source.handedness === 'left') {
        guide = !!source.gamepad.buttons[4]?.pressed
        chat = !!source.gamepad.buttons[5]?.pressed
      }
      trigger ||= !!source.gamepad.buttons[0]?.pressed
    }
    const usingTelescope = !!this.telescope?.id
    if (!exit) this.exitArmed = true
    if (exit && this.exitArmed) {
      this.exitArmed = false
      if (usingTelescope) void this.telescope?.close()
      else { void this.end(); return }
    }
    if (!guide) this.guideArmed = true
    if (!chat) this.chatArmed = true
    const playingOmok = this.kind === 'omok'
    if (chat && this.chatArmed && !playingOmok && !usingTelescope && !this.panel.blocking) {
      this.chat ??= new XRChat(this.headAnchor)
      this.chatArmed = false; this.chat.toggle(); this.movement.reset(); this.selectArmed = false
    }
    if (guide && this.guideArmed && !playingOmok && !usingTelescope && !this.chat?.open) { this.guideArmed = false; this.panel.toggleGuide(this.kind === 'park') }
    const avatar = avatars.get(useSession.getState().sessionId)
    if (!avatar) { void this.end('공원 캐릭터 연결을 다시 확인해 주세요.'); return }
    sampleAvatar(avatar, now, this.pose)
    // Server position selects presentation only. Falling/leaving the course must
    // never release the immersive session or its server-confirmed carry protection.
    const kind = playingOmok ? 'omok' : !avatar.swimming && useJumpmap.getState().available && inJumpmapXRRegion(avatar.current) ? 'jumpmap' : 'park'
    if (this.kind !== kind) {
      this.kind = kind
      if (kind === 'jumpmap') jumpmapXRFeedback.start(session)
      else jumpmapXRFeedback.stop()
      useParkXR.setState({ mode: kind })
    }
    this.panel.inCourse = kind === 'jumpmap'
    const comfort = useXRComfort.getState()
    if (this.comfortSettings !== comfort.settings) {
      this.comfortSettings = comfort.settings; this.movement.reset()
    }
    // Count stability from each new request, including another reset while pending.
    // Keep the applied revision separate so calibration remains pending until ready.
    if (this.heightRequestRevision !== comfort.heightRevision) {
      this.heightRequestRevision = comfort.heightRevision; this.stationaryAt = null
    }
    // readXRInput already zeroes raw stick drift inside the radial DEAD_ZONE.
    const stable = now - this.calibrationFrame <= 250 && !avatar.moving && !avatar.swimming
      && !input.forward && !input.strafe && !input.jump
      && Math.hypot(this.pose.x - this.calibrationPose.x, this.pose.y - this.calibrationPose.y,
        this.pose.z - this.calibrationPose.z) < .002
    if (!stable) this.stationaryAt = null
    else if (this.stationaryAt === null || Math.abs(this.head.y - this.stationaryHeadY) > .015) {
      this.stationaryAt = now; this.stationaryHeadY = this.head.y
    }
    this.calibrationPose.set(this.pose.x, this.pose.y, this.pose.z); this.calibrationFrame = now
    if (!this.heightReady || this.heightRevision !== comfort.heightRevision) {
      // 처음 진입은 즉시 보정하고, 플레이 중 재설정은 안내판에서 착지·정지를 기다린다.
      if (!this.heightReady || this.panel.blocking && this.stationaryAt !== null && now - this.stationaryAt >= 400) {
        if (this.heightCalibration.calibrate(this.head.y, comfort.settings)) {
          this.heightReady = true; this.heightRevision = comfort.heightRevision
          setXRHeightNotice(comfort.settings.posture === 'seated' ? '앉기 눈높이를 현재 자세에 맞췄어요.' : 'Quest 바닥 기준의 서기 눈높이예요.')
          this.panel.recenter(); this.movement.reset()
        } else setXRHeightNotice('헤드셋을 착용하고 바닥 추적을 확인해 주세요.')
      } else setXRHeightNotice('착지하고 스틱을 놓으면 눈높이를 맞춰요.')
    }
    this.rig.position.set(this.pose.x - this.offset.x, this.pose.y - .8 + this.heightCalibration.offset, this.pose.z - this.offset.z)
    parkXRView.position.copy(this.head).applyQuaternion(this.rig.quaternion).add(this.rig.position)
    this.panel.update(now, parkXRView.position, this.headYaw, this.rig.position)
    const immersivePanel = playingOmok || usingTelescope || !!this.chat?.open
    if (immersivePanel) this.panel.setVisible(false)
    this.chat?.update(!playingOmok)
    if (playingOmok) this.omok?.update()
    this.skewerEntry.update(avatar.current, parkXRView.position, !this.panel.blocking && !immersivePanel)
    this.telescope?.updateEntry(avatar.current, parkXRView.position,
      kind === 'park' && !this.panel.blocking && !immersivePanel && !avatar.swimming)
    if (this.panelKey !== this.panel.key) {
      this.panelKey = this.panel.key; this.movement.reset(); this.primaryArmed = this.selectArmed = false
    }
    if (!input.jump) this.primaryArmed = true
    if (!trigger) this.selectArmed = true
    const selectNow = trigger && this.selectArmed
    if (trigger) this.selectArmed = false
    if (!immersivePanel && this.panel.blocking && input.jump && this.primaryArmed) { this.primaryArmed = false; this.panel.primary() }
    // Menus stop intent, not XR rendering or authoritative gravity. Idle position
    // heartbeats continue through the same runtime in CLIENT_VALIDATED mode.
    const turn = this.movement.update(this.panel.blocking || immersivePanel ? emptyInput() : input, this.headYaw, now, true,
      localMovement.positionMode, this.comfortSettings)
    if (this.kind === 'jumpmap') jumpmapXRFeedback.update(avatar, !this.panel.blocking && !immersivePanel && !this.ending)
    if (turn) {
      this.direction.copy(this.head).applyQuaternion(this.rig.quaternion)
      this.yaw += turn; this.rig.rotation.set(0, this.yaw, 0)
      this.rotated.copy(this.head).applyQuaternion(this.rig.quaternion)
      this.offset.add(this.rotated.sub(this.direction)); this.offset.y = 0; this.headYaw += turn
    }
    viewControls.yaw = this.headYaw
    this.rig.position.set(this.pose.x - this.offset.x, this.pose.y - .8 + this.heightCalibration.offset, this.pose.z - this.offset.z)
    parkXRView.position.copy(this.head).applyQuaternion(this.rig.quaternion).add(this.rig.position)
    this.camera.position.copy(this.head); this.camera.quaternion.copy(this.rotation)
    this.headAnchor.position.copy(this.head); this.headAnchor.quaternion.copy(this.rotation); this.headAnchor.visible = true
    this.rig.updateMatrixWorld(true)
    if (playingOmok || usingTelescope) this.names.hide()
    else this.names.update(now, parkXRView.position)
    if (usingTelescope) this.telescope?.updateView(this.gl, this.rig, now, input.turn, telescopeTilt)
    let hover: JumpmapXRAction | null = null
    let entryHovered = false
    let telescopeHovered = false
    let chatHover: string | null = null
    let omokHover: ReturnType<OmokXR['hit']> = null
    let selected = false
    const aiming = !usingTelescope && (immersivePanel || this.panel.blocking || this.skewerEntry.visible || !!this.telescope?.entryVisible)
    this.rays.forEach(({ line }) => { line.visible = aiming })
    if (aiming && frame && space) for (const source of session.inputSources) {
      if (source.targetRayMode !== 'tracked-pointer') continue
      const ray = frame.getPose(source.targetRaySpace, space)
      if (!ray) continue
      this.rayOrigin.set(ray.transform.position.x, ray.transform.position.y, ray.transform.position.z).applyMatrix4(this.rig.matrixWorld)
      this.rayRotation.set(ray.transform.orientation.x, ray.transform.orientation.y, ray.transform.orientation.z, ray.transform.orientation.w)
      this.rayDirection.set(0, 0, -1).applyQuaternion(this.rayRotation).applyQuaternion(this.rig.quaternion)
      const pressed = selectNow && !selected && source.gamepad?.buttons[0]?.pressed
      if (playingOmok && this.omok) {
        const cell = this.omok.hit(this.rayOrigin, this.rayDirection)
        if (cell && (!omokHover || source.handedness === 'right')) omokHover = cell
        if (cell && pressed) { selected = true; this.omok.select(cell) }
        continue
      }
      if (this.chat?.open) {
        const action = this.chat.hit(this.rayOrigin, this.rayDirection)
        if (action && (!chatHover || source.handedness === 'right')) chatHover = action
        if (action && pressed) {
          selected = true; this.chat.select(action)
          if (!this.chat.open) this.movement.reset()
        }
        continue
      }
      const action = this.panel.blocking ? this.panel.hit(this.rayOrigin, this.rayDirection) : null
      const entry = !this.panel.blocking && this.skewerEntry.hit(this.rayOrigin, this.rayDirection)
      const telescopeEntry = !this.panel.blocking && this.telescope?.hit(this.rayOrigin, this.rayDirection)
      entryHovered ||= entry
      telescopeHovered ||= !!telescopeEntry
      if (action && (!hover || source.handedness === 'right')) hover = action
      if (action && selectNow && !selected && source.gamepad?.buttons[0]?.pressed) { selected = true; this.panel.activate(action) }
      if (entry && selectNow && !selected && source.gamepad?.buttons[0]?.pressed) { selected = true; this.enterSkewer() }
      if (telescopeEntry && pressed && !selected) { selected = true; this.movement.reset(); void this.telescope?.open() }
    }
    this.panel.setHover(hover)
    this.chat?.setHover(chatHover); this.omok?.setHover(omokHover)
    this.skewerEntry.setHover(entryHovered)
    this.telescope?.setHover(telescopeHovered)
  }

  dispose(): void {
    this.disposed = true
    const session = this.session; this.restore()
    if (session) void session.end().catch(() => undefined)
    window.removeEventListener('ontop-clear-input', this.interrupted)
    window.removeEventListener('ontop-browser-interrupt', this.interrupted)
    document.removeEventListener('visibilitychange', this.interrupted); this.unsubscribe()
    for (const { grip, model } of this.handles) { disposeTouchModel(model); grip.removeFromParent() }
    for (const { target, line } of this.rays) { target.removeFromParent(); line.removeFromParent(); line.geometry.dispose(); line.material.dispose() }
    this.rig.removeFromParent(); this.panel.dispose(); this.skewerEntry.dispose()
    this.chat?.dispose(); this.omok?.dispose(); this.names.dispose()
    this.telescope?.dispose()
  }
}
