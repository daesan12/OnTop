import { integer, record } from '../../network/protocol'

export type DefeatKind = 'head-clutch' | 'table-flip'
export const DEFEAT_DURATION = { 'head-clutch': 3600, 'table-flip': 2800 } as const
export interface GameReactionEvent {
  eventId: string; gameId: string; tableId: string; channelId: string
  gameCode: 'OMOK' | 'DICE' | 'ONE_CARD' | 'LIAR_BRIDGE' | 'DICE_LEDGER' | 'ALKKAGI'; version: number
  userId: string; kind: 'FORFEIT' | 'DEFEAT'; remainingBefore: number
  motion: DefeatKind; durationMs: number; occurredAt: string; participantCount?: number
}
export interface DefeatReaction {
  key: string; gameId: string; userId: string; kind: DefeatKind; at: number
  tableId: string; channelId: string; anchorId: string
  position: { x: number; y: number; z: number }
}
export function parseGameReaction(p: unknown): GameReactionEvent {
  const id = (v: unknown) => typeof v === 'string' && !!v.trim() && v.length <= 128
  if (!record(p) || !['eventId', 'gameId', 'tableId', 'channelId', 'userId'].every(k => id(p[k]))
    || !['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'ALKKAGI'].includes(String(p.gameCode))
    || !integer(p.version) || !['FORFEIT', 'DEFEAT'].includes(String(p.kind))
    || !integer(p.remainingBefore) || p.remainingBefore < 1 || p.remainingBefore > 4
    || p.participantCount !== undefined && (!integer(p.participantCount) || p.participantCount < p.remainingBefore || p.participantCount > 4)
    || !['head-clutch', 'table-flip'].includes(String(p.motion))
    || p.motion === 'table-flip' && (p.remainingBefore !== 2 || p.participantCount !== undefined && (p.participantCount !== 2 || p.kind !== 'FORFEIT'))
    || p.motion === 'head-clutch' && p.participantCount === undefined && p.remainingBefore === 2
    || p.durationMs !== DEFEAT_DURATION[p.motion as DefeatKind]
    || typeof p.occurredAt !== 'string' || !/Z$/.test(p.occurredAt) || !Number.isFinite(Date.parse(p.occurredAt)))
    throw new Error('경기 연출 응답 형식을 확인할 수 없습니다.')
  return { eventId: String(p.eventId), gameId: String(p.gameId), tableId: String(p.tableId),
    channelId: String(p.channelId), userId: String(p.userId), gameCode: p.gameCode as GameReactionEvent['gameCode'],
    version: p.version, kind: p.kind as GameReactionEvent['kind'], remainingBefore: p.remainingBefore,
    motion: p.motion as DefeatKind, durationMs: Number(p.durationMs), occurredAt: p.occurredAt,
    ...(p.participantCount === undefined ? {} : { participantCount: p.participantCount as number }) }
}

/** Only server notifications trigger a pose. Dedup survives interruption/reconnect. */
export class DefeatTimeline {
  private seen = new Map<string, number>()
  private latest = new Map<string, number>()
  readonly playing = new Map<string, DefeatReaction>()
  clear() { this.playing.clear(); this.latest.clear() }
  stop(userId: string) { this.playing.delete(userId) }
  forget(userId: string) { this.stop(userId); this.latest.delete(userId) }
  stopGame(gameId: string) {
    for (const [id, reaction] of this.playing) if (reaction.gameId === gameId) this.stop(id)
  }
  accept(event: GameReactionEvent, anchorId: string, position: DefeatReaction['position'], now: number) {
    const at = Date.parse(event.occurredAt)
    for (const [key, until] of this.seen) if (now >= until) this.seen.delete(key)
    const keys = [JSON.stringify(['event', event.channelId, event.eventId]),
      JSON.stringify(['player', event.channelId, event.gameId, event.userId])]
    if (!Number.isFinite(now) || !Number.isFinite(at) || at > now + 5000
      || now - at >= event.durationMs || at < (this.latest.get(event.userId) ?? -Infinity)
      || keys.some(k => this.seen.has(k)) || this.seen.size >= 4096) return null
    keys.forEach(k => this.seen.set(k, now + 10_000))
    this.latest.set(event.userId, at)
    const reaction: DefeatReaction = { key: event.eventId, gameId: event.gameId, userId: event.userId,
      kind: event.kind === 'DEFEAT' ? 'head-clutch' : event.motion, at, tableId: event.tableId, channelId: event.channelId, anchorId, position: { ...position } }
    this.playing.set(event.userId, reaction)
    return reaction
  }
}
export const defeatTimeline = new DefeatTimeline()
