import type { Point } from '../plan'

/** 서버 확정 좌표 사이를 한 틱 늦춰 재생한다. 충돌 경계 밖으로 외삽하지 않는다. */
export class PositionPlayback {
  private clock = 0
  private samples: { at: number; point: Point }[] = []
  reset(point: Point) { this.samples = [{ at: this.clock, point: { ...point } }] }
  push(point: Point) {
    const last = this.samples.at(-1)
    if (!last || Math.hypot(point.x - last.point.x, point.z - last.point.z) > 3) { this.reset(point); return }
    if (last.at === this.clock) last.point = { ...point }
    else this.samples.push({ at: this.clock, point: { ...point } })
    if (this.samples.length > 32) this.samples.shift()
  }
  step(seconds: number): Point {
    this.clock += Math.max(0, Math.min(.1, seconds))
    const at = this.clock - .12
    while (this.samples.length > 2 && this.samples[1].at <= at) this.samples.shift()
    const a = this.samples[0], b = this.samples[1]
    if (!a) return { x: 0, z: 0 }
    if (!b) return { ...a.point }
    const mix = Math.max(0, Math.min(1, (at - a.at) / Math.max(.000001, b.at - a.at)))
    return { x: a.point.x + (b.point.x - a.point.x) * mix, z: a.point.z + (b.point.z - a.point.z) * mix }
  }
}
