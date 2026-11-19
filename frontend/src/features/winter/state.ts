import { create } from 'zustand'

export interface SnowballEvent {
  shotId: string; channelId: string; userId: string; hitUserId: string
  x: number; y: number; z: number; endX: number; endY: number; endZ: number
  sentAt: string; durationMs: number
}
export interface WinterPlayer { userId: string; snowballs: number; hits: number; freezeId: string; frozenUntil: string | null; escapePresses: number }
export const useWinter = create<{ shots: SnowballEvent[]; notice: string; version: number; players: Record<string, WinterPlayer> }>(() => ({ shots: [], notice: '', version: -1, players: {} }))
export function winterFrozen(id: string, now = Date.now()) {
  const p = useWinter.getState().players[id]
  return !!p?.freezeId && !!p.frozenUntil && Date.parse(p.frozenUntil) > now
}
export function acceptWinterState(value: Record<string, unknown>, channel: string) {
  if (value.channelId !== channel || !Number.isSafeInteger(value.version) || Number(value.version) < 0 || Number(value.version) < useWinter.getState().version || !Array.isArray(value.players)) return false
  const players: Record<string, WinterPlayer> = {}
  for (const p of value.players) {
    if (!p || typeof p.userId !== 'string' || players[p.userId] || ![0, 1].includes(p.snowballs)
      || !Number.isInteger(p.hits) || p.hits < 0 || p.hits > 3 || typeof p.freezeId !== 'string'
      || !Number.isInteger(p.escapePresses) || p.escapePresses < 0 || p.escapePresses > 6
      || p.frozenUntil !== null && (typeof p.frozenUntil !== 'string' || !Number.isFinite(Date.parse(p.frozenUntil)))) return false
    players[p.userId] = p as WinterPlayer
  }
  useWinter.setState({ players, version: Number(value.version) }); return true
}
export function acceptSnowball(value: Record<string, unknown>, channel: string, self: string, now: number) {
  if (value.channelId !== channel || typeof value.shotId !== 'string' || typeof value.userId !== 'string'
    || typeof value.hitUserId !== 'string' || typeof value.sentAt !== 'string'
    || !['x', 'y', 'z', 'endX', 'endY', 'endZ', 'durationMs'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]))
    || Number(value.durationMs) < 100 || Number(value.durationMs) > 1000) return
  const shot = value as unknown as SnowballEvent, age = now - Date.parse(shot.sentAt)
  if (!Number.isFinite(age) || age < -3000 || age > 2000 || useWinter.getState().shots.some(s => s.shotId === shot.shotId)) return
  useWinter.setState(s => ({ shots: [...s.shots.filter(s => now - Date.parse(s.sentAt) < 2000), shot].slice(-32),
    notice: shot.hitUserId === self ? winterFrozen(self, now) ? '얼었어요! A·D를 번갈아 눌러 깨보세요.' : '눈덩이에 맞았어요! 세 번 맞으면 얼어요.'
      : shot.userId === self ? shot.hitUserId ? '명중! 눈가루가 팡!' : '눈덩이를 던졌어요.' : s.notice }))
}
export function resetWinter() { useWinter.setState({ shots: [], notice: '', version: -1, players: {} }) }
