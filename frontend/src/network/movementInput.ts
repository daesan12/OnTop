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
 * A stop cancels an unsent jump; reset never replays input into a new connection.
 */
export class MovementInputBuffer {
  private lastSent = -Infinity
  private pending: { intent: MovementIntent; scope: string } | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(
    private readonly send: (intent: MovementIntent, scope: string) => void,
    private readonly now = () => performance.now(),
  ) {}
  enqueue(intent: MovementIntent, scope: string) {
    const previous = this.pending
    this.pending = { scope, intent: { ...intent,
      jump: !stoppedIntent(intent) && (intent.jump || (previous?.scope === scope && previous.intent.jump) || false) } }
    if (this.timer !== undefined) return
    const delay = Math.max(0, MOVEMENT_INPUT_INTERVAL_MS - (this.now() - this.lastSent))
    if (!delay) this.flush()
    else this.timer = setTimeout(() => this.flush(), delay)
  }
  private flush() {
    this.timer = undefined
    const next = this.pending
    this.pending = undefined
    if (!next) return
    this.lastSent = this.now()
    this.send(next.intent, next.scope)
  }
  clear(resetCadence = true) {
    clearTimeout(this.timer)
    this.timer = undefined
    this.pending = undefined
    if (resetCadence) this.lastSent = -Infinity
  }
}
