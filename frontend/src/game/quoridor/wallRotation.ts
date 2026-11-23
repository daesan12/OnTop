import type { Orientation } from './protocol'

export const rotateWall = (orientation: Orientation): Orientation => orientation === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL'

/** 작은 트랙패드 흔들림과 같은 방향의 연속 이벤트가 과도한 회전을 만들지 않게 한다. */
export class WallWheelStep {
  private accumulated = 0
  private lastEvent = -Infinity
  private lastTurn = -Infinity
  private direction = 0

  reset() { this.accumulated = 0; this.lastEvent = this.lastTurn = -Infinity; this.direction = 0 }

  accept(deltaY: number, deltaMode: number, now: number) {
    if (!Number.isFinite(deltaY) || !deltaY || !Number.isFinite(now)) return false
    const direction = Math.sign(deltaY)
    if (now - this.lastEvent > 160 || direction !== Math.sign(this.accumulated)) this.accumulated = 0
    this.lastEvent = now
    if (direction === this.direction && now - this.lastTurn < 140) { this.accumulated = 0; return false }
    this.accumulated += deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1)
    if (Math.abs(this.accumulated) < 24) return false
    this.accumulated = 0; this.lastTurn = now; this.direction = direction
    return true
  }
}
