import { SNOW_ARC_HEIGHT, SNOW_RANGE, type SnowballAim, type SnowPoint } from './trajectory'

export type StaticSnowProbe = (from: SnowPoint, to: SnowPoint) => number | undefined

/** 서버와 같은 0.5m 구간을 기존 로컬 물리 월드에서 조회한다. 명중 확정에는 쓰지 않는다. */
export function localSnowballDistance(origin: SnowPoint, yaw: number, probe: StaticSnowProbe,
  groundHeight: (x: number, z: number) => number) {
  let previous = { x: origin.x, y: origin.y + .35, z: origin.z }
  for (let i = 1; i <= 32; i++) {
    const distance = i * .5
    const next = { x: origin.x + Math.sin(yaw) * distance,
      y: origin.y + .35 + SNOW_ARC_HEIGHT * Math.sin(Math.PI * distance / SNOW_RANGE),
      z: origin.z + Math.cos(yaw) * distance }
    const fraction = probe(previous, next)
    if (fraction !== undefined && fraction < 1) return distance - .5 + Math.max(0, fraction) * .5
    // 물리 준비 전에도 지형을 통과하는 표적은 표시하지 않는다.
    if (fraction === undefined && next.y <= groundHeight(next.x, next.z)) return distance - .5
    previous = next
  }
  return SNOW_RANGE
}

export function localSnowballAim(channelId: string, userId: string, origin: SnowPoint, yaw: number,
  obstacleDistance: number, targets: Iterable<{ userId: string; position: SnowPoint }>): SnowballAim {
  const dx = Math.sin(yaw), dz = Math.cos(yaw)
  let distance = obstacleDistance, hitUserId = ''
  for (const target of targets) {
    if (target.userId === userId) continue
    const p = target.position, x = p.x - origin.x, z = p.z - origin.z
    const along = x * dx + z * dz, side = Math.abs(x * dz - z * dx)
    const flightY = origin.y + .35 + SNOW_ARC_HEIGHT * Math.sin(Math.PI * along / SNOW_RANGE)
    if (along > .6 && along < distance && side < .65 && Math.abs(p.y - flightY) < 1) {
      distance = along; hitUserId = target.userId
    }
  }
  return { channelId, userId, yaw, x: origin.x, y: origin.y + .35, z: origin.z,
    endX: origin.x + dx * distance, endY: origin.y + .35 + SNOW_ARC_HEIGHT * Math.sin(Math.PI * distance / SNOW_RANGE),
    endZ: origin.z + dz * distance, distance, hitUserId }
}

/** 응답이 늦게 와도 해제·재접속·다음 준비 동작의 표적을 덮어쓰지 않는다. */
export class PreparedSnowballAim {
  private scope = ''
  private motion = ''
  private generation = 0
  aim: SnowballAim | null = null
  reset(scope: string) {
    if (scope === this.scope) return
    this.scope = scope; this.motion = ''; this.aim = null; this.generation++
  }
  prepare(motion: string, request: () => Promise<SnowballAim | null>) {
    if (motion === this.motion) return
    this.motion = motion; this.aim = null
    const generation = ++this.generation
    if (!motion) return
    void request().then(aim => { if (generation === this.generation) this.aim = aim })
      .catch(() => { /* 서버 조준 실패 시 로컬 미리보기를 유지한다. */ })
  }
}
