import type { OneCard } from '../../src/game/onecard/protocol'

type Emit = (type: string, payload: Record<string, unknown>, requestId?: string) => void
interface Reach { attemptId: string; actorUserId: string; targetUserId: string; turnCount: number; serverNow: number; resolveAt: number }
export interface OneCardPrankRoom {
  effectId: string; targetUserId: string; turnCount: number
  used: Set<string>; peers: Set<Emit>
  reach: Reach | null; blocked: Map<string, number>
}
export function createOneCardPrankRoom(): OneCardPrankRoom {
  return { effectId: '', targetUserId: '', turnCount: 0, used: new Set(), peers: new Set(), reach: null, blocked: new Map() }
}
/** Proposed contract simulation only; never included in production. */
export function onecardPrankFixture(deps: {
  ownId: string; gameId(): string; state(): OneCard; emit: Emit; room?: OneCardPrankRoom
}) {
  const room = deps.room ?? createOneCardPrankRoom()
  room.peers.add(deps.emit)
  const publish: Emit = (type, payload, requestId) => {
    deps.emit(type, payload, requestId)
    for (const peer of room.peers) if (peer !== deps.emit) peer(type, payload)
  }
  return {
    reach() {
      const now = Date.now()
      room.reach = { attemptId: crypto.randomUUID(), actorUserId: '505', targetUserId: deps.state().turnUserId!, turnCount: deps.state().turnCount, serverNow: now, resolveAt: now + 1400 }
      publish('ONECARD_PRANK_REACH_STARTED', { gameId: deps.gameId(), eventId: crypto.randomUUID(), ...room.reach })
    },
    resolveReach() {
      if (!room.reach) return
      const attempt = room.reach; room.reach = null
      publish('ONECARD_PRANK_REACH_RESOLVED', { gameId: deps.gameId(), eventId: crypto.randomUUID(), ...attempt, serverNow: Date.now(), outcome: 'FLIPPED' })
      room.effectId = crypto.randomUUID(); room.targetUserId = attempt.targetUserId; room.turnCount = attempt.turnCount
      publish('ONECARD_HAND_FLIPPED', { gameId: deps.gameId(), eventId: room.effectId, targetUserId: room.targetUserId, turnCount: room.turnCount, count: 2, serverNow: Date.now() })
    },
    flip(patch: Record<string, unknown> = {}) {
      room.effectId = crypto.randomUUID(); room.targetUserId = deps.state().turnUserId!; room.turnCount = deps.state().turnCount
      publish('ONECARD_HAND_FLIPPED', { gameId: deps.gameId(), eventId: room.effectId, targetUserId: room.targetUserId, turnCount: room.turnCount, count: 2, serverNow: Date.now(), ...patch })
    },
    handle(type: string, p: Record<string, unknown>, requestId: string) {
      if (type === 'ONECARD_PRANK_REACH_SEND') {
        const now = Date.now(), key = `${deps.ownId}/${p.targetUserId}`
        if ((room.blocked.get(key) ?? 0) > now || room.reach) deps.emit('ERROR', { code: 'ONECARD_PRANK_BLOCKED', message: '잠시 방해할 수 없어요.' }, requestId)
        else {
          room.reach = { attemptId: crypto.randomUUID(), actorUserId: deps.ownId, targetUserId: String(p.targetUserId), turnCount: Number(p.turnCount), serverNow: now, resolveAt: now + 1400 }
          publish('ONECARD_PRANK_REACH_STARTED', { gameId: deps.gameId(), eventId: p.eventId, ...room.reach }, requestId)
        }
        return true
      }
      if (type === 'ONECARD_PRANK_HIT_SEND') {
        const attempt = room.reach, now = Date.now()
        if (!attempt || attempt.attemptId !== p.attemptId || attempt.targetUserId !== deps.ownId || now >= attempt.resolveAt)
          deps.emit('ERROR', { code: 'ONECARD_PRANK_TOO_LATE', message: '손이 이미 지나갔어요.' }, requestId)
        else {
          const blockedUntil = now + 3000; room.blocked.set(`${attempt.actorUserId}/${attempt.targetUserId}`, blockedUntil); room.reach = null
          publish('ONECARD_PRANK_BLOCKED', { ...attempt, gameId: deps.gameId(), eventId: p.eventId, serverNow: now, blockedUntil }, requestId)
        }
        return true
      }
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
