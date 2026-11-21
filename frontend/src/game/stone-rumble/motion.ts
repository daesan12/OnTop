export const STONE_CAMERA_DRAG = .003
export const STONE_RENDER_DELAY = 120

export function followStoneCamera(current: number, target: number, delta: number, manual: boolean) {
  return followStoneYaw(current, target, Math.min(.05, Math.max(0, delta)), manual ? 8 : 6, manual ? 2.8 : 1.6)
}

type StonePosition = { x: number; y: number; z: number }
type PositionSample = StonePosition & { at: number }

/** 지연 패킷이 도착해도 표시 시각을 뒤로 돌리거나 서버보다 앞서지 않는다. */
export class StoneRenderClock {
  private serverTime = NaN
  private receivedAt = 0
  private cursor = -Infinity

  reset() { this.serverTime = NaN; this.cursor = -Infinity }

  sample(serverTime: number, now: number) {
    if (serverTime !== this.serverTime) {
      if (serverTime < this.serverTime || serverTime - this.serverTime > 500) this.cursor = -Infinity
      this.serverTime = serverTime; this.receivedAt = now
    }
    const desired = Math.min(serverTime, serverTime + Math.max(0, now - this.receivedAt) - STONE_RENDER_DELAY)
    this.cursor = Math.max(this.cursor, desired)
    return this.cursor
  }
}

/** 서버 판정은 유지하고 120ms 위치 버퍼로 낙하 궤적을 끊김 없이 표시한다. */
export class StonePositionBuffer {
  private samples: PositionSample[] = []
  private clock = new StoneRenderClock()

  reset() { this.samples = []; this.clock.reset() }

  sample(position: StonePosition, serverTime: number, now: number, target: StonePosition) {
    const latest = this.samples.at(-1)
    if (!latest || serverTime !== latest.at) {
      if (latest && (serverTime < latest.at || serverTime - latest.at > 500)) this.samples = []
      this.samples.push({ x: position.x, y: position.y, z: position.z, at: serverTime })
      if (this.samples.length > 12) this.samples.shift()
    }
    const time = this.clock.sample(serverTime, now)
    let from = this.samples[0]!, to = from
    for (const sample of this.samples) {
      to = sample
      if (sample.at >= time) break
      from = sample
    }
    const progress = to.at === from.at ? 0 : Math.max(0, Math.min(1, (time - from.at) / (to.at - from.at)))
    target.x = from.x + (to.x - from.x) * progress
    target.y = from.y + (to.y - from.y) * progress
    target.z = from.z + (to.z - from.z) * progress
    return target
  }
}

export function followStoneYaw(current: number, target: number, delta: number, response: number, maxSpeed: number) {
  const difference = target - current
  const turn = Math.atan2(Math.sin(difference), Math.cos(difference))
  const eased = turn * (1 - Math.exp(-delta * response))
  const limit = delta * maxSpeed
  return (current + Math.max(-limit, Math.min(limit, eased))) % (2 * Math.PI)
}
