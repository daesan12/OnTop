import { cameraRelativeMove, MOVEMENT_INPUT_INTERVAL_MS, type MovementIntent } from '../../network/movementInput'
import { DEAD_ZONE, InputLatch, emptyInput, type MoveInput } from '../../world/xrInput'

/** Maximum 60 degrees/second; light stick deflection gives fine aiming. */
export const PARK_TURN_SPEED = Math.PI / 3

export interface XRMovementPort { move(dx: number, dz: number, run: boolean, jump?: boolean): void; stopMovement(): void }

/** Reuses the normal park intent path. No coordinates, physics or synthetic keyboard events. */
export class ParkXRMovement {
  private readonly latch = new InputLatch()
  private readonly intent: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }
  private armed = false
  private moving = false
  private running = false
  private lastSend = -Infinity
  private turnArmed = false
  private turnAt: number | null = null
  constructor(private readonly port: XRMovementPort, private readonly onJump?: () => void) {}
  reset(): void {
    this.latch.reset(); this.armed = false; this.moving = this.running = false; this.lastSend = -Infinity
    this.turnArmed = false; this.turnAt = null
    this.port.stopMovement()
  }
  update(input: MoveInput, yaw: number, now: number, allowed: boolean, positionMode = false): number {
    if (!allowed || !Number.isFinite(yaw) || !Number.isFinite(now)) {
      if (this.armed || this.moving) this.port.stopMovement()
      this.latch.reset(); this.armed = false; this.moving = this.running = false; this.lastSend = -Infinity
      this.turnArmed = false; this.turnAt = null
      return 0
    }
    if (!Math.hypot(input.strafe, input.forward)) this.armed = true
    const action = this.latch.sample(input)
    const dt = this.turnAt === null ? 0 : Math.min(50, Math.max(0, now - this.turnAt)) / 1000
    this.turnAt = now
    const axis = Number.isFinite(input.turn) ? Math.max(-1, Math.min(1, input.turn)) : 0
    if (Math.abs(axis) <= DEAD_ZONE) this.turnArmed = true
    const strength = Math.max(0, (Math.abs(axis) - DEAD_ZONE) / (1 - DEAD_ZONE))
    const turn = this.turnArmed ? -Math.sign(axis) * strength * strength * PARK_TURN_SPEED * dt : 0
    const move = this.armed ? input : emptyInput()
    cameraRelativeMove(move.forward, move.strafe, yaw + turn, !!move.run, action.jump, this.intent)
    const moving = !!(this.intent.dx || this.intent.dz)
    const running = moving && !!move.run
    if (action.jump || moving !== this.moving || running !== this.running || now - this.lastSend >= MOVEMENT_INPUT_INTERVAL_MS) {
      if (moving || action.jump || this.moving || positionMode) {
        this.port.move(this.intent.dx, this.intent.dz, running, action.jump)
        if (action.jump) this.onJump?.()
        this.lastSend = now
      }
    }
    this.moving = moving
    this.running = running
    return turn
  }
}
