import * as THREE from 'three'
import { useSession, type Pose } from '../../network/worldClient'
import { CAMERA, TELESCOPE, TELESCOPES, telescopeFov } from '../../park/mapConfig'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { stick } from '../../world/xrInput'
import { facilityAvailable, useFacilityState } from '../facilities/state'
import { XRCanvas } from '../parkXR/XRCanvas'
import { telescopeView } from '../telescopeView'
import { paintGuideButton, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'
import { canReachTelescope, findTelescope, normalizeTelescopeAim } from './anchors'
import { aimTelescope, enterTelescope, leaveTelescope } from './controller'

const DRAW_INTERVAL = 1000 / 15

export class TelescopeXR {
  private readonly entry = new XRCanvas(768, 192, 1.05)
  private readonly caption = new XRCanvas(1024, 144, 1.15)
  private readonly target = new THREE.WebGLRenderTarget(640, 640)
  private readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, .1, 800)
  private readonly view = new THREE.Group()
  private readonly lens = new THREE.Mesh(new THREE.CircleGeometry(.65, 80),
    new THREE.MeshBasicMaterial({ map: this.target.texture, transparent: true, depthTest: false, depthWrite: false }))
  private readonly shade = new THREE.Mesh(new THREE.RingGeometry(.65, 2.5, 80),
    new THREE.MeshBasicMaterial({ color: '#101910', transparent: true, opacity: .87, depthTest: false, depthWrite: false }))
  private readonly rim = new THREE.Mesh(new THREE.RingGeometry(.643, .655, 80),
    new THREE.MeshBasicMaterial({ color: TOUCH_GUIDE_COLORS.gold, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }))
  private candidate = ''
  private hovered = false
  private operation: '' | 'enter' | 'leave' = ''
  private exitRequested = false
  private lastDraw = -Infinity
  private lastAim = 0
  private captionText = ''
  private notice = ''
  id = ''

  constructor(private readonly scene: THREE.Scene, head: THREE.Object3D) {
    this.camera.userData.showConstellationLines = true
    this.entry.mesh.name = 'park-xr-telescope-entry'
    scene.add(this.entry.mesh)
    this.view.name = 'park-xr-telescope-view'
    this.view.position.z = -1.45
    this.view.visible = false
    head.add(this.view)
    this.lens.name = 'park-xr-telescope-lens'
    this.lens.renderOrder = 10020
    this.shade.renderOrder = 10021
    this.rim.renderOrder = 10022
    this.caption.mesh.position.set(0, -.59, 0)
    this.caption.mesh.renderOrder = 10023
    this.caption.mesh.visible = true
    this.view.add(this.lens, this.shade, this.rim, this.caption.mesh)
    this.paintEntry()
  }

  get entryVisible() { return this.entry.mesh.visible }
  private get occupied() { return !!this.id && useSession.getState().telescopeId === this.id }

  updateEntry(position: Pose, eye: THREE.Vector3, allowed: boolean) {
    const occupancies = Object.values(useFacilityState.getState().occupancies)
    let distance = Infinity
    let next: ReturnType<typeof findTelescope>
    if (allowed) for (const telescope of TELESCOPES) {
      if (!facilityAvailable(telescope.id) || !canReachTelescope(position, telescope.id)
        || occupancies.some(lease => lease.facilityId === telescope.id)) continue
      const gap = Math.hypot(position.x - telescope.position[0], position.z - telescope.position[2])
      if (gap < distance) { next = telescope; distance = gap }
    }
    this.candidate = next?.id ?? ''
    this.entry.mesh.visible = !!next
    if (!next) { this.setHover(false); return }
    const [x, y, z] = next.position
    this.entry.mesh.position.set(x, y + 1.95, z)
    this.entry.mesh.rotation.y = Math.atan2(eye.x - x, eye.z - z)
    this.entry.mesh.updateMatrixWorld(true)
  }

  hit(origin: THREE.Vector3, direction: THREE.Vector3) {
    return !!this.entry.point(origin, direction)
  }

  setHover(hovered: boolean) {
    if (this.hovered === hovered) return
    this.hovered = hovered
    this.paintEntry()
  }

  private paintEntry() {
    const ctx = this.entry.canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 768, 192)
    ctx.textAlign = 'center'
    paintGuideButton(ctx, 8, 8, 752, 176, this.notice || '망원경 이용 · 검지 트리거', this.hovered)
    this.entry.texture.needsUpdate = true
  }

  async open() {
    if (!this.candidate || this.id || this.operation) return
    this.id = this.candidate
    this.operation = 'enter'
    this.exitRequested = false
    this.notice = ''
    const entered = await enterTelescope(this.id)
    this.operation = ''
    if (!entered && !this.occupied) {
      this.id = ''
      this.notice = '망원경 이용 실패 · 다시 선택'
      this.paintEntry()
    }
    this.lastDraw = -Infinity
    this.lastAim = 0
    if (this.exitRequested) void this.close()
  }

  async close() {
    this.exitRequested = true
    if (this.operation) return
    if (!this.occupied) { this.id = ''; this.hide(); return }
    this.operation = 'leave'
    const released = await leaveTelescope()
    this.operation = ''
    this.notice = released || !this.occupied ? '' : '나오기 실패 · B로 다시 시도'
    if (!this.occupied) { this.id = ''; this.hide() }
  }

  updateView(renderer: THREE.WebGLRenderer, rig: THREE.Object3D, now: number, x: number, y: number) {
    if (!this.id) return
    const telescope = findTelescope(this.id)
    this.view.visible = this.occupied && this.operation !== 'enter'
    if (!this.view.visible || !telescope) {
      if (!this.operation && !this.occupied) this.id = ''
      return
    }
    const dt = Math.min(.05, Math.max(0, (now - (this.lastAim || now)) / 1000))
    this.lastAim = now
    if (!this.operation) {
      const [horizontal, vertical] = stick(x, y)
      if (horizontal || vertical) Object.assign(telescopeView, normalizeTelescopeAim(
        telescopeView.yaw - horizontal * dt * .55, telescopeView.pitch - vertical * dt * .55))
    }
    const label = this.operation === 'leave' ? '공원 시야로 돌아가는 중…'
      : this.notice || '오른쪽 스틱 방향 조절 · B 공원 시야'
    if (this.captionText !== label) {
      const ctx = this.caption.canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, 1024, 144)
        ctx.fillStyle = '#152319'
        ctx.beginPath(); ctx.roundRect(0, 0, 1024, 144, 32); ctx.fill()
        ctx.fillStyle = '#fff5dc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = '700 49px "Malgun Gothic", sans-serif'; ctx.fillText(label, 512, 73)
        this.caption.texture.needsUpdate = true
      }
      this.captionText = label
    }
    if (now - this.lastDraw < DRAW_INTERVAL) return
    if (!this.operation) void aimTelescope()
    const { yaw, pitch, zoom } = telescopeView
    const [lensX, lensY, lensZ] = telescope.position
    const eyeY = lensY + TELESCOPE.eyeHeight + (RENEWAL_PARK_ENABLED ? .44 : 0)
    this.camera.position.set(lensX, eyeY, lensZ)
    this.camera.lookAt(lensX + Math.sin(yaw) * Math.cos(pitch), eyeY + Math.sin(pitch),
      lensZ + Math.cos(yaw) * Math.cos(pitch))
    this.camera.fov = telescopeFov(CAMERA.fov, zoom)
    this.camera.updateProjectionMatrix()
    const target = renderer.getRenderTarget(), xr = renderer.xr.enabled, clear = renderer.autoClear
    const visible = rig.visible
    try {
      // Render the optics with their own camera while the tracked view stays in stereo.
      renderer.xr.enabled = false; renderer.autoClear = true; rig.visible = false
      renderer.setRenderTarget(this.target); renderer.render(this.scene, this.camera)
      this.lastDraw = now
    } finally {
      renderer.setRenderTarget(target)
      renderer.xr.enabled = xr; renderer.autoClear = clear; rig.visible = visible
    }
  }

  hide() {
    this.entry.mesh.visible = false
    this.view.visible = false
    this.lastAim = 0
  }

  dispose() {
    this.entry.dispose(); this.caption.dispose(); this.target.dispose()
    this.view.removeFromParent()
    for (const mesh of [this.lens, this.shade, this.rim]) {
      mesh.geometry.dispose(); mesh.material.dispose()
    }
  }
}
