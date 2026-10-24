/** Existing FE cadence (BE default minimum is 50ms); this does not set server physics rates. */
export const MOVEMENT_INPUT_INTERVAL_MS = 60
export interface MovementIntent { dx: number; dz: number; run: boolean; jump: boolean }
export const stoppedIntent = (intent: MovementIntent) => !intent.dx && !intent.dz && !intent.jump

/** Camera-relative intent only. No positions, dt, jump height or swimming authority. */
export function cameraRelativeMove(
  forward: number, side: number, yaw: number, run: boolean, jump: boolean, target: MovementIntent,
) {
  const length = Math.max(1, Math.hypot(forward, side))
  target.dx = Math.max(-1, Math.min(1, (side * Math.cos(yaw) - forward * Math.sin(yaw)) / length))
  target.dz = Math.max(-1, Math.min(1, (-side * Math.sin(yaw) - forward * Math.cos(yaw)) / length))
  target.run = run
  target.jump = jump
  return target
}
export function normalizedMove(dx: number, dz: number, run: boolean, jump: boolean): MovementIntent | null {
  if (![dx, dz].every(Number.isFinite) || Math.abs(dx) > 1 || Math.abs(dz) > 1
    || typeof run !== 'boolean' || typeof jump !== 'boolean') return null
  const length = Math.max(1, Math.hypot(dx, dz))
  return { dx: dx / length, dz: dz / length, run, jump }
}

/** Coalesce quick changes without violating the existing input cadence.
 * Async delivery waits for the server reply, then spaces the next input from that reply.
 * This prevents delayed packets from arriving as a burst, even when local sends were spaced.
 * A stop cancels an unsent jump; reset never replays input into a new connection.
 */
export class MovementInputBuffer {
  private lastSent = -Infinity
  private pending: { intent: MovementIntent; scope: string } | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private inFlight = false
  private delivery = 0
  constructor(
    private readonly send: (intent: MovementIntent, scope: string) => void | Promise<void>,
    private readonly now = () => performance.now(),
  ) {}
  enqueue(intent: MovementIntent, scope: string) {
    const previous = this.pending
    this.pending = { scope, intent: { ...intent,
      jump: !stoppedIntent(intent) && (intent.jump || (previous?.scope === scope && previous.intent.jump) || false) } }
    if (this.timer === undefined && !this.inFlight) this.flush()
  }
  private flush() {
    this.timer = undefined
    if (!this.pending || this.inFlight) return
    // Timers may fire before a fractional delay has fully elapsed. Recheck the clock.
    const delay = MOVEMENT_INPUT_INTERVAL_MS - (this.now() - this.lastSent)
    if (delay > 0) {
      this.timer = setTimeout(() => this.flush(), Math.ceil(delay))
      return
    }
    const next = this.pending
    this.pending = undefined
    this.lastSent = this.now()
    const response = this.send(next.intent, next.scope)
    if (response) {
      const delivery = ++this.delivery
      this.inFlight = true
      const complete = () => {
        if (delivery !== this.delivery) return
        this.inFlight = false
        this.lastSent = this.now()
        this.flush()
      }
      void response.then(complete, complete)
    }
  }
  clear(resetCadence = true) {
    clearTimeout(this.timer)
    this.timer = undefined
    this.pending = undefined
    if (resetCadence) {
      ++this.delivery
      this.inFlight = false
      this.lastSent = -Infinity
    }
  }
}
