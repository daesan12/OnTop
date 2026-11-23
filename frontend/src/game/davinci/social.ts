import { create } from 'zustand'
import { integer, type Envelope } from '../../network/protocol'
import type { DavinciState } from './protocol'

interface Ping { gameId: string; tileId: string; targetUserId: string; basedOnVersion: number; until: number; senderUserId: string }
export const useDavinciPing = create<{ ping: Ping | null }>(() => ({ ping: null }))

/** 현재 경기의 공개 타일만 대상으로 삼는다. 개인 숫자는 이 경로에 없다. */
export function acceptDavinciPing(message: Envelope, gameId: string, state: DavinciState) {
  if (message.type !== 'DAVINCI_SPECTATOR_PING') return false
  const p = message.payload
  if (p.gameId !== gameId || !integer(p.basedOnVersion) || p.basedOnVersion !== state.version
    || typeof p.tileId !== 'string' || typeof p.targetUserId !== 'string' || typeof p.senderUserId !== 'string'
    || !integer(p.sentAt) || !integer(p.serverNow) || !integer(p.expiresAt) || p.expiresAt <= p.serverNow
    || p.serverNow < p.sentAt || p.expiresAt - p.sentAt > 2000
    || !state.players.find(player => player.userId === p.targetUserId)?.tiles.some(tile => tile.id === p.tileId)) return true
  useDavinciPing.setState({ ping: { gameId, tileId: p.tileId, targetUserId: p.targetUserId,
    senderUserId: p.senderUserId, basedOnVersion: p.basedOnVersion, until: Date.now() + p.expiresAt - p.serverNow } })
  return true
}
