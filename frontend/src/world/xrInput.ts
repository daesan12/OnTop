/** Verified Quest Touch inputs shared by the standalone test and park. No movement physics. */
export const DEAD_ZONE = 0.18
export const SNAP_ANGLE = Math.PI / 6
export interface MoveInput { strafe: number; forward: number; jump: boolean; turn: number; run?: boolean }
export const emptyInput = (): MoveInput => ({ strafe: 0, forward: 0, jump: false, turn: 0 })
export function stick(x: number, y: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0]
  const length = Math.hypot(x, y)
  if (length <= DEAD_ZONE) return [0, 0]
  const magnitude = (Math.min(1, length) - DEAD_ZONE) / (1 - DEAD_ZONE)
  return [x / length * magnitude, y / length * magnitude]
}
export function readXRInput(sources: Iterable<Pick<XRInputSource, 'handedness' | 'gamepad'>>): MoveInput {
  const input = emptyInput()
  for (const source of sources) {
    const pad = source.gamepad
    if (!pad || pad.mapping !== 'xr-standard') continue
    if (source.handedness === 'left') {
      const [x, y] = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0)
      input.strafe = x; input.forward = -y
      input.run = !!pad.buttons[1]?.pressed
    }
    if (source.handedness === 'right') {
      input.jump = !!pad.buttons[4]?.pressed
      input.turn = Number.isFinite(pad.axes[2]) ? pad.axes[2] : 0
    }
  }
  return input
}
/** Held buttons must be released after entry, tracking loss, or UI interruption. */
export class InputLatch {
  private jumpArmed = false
  private turnArmed = false
  reset(): void { this.jumpArmed = false; this.turnArmed = false }
  sample(input: MoveInput): { jump: boolean; turn: number } {
    if (!input.jump) this.jumpArmed = true
    const jump = input.jump && this.jumpArmed
    if (input.jump) this.jumpArmed = false
    if (Math.abs(input.turn) < 0.3) this.turnArmed = true
    const turn = this.turnArmed && Math.abs(input.turn) > 0.7 ? -Math.sign(input.turn) * SNAP_ANGLE : 0
    if (turn) this.turnArmed = false
    return { jump, turn }
  }
}
