import { cameraRelativeMove, MOVEMENT_INPUT_INTERVAL_MS, type MovementIntent } from '../../network/movementInput'
import { InputLatch, emptyInput, type MoveInput } from '../../world/xrInput'

export interface XRMovementPort { move(dx: number, dz: number, run: boolean, jump?: boolean): void; stopMovement(): void }

/** Reuses the normal park intent path. No coordinates, physics or synthetic keyboard events. */
export class ParkXRMovement {
  private readonly latch = new InputLatch()
  private readonly intent: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }
  private armed = false
  private moving = false
  private running = false
  private lastSend = -Infinity
  constructor(private readonly port: XRMovementPort) {}
  reset(): void {
    this.latch.reset(); this.armed = false; this.moving = this.running = false; this.lastSend = -Infinity
    this.port.stopMovement()
  }
  update(input: MoveInput, yaw: number, now: number, allowed: boolean, positionMode = false): number {
    if (!allowed || !Number.isFinite(yaw) || !Number.isFinite(now)) {
      if (this.armed || this.moving) this.port.stopMovement()
      this.latch.reset(); this.armed = false; this.moving = this.running = false; this.lastSend = -Infinity
      return 0
    }
    if (!Math.hypot(input.strafe, input.forward)) this.armed = true
    const action = this.latch.sample(input)
    const move = this.armed ? input : emptyInput()
    cameraRelativeMove(move.forward, move.strafe, yaw + action.turn, !!move.run, action.jump, this.intent)
    const moving = !!(this.intent.dx || this.intent.dz)
    const running = moving && !!move.run
    if (action.jump || moving !== this.moving || running !== this.running || now - this.lastSend >= MOVEMENT_INPUT_INTERVAL_MS) {
      if (moving || action.jump || this.moving || positionMode) {
        this.port.move(this.intent.dx, this.intent.dz, running, action.jump)
        this.lastSend = now
      }
    }
    this.moving = moving
    this.running = running
    return action.turn
  }
}
