import * as THREE from 'three'
import { canReachParkVr, parkVrEntrance } from '../vrZone/parkBridge'
import { paintGuideButton, paintGuidePaper, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'

/** A world-space entrance button, never a head-locked prompt or keyboard shortcut. */
export class SkewerXREntry {
  private readonly canvas = document.createElement('canvas')
  private readonly texture = new THREE.CanvasTexture(this.canvas)
  private readonly material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true,
    depthTest: false, depthWrite: false, toneMapped: false })
  private readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .3), this.material)
  private readonly paper = new Image()
  private readonly raycaster = new THREE.Raycaster()
  private readonly hits: THREE.Intersection[] = []
  private hovered = false
  get visible() { return this.mesh.visible }

  constructor(scene: THREE.Scene) {
    this.canvas.width = 1536; this.canvas.height = 384
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.mesh.name = 'park-xr-skewer-entry'; this.mesh.renderOrder = 10005
    this.mesh.position.set(parkVrEntrance.x - Math.sin(parkVrEntrance.yaw) * .9,
      parkVrEntrance.y + .7, parkVrEntrance.z - Math.cos(parkVrEntrance.yaw) * .9)
    this.mesh.visible = false; scene.add(this.mesh)
    this.paper.onload = () => this.paint(); this.paper.src = '/art/tablet/hanji.webp'
    this.paint()
  }

  update(position: { x: number; y: number; z: number }, eye: THREE.Vector3, allowed: boolean) {
    this.mesh.visible = allowed && canReachParkVr(position)
    if (!this.visible) { this.setHover(false); return }
    this.mesh.rotation.y = Math.atan2(eye.x - this.mesh.position.x, eye.z - this.mesh.position.z)
    this.mesh.updateMatrixWorld(true)
  }
  hide() { this.mesh.visible = false; this.setHover(false) }
  hit(origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    if (!this.visible) return false
    this.raycaster.set(origin, direction); this.hits.length = 0
    this.raycaster.intersectObject(this.mesh, false, this.hits)
    const uv = this.hits[0]?.uv
    return !!uv && uv.x >= 56 / 1536 && uv.x <= 1480 / 1536 && uv.y >= 56 / 384 && uv.y <= 246 / 384
  }
  setHover(hovered: boolean) {
    if (hovered === this.hovered) return
    this.hovered = hovered; this.paint()
  }
  private paint() {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    paintGuidePaper(ctx, 384, this.paper)
    ctx.fillStyle = TOUCH_GUIDE_COLORS.ink; ctx.font = '700 54px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('온탑 꼬치왕 · 2인 협동', 768, 90)
    paintGuideButton(ctx, 56, 138, 1424, 190, '꼬치왕 입장 · 검지 트리거', this.hovered)
    this.texture.needsUpdate = true
  }
  dispose() {
    this.paper.onload = null; this.mesh.removeFromParent()
    this.mesh.geometry.dispose(); this.material.dispose(); this.texture.dispose()
  }
}
