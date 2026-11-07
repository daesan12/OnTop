import type { Point } from '../plan'

/** Presentation only: server collision and interaction positions are never changed. */
export class HallMotion {
  readonly position = { x: 0, z: 0 }
  yaw = 0
  moving = false
  private initialized = false
  private walkingTail = 0
  private readonly previousTarget = { x: 0, z: 0 }
  private targetYaw = 0

  update(target: Point, seconds: number, paused = false, interpolated = false) {
    const dt = Math.min(.1, Math.max(0, seconds))
    const dx = target.x - this.position.x, dz = target.z - this.position.z
    const distance = Math.hypot(dx, dz)
    const travelX = target.x - this.previousTarget.x, travelZ = target.z - this.previousTarget.z
    this.previousTarget.x = target.x; this.previousTarget.z = target.z
    if (!this.initialized || distance > 3) {
      this.position.x = target.x; this.position.z = target.z
      this.initialized = true; this.walkingTail = 0; this.moving = false
      this.targetYaw = this.yaw
      return
    }
    if (paused) { this.moving = false; this.walkingTail = 0; return }
    // Face authoritative travel, not the residual distance of the rendered position.
    // A quick reversal can arrive while the displayed character is still catching up.
    if (Math.hypot(travelX, travelZ) > .001) this.targetYaw = Math.atan2(travelX, travelZ)
    const turn = Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw))
    this.yaw += turn * (1 - Math.exp(-dt * 48))
    if (distance > .025) this.walkingTail = .06
    else this.walkingTail = Math.max(0, this.walkingTail - dt)
    // PositionPlayback/로컬 프레임 이동은 이미 연속 좌표다. 다시 보간하면 회전 경로가 줄어든다.
    const blend = interpolated ? 1 : 1 - Math.exp(-dt * 30)
    this.position.x += dx * blend; this.position.z += dz * blend
    this.moving = this.walkingTail > 0
  }
}
