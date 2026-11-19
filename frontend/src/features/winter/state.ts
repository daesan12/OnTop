import { create } from 'zustand'

export interface SnowballEvent {
  shotId: string; channelId: string; userId: string; hitUserId: string
  x: number; y: number; z: number; endX: number; endY: number; endZ: number
  sentAt: string; durationMs: number
}
export const useWinter = create<{ shots: SnowballEvent[]; notice: string }>(() => ({ shots: [], notice: '' }))
export function acceptSnowball(value: Record<string, unknown>, channel: string, self: string, now: number) {
  if (value.channelId !== channel || typeof value.shotId !== 'string' || typeof value.userId !== 'string'
    || typeof value.hitUserId !== 'string' || typeof value.sentAt !== 'string'
    || !['x', 'y', 'z', 'endX', 'endY', 'endZ', 'durationMs'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]))
    || Number(value.durationMs) < 100 || Number(value.durationMs) > 1000) return
  const shot = value as unknown as SnowballEvent, age = now - Date.parse(shot.sentAt)
  if (!Number.isFinite(age) || age < -3000 || age > 2000 || useWinter.getState().shots.some(s => s.shotId === shot.shotId)) return
  useWinter.setState(s => ({ shots: [...s.shots.filter(s => now - Date.parse(s.sentAt) < 2000), shot].slice(-32),
    notice: shot.hitUserId === self ? '눈덩이에 맞았어요! 돌아서서 반격해 보세요.'
      : shot.userId === self ? shot.hitUserId ? '명중! 눈가루가 팡!' : '눈덩이를 던졌어요.' : s.notice }))
}
export function resetWinter() { useWinter.setState({ shots: [], notice: '' }) }
