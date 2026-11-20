export interface SnowballAim {
  channelId: string; userId: string; yaw: number; x: number; y: number; z: number
  endX: number; endY: number; endZ: number; distance: number; hitUserId: string
}
export interface SnowPoint { x: number; y: number; z: number }
export const SNOW_RANGE = 16
export const SNOW_ARC_HEIGHT = .55
export const GATHER_MS = 800
export const THROW_RECOVERY_MS = 650

export function parseSnowballAim(p: Record<string, unknown>, channel: string, user: string): SnowballAim | null {
  if (p.channelId !== channel || p.userId !== user || typeof p.hitUserId !== 'string'
    || !['yaw', 'x', 'y', 'z', 'endX', 'endY', 'endZ', 'distance'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]))
    || Number(p.distance) < 0 || Number(p.distance) > SNOW_RANGE || Math.abs(Number(p.yaw)) > Math.PI) return null
  const aim = p as unknown as SnowballAim
  if (Math.abs(Math.hypot(aim.endX - aim.x, aim.endZ - aim.z) - aim.distance) > .02) return null
  return aim
}

/** Same arc as Java; only the first quarter blends from the posed hand to the authoritative path. */
export function snowballPoint(shot: Pick<SnowballAim, 'x' | 'y' | 'z' | 'endX' | 'endZ'>, t: number,
  hand?: SnowPoint, out: SnowPoint = { x: 0, y: 0, z: 0 }) {
  t = Math.max(0, Math.min(1, t))
  const dx = shot.endX - shot.x, dz = shot.endZ - shot.z, blend = 1 - Math.min(1, t * 4)
  out.x = shot.x + dx * t + (hand ? hand.x - shot.x : 0) * blend
  out.y = shot.y + SNOW_ARC_HEIGHT * Math.sin(Math.PI * Math.hypot(dx, dz) * t / SNOW_RANGE) + (hand ? hand.y - shot.y : 0) * blend
  out.z = shot.z + dz * t + (hand ? hand.z - shot.z : 0) * blend
  return out
}
