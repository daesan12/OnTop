import type { Point } from '../plan'

/** Presentation only: server collision and interaction positions are never changed. */
export class HallMotion {
  readonly position = { x: 0, z: 0 }
  yaw = 0
  moving = false
  private initialized = false
  private walkingTail = 0

  update(target: Point, seconds: number, paused = false) {
    const dt = Math.min(.1, Math.max(0, seconds))
    const dx = target.x - this.position.x, dz = target.z - this.position.z
    const distance = Math.hypot(dx, dz)
    if (!this.initialized || distance > 3) {
      this.position.x = target.x; this.position.z = target.z
      this.initialized = true; this.walkingTail = 0; this.moving = false
      return
    }
    if (paused) { this.moving = false; this.walkingTail = 0; return }
    if (distance > .025) {
      this.walkingTail = .14
      const targetYaw = Math.atan2(dx, dz)
      const turn = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw))
      this.yaw += turn * (1 - Math.exp(-dt * 16))
    } else this.walkingTail = Math.max(0, this.walkingTail - dt)
    const blend = 1 - Math.exp(-dt * 18)
    this.position.x += dx * blend; this.position.z += dz * blend
    this.moving = this.walkingTail > 0
  }
}
