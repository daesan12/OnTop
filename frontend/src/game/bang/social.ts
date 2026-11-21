import { create } from 'zustand'
import { record, integer, type Envelope } from '../../network/protocol'
import type { Game } from '../protocol'
import { estimatedServerTime } from '../../network/worldClient'

interface BangPing { eventId: string; gameId: string; targetUserId: string; version: number; until: number }
export const useBangPings = create(() => ({ pings: [] as BangPing[] }))
export function acceptBangPing(message: Envelope, game: Game | null): boolean {
  if (message.type !== 'GAME_SPECTATOR_PING') return false
  const p = message.payload
  if (!game?.bang || p.gameId !== game.gameId || !record(p) || typeof p.eventId !== 'string'
    || typeof p.targetUserId !== 'string' || !game.bang.players.some(player => player.userId === p.targetUserId)
    || p.basedOnVersion !== game.version || !integer(p.sentAt) || !integer(p.expiresAt) || !integer(p.serverNow)
    || p.serverNow < p.sentAt || p.expiresAt <= p.serverNow || p.expiresAt - p.sentAt > 2000) return true
  const now = estimatedServerTime(), until = now + p.expiresAt - p.serverNow
  useBangPings.setState(state => ({ pings: [...state.pings.filter(ping => ping.gameId === game.gameId && ping.until > now && ping.eventId !== p.eventId),
    { eventId: p.eventId as string, gameId: game.gameId, targetUserId: p.targetUserId as string, version: game.version, until }].slice(-8) }))
  return true
}
