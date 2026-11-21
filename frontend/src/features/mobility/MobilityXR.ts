import type { Object3D, Scene, Vector3 } from 'three'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput } from '../../world/inputOwnership'
import { XRCanvas } from '../parkXR/XRCanvas'
import { paintGuideButton, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'
import { HOLD_MS, rentalCapability, useMobility, vehicles, type RentalTarget, type Vehicle } from './state'
import { canReachRental, rentalTargets } from './targets'

type Position = RentalTarget['reach']
type Selection = { target: RentalTarget; source: XRInputSource }

export class MobilityXR {
  private readonly status = new XRCanvas(960, 116, 1)
  private readonly entries = {
    BICYCLE: { canvas: new XRCanvas(800, 196, 1), target: null as RentalTarget | null, key: '' },
    SCOOTER: { canvas: new XRCanvas(800, 196, 1), target: null as RentalTarget | null, key: '' },
  }
  private hold: (Selection & { startedAt: number }) | null = null
  private leaseId = ''
  private statusKey = ''

  constructor(scene: Scene, head: Object3D) {
    for (const [kind, entry] of Object.entries(this.entries)) {
      entry.canvas.mesh.name = `park-xr-rental-${kind.toLowerCase()}`
      scene.add(entry.canvas.mesh)
    }
    this.status.mesh.position.set(0, -.45, -1.5)
    this.status.mesh.name = 'park-xr-mobility-status'
    head.add(this.status.mesh)
  }

  get holding() { return !!this.hold }
  get entryVisible() { return Object.values(this.entries).some(entry => entry.canvas.mesh.visible) }
  get active() {
    const state = useMobility.getState()
    return !!this.leaseId && state.leaseId === this.leaseId && state.phase !== 'idle'
  }
  get readyToMove() {
    return this.active && useMobility.getState().phase === 'riding' && !!useMobility.getState().vehicle
  }

  update(position: Position, eye: Vector3, allowed: boolean) {
    const state = useMobility.getState()
    for (const [kind, entry] of Object.entries(this.entries)) {
      let closest: RentalTarget | null = null
      let best = Infinity
      if (allowed && rentalCapability.xrAvailable && state.phase === 'idle') {
        for (const target of rentalTargets) {
          if (target.vehicle !== kind || !canReachRental(position, target)) continue
          const distance = Math.hypot(position.x - target.reach.x, position.z - target.reach.z)
          if (distance < best) { closest = target; best = distance }
        }
      }
      entry.target = closest
      const mesh = entry.canvas.mesh
      mesh.visible = !!closest
      if (!closest) continue
      const center = closest.center
      mesh.position.set(center.x, center.y + 1.65, center.z)
      mesh.rotation.y = Math.atan2(eye.x - center.x, eye.z - center.z)
      mesh.updateMatrixWorld(true)
    }
    const label = (this.active || state.phase === 'idle' && this.leaseId) && state.notice
      || (this.active && state.phase === 'starting' ? '탑승 확인 중… · B 취소'
      : this.active && state.phase === 'ending' ? '하차 확인 중…'
      : this.active && state.vehicle ? `${vehicles[state.vehicle].label} · ${state.total}냥 · B 하차` : '')
    this.status.mesh.visible = !!label
    if (label && label !== this.statusKey) {
      this.statusKey = label
      const ctx = this.status.canvas.getContext('2d')!
      ctx.clearRect(0, 0, 960, 116)
      paintGuideButton(ctx, 4, 4, 952, 108, label, false)
      this.status.texture.needsUpdate = true
    }
  }

  hit(origin: Vector3, direction: Vector3, source: XRInputSource) {
    if (this.hold && this.hold.source !== source) return null
    for (const entry of Object.values(this.entries)) {
      if (entry.target && entry.canvas.point(origin, direction)) return { target: entry.target, source }
    }
    return null
  }

  select(selection: Selection | null, started: boolean, now: number) {
    let progress = 0
    const pressed = selection?.source.gamepad?.buttons[0]?.pressed
    if (!selection || !pressed || this.hold && this.hold.target !== selection.target) this.hold = null
    else {
      if (started) this.hold = { ...selection, startedAt: now }
      if (this.hold) {
        progress = Math.min(1, (now - this.hold.startedAt) / HOLD_MS)
        if (progress >= 1 && parkRuntime.rentVehicle && rentalCapability.xrAvailable && useMobility.getState().phase === 'idle') {
          this.leaseId = crypto.randomUUID()
          useMobility.setState({ phase: 'starting', leaseId: this.leaseId, target: null, holdAt: null, notice: '', total: 0 })
          clearRoamingInput()
          void parkRuntime.rentVehicle(selection.target, this.leaseId)
          this.hold = null
        }
      }
    }
    for (const [kind, entry] of Object.entries(this.entries)) {
      if (!entry.canvas.mesh.visible) continue
      const hovered = selection?.target === entry.target
      const fill = hovered ? Math.floor(progress * 20) : 0
      const key = `${hovered}|${fill}`
      if (entry.key === key) continue
      entry.key = key
      const ctx = entry.canvas.canvas.getContext('2d')!
      const vehicle = vehicles[kind as Vehicle]
      ctx.clearRect(0, 0, 800, 196)
      paintGuideButton(ctx, 4, 4, 792, 182, `${vehicle.label} · ${vehicle.billingSeconds}초에 ${vehicle.rate}냥`, hovered)
      ctx.fillStyle = TOUCH_GUIDE_COLORS.gold
      ctx.textAlign = 'center'
      ctx.font = '600 25px "Malgun Gothic", sans-serif'
      ctx.fillText('검지 트리거 길게', 400, 151)
      ctx.fillRect(35, 172, 730 * fill / 20, 5)
      entry.canvas.texture.needsUpdate = true
    }
  }

  endRental() {
    if (!this.active || useMobility.getState().phase === 'ending') return
    useMobility.setState({ phase: 'ending' })
    clearRoamingInput()
    void parkRuntime.endVehicleRental?.(this.leaseId)
  }

  hide() {
    this.hold = null
    for (const entry of Object.values(this.entries)) entry.canvas.mesh.visible = false
    this.status.mesh.visible = false
  }

  dispose() {
    for (const entry of Object.values(this.entries)) entry.canvas.dispose()
    this.status.dispose()
  }
}
