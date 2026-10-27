import { findEmote, type EmoteId } from './catalog'

export interface EmoteEvent {
  eventId: string
  channelId: string
  userId: string
  emoteCode: string
  sentAt: string
}
export interface EmoteCancellation {
  eventId: string
  emoteEventId: string
  channelId: string
  userId: string
  reason: 'MOVEMENT' | 'ACTIVITY_STARTED' | 'CHANNEL_LEFT' | 'DISCONNECTED'
  sentAt: string
}
/** Deduplication survives a reconnect; per-channel interruption/order state does not. */
export class EmoteTimeline {
  private seen = new Map<string, number>()
  private latest = new Map<string, number>()
  private cancelled = new Map<string, number>()
  private playing = new Map<string, { eventId: string; channelId: string; until: number }>()
  private cancellations = new Map<string, number>()
  clearChannel() { this.latest.clear(); this.cancelled.clear(); this.playing.clear() }
  forget(userId: string) { this.latest.delete(userId); this.cancelled.delete(userId); this.playing.delete(userId) }
  cancel(userId: string, now: number) { this.cancelled.set(userId, now); this.playing.delete(userId) }
  cancelEvent(event: EmoteCancellation, now: number) {
    const playing = this.playing.get(event.userId), at = Date.parse(event.sentAt)
    for (const [id, seenAt] of this.cancellations) if (now - seenAt > 10_000) this.cancellations.delete(id)
    if (this.cancellations.has(event.eventId) || this.cancellations.size >= 2048 || at > now + 5000
      || !playing || playing.channelId !== event.channelId || playing.eventId !== event.emoteEventId || now >= playing.until) return false
    this.cancellations.set(event.eventId, now)
    this.playing.delete(event.userId)
    return true
  }
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
    this.playing.set(event.userId, { eventId: event.eventId, channelId: event.channelId, until: at + emote.durationMs })
    return { motion, at, readyAt: at + emote.cooldownMs }
  }
}

export function parseEmoteCancellation(p: Record<string, unknown>): EmoteCancellation {
  for (const field of ['eventId', 'emoteEventId', 'channelId', 'userId', 'reason', 'sentAt'])
    if (typeof p[field] !== 'string' || !p[field] || (p[field] as string).length > 128)
      throw new Error('감정표현 취소 응답 형식을 확인할 수 없습니다.')
  if (!['MOVEMENT', 'ACTIVITY_STARTED', 'CHANNEL_LEFT', 'DISCONNECTED'].includes(p.reason as string)
    || !Number.isFinite(Date.parse(p.sentAt as string))) throw new Error('감정표현 취소 응답 형식을 확인할 수 없습니다.')
  return p as unknown as EmoteCancellation
}

export function parseEmoteEvent(p: Record<string, unknown>): EmoteEvent {
  for (const field of ['eventId', 'channelId', 'userId', 'emoteCode', 'sentAt'])
    if (typeof p[field] !== 'string' || !p[field] || (p[field] as string).length > 128)
      throw new Error('감정표현 응답 형식을 확인할 수 없습니다.')
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(p.emoteCode as string) || !Number.isFinite(Date.parse(p.sentAt as string)))
    throw new Error('감정표현 응답 형식을 확인할 수 없습니다.')
  return p as unknown as EmoteEvent
}
