type Orientation = { x: number; y: number; z: number; w: number }
const FULL_TURN = Math.PI * 2
const REVERSAL_THRESHOLD = Math.PI / 60 // 3도 미만의 되돌아보기는 추적 흔들림으로 허용한다.

/** WebXR 기준 공간의 실제 헤드셋 방향만 사용한다. 가상 카메라/스틱 회전은 입력하지 않는다. */
export class GreetingTurn {
  private event: string | null = null
  private yaw: number | null = null
  private sampledAt = 0
  private angle = 0
  private peak = 0
  private completed = false
  get progress() { return this.completed ? 1 : Math.min(1, Math.abs(this.angle) / FULL_TURN) }
  invalidate() { if (!this.completed) this.resetMotion() }
  reset() { this.event = null; this.completed = false; this.resetMotion() }
  private resetMotion() { this.yaw = null; this.sampledAt = 0; this.angle = 0; this.peak = 0 }
  update(event: string | null, orientation: Orientation | null, now: number) {
    if (event !== this.event) { this.reset(); this.event = event }
    if (!event || this.completed) return false
    const next = this.heading(orientation)
    if (next === null || !Number.isFinite(now)) { this.resetMotion(); return false }
    const elapsed = (now - this.sampledAt) / 1000
    if (this.yaw !== null) {
      const delta = Math.atan2(Math.sin(next - this.yaw), Math.cos(next - this.yaw))
      // 추적 공백·불연속 자세 변경을 실제 회전으로 합산하지 않는다.
      if (elapsed <= 0 || elapsed > .25 || Math.abs(delta) > elapsed * FULL_TURN * 2) this.resetMotion()
      else {
        this.angle += delta
        const direction = Math.sign(this.peak || this.angle)
        if ((this.peak - this.angle) * direction >= REVERSAL_THRESHOLD) {
          // 전환 확인에 쓴 각도도 포함해 마지막 회전 지점부터 새 방향으로 측정한다.
          this.angle -= this.peak
          this.peak = this.angle
        } else if ((this.angle - this.peak) * direction > 0) this.peak = this.angle
      }
    }
    this.yaw = next; this.sampledAt = now
    if (Math.abs(this.angle) + .000001 < FULL_TURN) return false
    this.completed = true
    return true
  }
  private heading(q: Orientation | null) {
    if (!q || ![q.x, q.y, q.z, q.w].every(Number.isFinite)) return null
    const norm = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w
    if (!Number.isFinite(norm) || norm < .000001) return null
    const x = -2 * (q.x * q.z + q.w * q.y) / norm
    const z = -(1 - 2 * (q.x * q.x + q.y * q.y) / norm)
    // 위/아래를 향한 자세의 불안정한 수평각은 판정하지 않는다.
    return Math.hypot(x, z) < .35 ? null : Math.atan2(x, -z)
  }
}
