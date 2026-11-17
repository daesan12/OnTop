import { Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D, type Scene, type Vector3 } from 'three'
import { XRCanvas } from '../parkXR/XRCanvas'
import { paintGuideButton, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'
import { balloonEntrance, canReachBalloonDoor } from './boarding'
import { BALLOON_FARE, type Point } from './flight'
import { boardLocalBalloon, cancelLocalBalloon, openLocalBalloon, returnLocalBalloon, useLocalBalloon, XR_DOCK_HANDOFF_SECONDS } from './localRide'

const ticketLabel = `자동 비행 탑승 · ${BALLOON_FARE}냥`

export class BalloonXR {
  private readonly entry = new XRCanvas(1024, 270, 1.45)
  private readonly status = new XRCanvas(1000, 118, 1)
  private readonly dockFade = new Mesh(new PlaneGeometry(2, 2),
    new MeshBasicMaterial({ color: '#101912', transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
  private hovered = false
  private entryText = ''
  private statusText = ''

  constructor(scene: Scene, head: Object3D) {
    this.entry.mesh.name = 'park-xr-balloon-entry'
    this.status.mesh.name = 'park-xr-balloon-status'
    this.status.mesh.position.set(0, -.45, -1.38)
    this.dockFade.position.z = -.25
    this.dockFade.renderOrder = 10030
    this.dockFade.visible = false
    scene.add(this.entry.mesh)
    head.add(this.status.mesh, this.dockFade)
  }

  get active() { return useLocalBalloon.getState().xrSightseeing }
  get entryVisible() { return this.entry.mesh.visible }

  update(position: Point, eye: Vector3, allowed: boolean) {
    const { flight, panel, paymentError, xrSightseeing } = useLocalBalloon.getState()
    this.entry.mesh.visible = allowed && !flight && canReachBalloonDoor(position)
    if (balloonEntrance && this.entryVisible) {
      const { x, y, z } = balloonEntrance
      this.entry.mesh.position.set(x, y + 1.05, z - 1.1)
      const entry = this.entry.mesh.position
      this.entry.mesh.rotation.y = Math.atan2(eye.x - entry.x, eye.z - entry.z)
      this.entry.mesh.updateMatrixWorld(true)
      const label = xrSightseeing && panel === 'loading' ? '열기구 준비 중…'
        : xrSightseeing && panel === 'paying' ? '결제 확인 중…'
        : xrSightseeing && panel === 'error' ? '준비 실패 · 다시 시도'
        : xrSightseeing && paymentError ? '탑승 다시 시도 · 검지 트리거'
        : ticketLabel
      this.paintEntry(label, xrSightseeing ? paymentError : '')
    }
    this.status.mesh.visible = xrSightseeing && !!flight
    // Cover the handoff from the docked basket to the ground avatar on the platform.
    const fromHandoff = flight?.phase === 'landed' ? flight.seconds - XR_DOCK_HANDOFF_SECONDS : Infinity
    const fade = Math.max(0, Math.min(1, (fromHandoff + .55) / .45, (.45 - fromHandoff) / .35))
    this.dockFade.visible = xrSightseeing && fade > 0
    this.dockFade.material.opacity = fade
    const label = flight?.phase === 'returning' ? '승강장으로 돌아가는 중'
      : flight?.phase === 'landed' ? '승강장 도착 · 내리는 중'
      : '자동 비행 · B 승강장 복귀'
    if (this.status.mesh.visible && label !== this.statusText) {
      this.statusText = label
      const ctx = this.status.canvas.getContext('2d')!
      ctx.clearRect(0, 0, 1000, 118)
      ctx.textAlign = 'center'
      paintGuideButton(ctx, 4, 4, 992, 110, label, false)
      this.status.texture.needsUpdate = true
    }
  }

  hit(origin: Vector3, direction: Vector3) { return !!this.entry.point(origin, direction) }

  select() {
    const { xrSightseeing, panel } = useLocalBalloon.getState()
    if (!xrSightseeing) openLocalBalloon(true)
    else if (panel === 'board') void boardLocalBalloon({ capacity: 1 })
    else if (panel === 'error') {
      cancelLocalBalloon()
      openLocalBalloon(true)
    }
  }

  back() {
    const { flight, panel } = useLocalBalloon.getState()
    if (flight) returnLocalBalloon()
    else if (panel !== 'paying') cancelLocalBalloon()
  }

  setHover(value: boolean) { this.hovered = value }

  private paintEntry(label: string, error: string) {
    const key = `${label}|${error}|${this.hovered}`
    if (this.entryText === key) return
    this.entryText = key
    const ctx = this.entry.canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1024, 270)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#1d3827'
    ctx.beginPath(); ctx.roundRect(0, 0, 1024, 270, 35); ctx.fill()
    paintGuideButton(ctx, 14, 14, 996, 155, label, this.hovered)
    ctx.fillStyle = TOUCH_GUIDE_COLORS.gold
    ctx.font = '600 36px "Malgun Gothic", sans-serif'
    ctx.fillText(error || '검지 트리거 선택 · 기내에서 고개로 둘러보기', 512, 227, 950)
    this.entry.texture.needsUpdate = true
  }

  hide() { this.entry.mesh.visible = this.status.mesh.visible = this.dockFade.visible = false; this.hovered = false }

  dispose() {
    this.entry.dispose(); this.status.dispose()
    this.dockFade.removeFromParent(); this.dockFade.geometry.dispose(); this.dockFade.material.dispose()
  }
}
