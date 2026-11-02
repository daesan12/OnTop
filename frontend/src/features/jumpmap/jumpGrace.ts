export const JUMP_GRACE = { tickRate: 30, coyoteTicks: 3, bufferTicks: 4 } as const
export interface JumpGraceSnapshot { coyoteTicks: number; jumpBufferTicks: number }
const coyoteSeconds = JUMP_GRACE.coyoteTicks / JUMP_GRACE.tickRate, bufferSeconds = JUMP_GRACE.bufferTicks / JUMP_GRACE.tickRate
/** Display simulation uses seconds; the server's 30 Hz counters restore the same windows on replay. */
export class JumpGrace {
  private coyote = 0
  private buffer = 0
  reset(grounded: boolean, snapshot?: JumpGraceSnapshot) {
    this.coyote = grounded ? coyoteSeconds : (snapshot?.coyoteTicks ?? 0) / JUMP_GRACE.tickRate
    this.buffer = (snapshot?.jumpBufferTicks ?? 0) / JUMP_GRACE.tickRate
  }
  step(pressed: boolean, grounded: boolean, dt: number) {
    if (grounded) this.coyote = coyoteSeconds
    if (pressed) this.buffer = bufferSeconds
    const jump = this.buffer > 1e-7 && this.coyote > 1e-7
    if (jump) this.coyote = this.buffer = 0
    else { this.coyote = Math.max(0, this.coyote - dt); this.buffer = Math.max(0, this.buffer - dt) }
    return jump
  }
}
