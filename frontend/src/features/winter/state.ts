import { create } from 'zustand'
import { GATHER_MS, THROW_RECOVERY_MS } from './trajectory'

export interface SnowballEvent {
  shotId: string; channelId: string; userId: string; hitUserId: string
  x: number; y: number; z: number; endX: number; endY: number; endZ: number
  sentAt: string; durationMs: number
}
export interface WinterPlayer { userId: string; snowballs: number; hits: number; freezeId: string; frozenUntil: string | null; escapePresses: number }
export interface WinterMotion { kind: 'gather' | 'windup' | 'throw'; at: number; durationMs: number; yaw: number; id: string }
export const useWinter = create<{ shots: SnowballEvent[]; notice: string; version: number; players: Record<string, WinterPlayer>;
  motions: Record<string, WinterMotion> }>(() => ({ shots: [], notice: '', version: -1, players: {}, motions: {} }))
export function winterMotion(id: string, now: number) {
  const motion = useWinter.getState().motions[id]
  return motion && now >= motion.at && now - motion.at < motion.durationMs ? motion : null
}
export function winterFrozen(id: string, now = Date.now()) {
  const p = useWinter.getState().players[id]
  return !!p?.freezeId && !!p.frozenUntil && Date.parse(p.frozenUntil) > now
}
export function acceptWinterState(value: Record<string, unknown>, channel: string, now = Date.now()) {
  if (value.channelId !== channel || !Number.isSafeInteger(value.version) || Number(value.version) < 0 || Number(value.version) < useWinter.getState().version || !Array.isArray(value.players)) return false
  const players: Record<string, WinterPlayer> = {}
  for (const p of value.players) {
    if (!p || typeof p.userId !== 'string' || players[p.userId] || ![0, 1].includes(p.snowballs)
      || !Number.isInteger(p.hits) || p.hits < 0 || p.hits > 3 || typeof p.freezeId !== 'string'
      || !Number.isInteger(p.escapePresses) || p.escapePresses < 0 || p.escapePresses > 6
      || p.frozenUntil !== null && (typeof p.frozenUntil !== 'string' || !Number.isFinite(Date.parse(p.frozenUntil)))) return false
    players[p.userId] = p as WinterPlayer
  }
  const before = useWinter.getState(), motions = { ...before.motions }
  for (const p of Object.values(players)) {
    if (before.version >= 0 && p.snowballs === 1 && before.players[p.userId]?.snowballs !== 1) {
      motions[p.userId] = { kind: 'gather', at: now, durationMs: GATHER_MS, yaw: 0, id: 'gather-' + value.version }
    }
    if (p.freezeId) delete motions[p.userId]
  }
  for (const id of Object.keys(motions)) if (!players[id]) delete motions[id]
  useWinter.setState({ players, motions, version: Number(value.version) }); return true
}
export function acceptSnowballWindup(p: Record<string, unknown>, channel: string, now: number) {
  if (p.channelId !== channel || typeof p.userId !== 'string' || typeof p.motionId !== 'string'
    || typeof p.startedAt !== 'string' || typeof p.yaw !== 'number' || !Number.isFinite(p.yaw) || Math.abs(p.yaw) > Math.PI
    || p.durationMs !== 300) return
  const at = Date.parse(p.startedAt), previous = useWinter.getState().motions[p.userId]
  if (!Number.isFinite(at) || now - at > 1000 || at - now > 3000 || previous && (previous.id === p.motionId || previous.at > at)) return
  useWinter.setState(s => ({ motions: { ...s.motions, [p.userId as string]: {
    kind: 'windup', at, durationMs: 800, yaw: p.yaw as number, id: p.motionId as string,
  } } }))
}
export function acceptSnowball(value: Record<string, unknown>, channel: string, self: string, now: number) {
  if (value.channelId !== channel || typeof value.shotId !== 'string' || typeof value.userId !== 'string'
    || typeof value.hitUserId !== 'string' || typeof value.sentAt !== 'string'
    || !['x', 'y', 'z', 'endX', 'endY', 'endZ', 'durationMs'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]))
    || Number(value.durationMs) < 100 || Number(value.durationMs) > 1000) return
  const shot = value as unknown as SnowballEvent, age = now - Date.parse(shot.sentAt)
  if (!Number.isFinite(age) || age < -3000 || age > 2000 || useWinter.getState().shots.some(s => s.shotId === shot.shotId)) return
  useWinter.setState(s => ({ shots: [...s.shots.filter(s => now - Date.parse(s.sentAt) < 2000), shot].slice(-32),
    motions: { ...s.motions, [shot.userId]: { kind: 'throw', at: Date.parse(shot.sentAt), durationMs: THROW_RECOVERY_MS,
      yaw: Math.atan2(shot.endX - shot.x, shot.endZ - shot.z), id: shot.shotId } },
    notice: shot.hitUserId === self ? winterFrozen(self, now) ? '얼었어요! A·D를 번갈아 눌러 깨보세요.' : '눈덩이에 맞았어요! 세 번 맞으면 얼어요.'
      : shot.userId === self ? shot.hitUserId ? '명중! 눈가루가 팡!' : '눈덩이를 던졌어요.' : s.notice }))
}
export function resetWinter() { useWinter.setState({ shots: [], notice: '', version: -1, players: {}, motions: {} }) }
