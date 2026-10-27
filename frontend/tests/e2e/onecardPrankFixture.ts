import type { OneCard } from '../../src/game/onecard/protocol'

type Emit = (type: string, payload: Record<string, unknown>, requestId?: string) => void
export interface OneCardPrankRoom {
  effectId: string; targetUserId: string; turnCount: number
  used: Set<string>; peers: Set<Emit>
}
export function createOneCardPrankRoom(): OneCardPrankRoom {
  return { effectId: '', targetUserId: '', turnCount: 0, used: new Set(), peers: new Set() }
}
/** Proposed contract simulation only; never included in production. */
export function onecardPrankFixture(deps: {
  gameId(): string; state(): OneCard; emit: Emit; room?: OneCardPrankRoom
}) {
  const room = deps.room ?? createOneCardPrankRoom()
  room.peers.add(deps.emit)
  const publish: Emit = (type, payload, requestId) => {
    deps.emit(type, payload, requestId)
    for (const peer of room.peers) if (peer !== deps.emit) peer(type, payload)
  }
  return {
    flip(patch: Record<string, unknown> = {}) {
      room.effectId = crypto.randomUUID(); room.targetUserId = deps.state().turnUserId!; room.turnCount = deps.state().turnCount
      publish('ONECARD_HAND_FLIPPED', { gameId: deps.gameId(), eventId: room.effectId, targetUserId: room.targetUserId, turnCount: room.turnCount, count: 2, serverNow: Date.now(), ...patch })
    },
    handle(type: string, p: Record<string, unknown>, requestId: string) {
      if (type === 'ONECARD_HAND_FLIP_SEND') {
        const key = `${p.targetUserId}/${p.turnCount}`
        if (room.used.has(key)) deps.emit('ERROR', { code: 'ONECARD_PRANK_ALREADY_USED', message: '이번 차례에는 이미 장난을 사용했어요.' }, requestId)
        else {
          room.used.add(key); room.effectId = String(p.eventId); room.targetUserId = String(p.targetUserId); room.turnCount = Number(p.turnCount)
          publish('ONECARD_HAND_FLIPPED', { ...p, count: 2, serverNow: Date.now() }, requestId)
        }
        return true
      }
      if (type !== 'ONECARD_HAND_RESTORE_SEND') return false
      const now = Date.now()
      publish('ONECARD_HAND_RESTORED', { ...p, targetUserId: room.targetUserId, turnCount: room.turnCount, serverNow: now, immuneUntil: now + 2500 }, requestId)
      return true
    },
  }
}
