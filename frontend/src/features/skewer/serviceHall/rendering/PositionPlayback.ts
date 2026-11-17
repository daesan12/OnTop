import type { Point } from '../plan'

/** 서버 확정 좌표 사이를 완충 재생한다. 충돌 경계 밖으로 외삽하지 않는다. */
export class PositionPlayback {
  private clock = 0
  private serverAt?: number
  private samples: { at: number; point: Point }[] = []
  constructor(private readonly delaySeconds = .15) {}

  reset(point: Point, serverAt?: number) {
    this.serverAt = Number.isFinite(serverAt) ? serverAt : undefined
    this.samples = [{ at: this.clock, point: { ...point } }]
  }
  push(point: Point, serverAt?: number) {
    const stamp = Number.isFinite(serverAt) ? serverAt : undefined
    if (stamp !== undefined && this.serverAt !== undefined && stamp < this.serverAt) return
    const last = this.samples.at(-1)
    if (!last || Math.hypot(point.x - last.point.x, point.z - last.point.z) > 3) { this.reset(point, stamp); return }
    // MOVE 확인 응답은 같은 틱일 수 있다. 도착 지터와 무관한 서버 경과 시간으로 재생한다.
    const at = stamp !== undefined && this.serverAt !== undefined ? last.at + stamp - this.serverAt : this.clock
    this.serverAt = stamp
    if (Math.abs(last.at - at) < .000001) last.point = { ...point }
    else this.samples.push({ at, point: { ...point } })
    if (this.samples.length > 32) this.samples.shift()
  }
  step(seconds: number): Point {
    // 재생 시각은 실제 경과 시간을 따라야 느린 프레임마다 지연이 누적되지 않는다.
    this.clock += Math.max(0, seconds)
    const at = this.clock - this.delaySeconds
    while (this.samples.length > 2 && this.samples[1].at <= at) this.samples.shift()
    const a = this.samples[0], b = this.samples[1]
    if (!a) return { x: 0, z: 0 }
    if (!b) return { ...a.point }
    const mix = Math.max(0, Math.min(1, (at - a.at) / Math.max(.000001, b.at - a.at)))
    return { x: a.point.x + (b.point.x - a.point.x) * mix, z: a.point.z + (b.point.z - a.point.z) * mix }
  }
}
