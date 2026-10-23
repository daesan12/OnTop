import { findEmote, type EmoteId } from './catalog'

export interface EmoteEvent {
  eventId: string
  channelId: string
  userId: string
  emoteCode: string
  sentAt: string
}
/** Deduplication survives a reconnect; per-channel interruption/order state does not. */
export class EmoteTimeline {
  private seen = new Map<string, number>()
  private latest = new Map<string, number>()
  private cancelled = new Map<string, number>()
  clearChannel() { this.latest.clear(); this.cancelled.clear() }
  forget(userId: string) { this.latest.delete(userId); this.cancelled.delete(userId) }
  cancel(userId: string, now: number) { this.cancelled.set(userId, now) }
  accept(event: EmoteEvent, motion: EmoteId, now: number) {
    const emote = findEmote(motion), at = Date.parse(event.sentAt)
    if (!emote || !Number.isFinite(at) || at > now + 5000 || now - at >= emote.durationMs
      || at <= (this.latest.get(event.userId) ?? -Infinity)
      || at <= (this.cancelled.get(event.userId) ?? -Infinity)
      || this.seen.has(event.eventId)) return null
    // Longer than the largest authored clip plus permitted future clock skew.
    for (const [id, seenAt] of this.seen) if (now - seenAt > 10_000) this.seen.delete(id)
    if (this.seen.size >= 2048) return null
    this.seen.set(event.eventId, now)
    this.latest.set(event.userId, at)
    return { motion, at, readyAt: at + emote.cooldownMs }
  }
}

export function parseEmoteEvent(p: Record<string, unknown>): EmoteEvent {
  for (const field of ['eventId', 'channelId', 'userId', 'emoteCode', 'sentAt'])
    if (typeof p[field] !== 'string' || !p[field] || (p[field] as string).length > 128)
      throw new Error('감정표현 응답 형식을 확인할 수 없습니다.')
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(p.emoteCode as string) || !Number.isFinite(Date.parse(p.sentAt as string)))
    throw new Error('감정표현 응답 형식을 확인할 수 없습니다.')
  return p as unknown as EmoteEvent
}
