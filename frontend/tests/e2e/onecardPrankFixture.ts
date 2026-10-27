import type { OneCard } from '../../src/game/onecard/protocol'

/** Proposed contract simulation only; never included in production. */
export function onecardPrankFixture(deps: {
  gameId(): string; state(): OneCard; emit(type: string, payload: Record<string, unknown>, requestId?: string): void
}) {
  let effectId = '', targetUserId = '', turnCount = 0
  const used = new Set<string>()
  return {
    flip(patch: Record<string, unknown> = {}) {
      effectId = crypto.randomUUID(); targetUserId = deps.state().turnUserId!; turnCount = deps.state().turnCount
      deps.emit('ONECARD_HAND_FLIPPED', { gameId: deps.gameId(), eventId: effectId, targetUserId, turnCount, count: 2, serverNow: Date.now(), ...patch })
    },
    handle(type: string, p: Record<string, unknown>, requestId: string) {
      if (type === 'ONECARD_HAND_FLIP_SEND') {
        const key = `${p.targetUserId}/${p.turnCount}`
        if (used.has(key)) deps.emit('ERROR', { code: 'ONECARD_PRANK_ALREADY_USED', message: '이번 차례에는 이미 장난을 사용했어요.' }, requestId)
        else {
          used.add(key); effectId = String(p.eventId); targetUserId = String(p.targetUserId); turnCount = Number(p.turnCount)
          deps.emit('ONECARD_HAND_FLIPPED', { ...p, count: 2, serverNow: Date.now() }, requestId)
        }
        return true
      }
      if (type !== 'ONECARD_HAND_RESTORE_SEND') return false
      const now = Date.now()
      deps.emit('ONECARD_HAND_RESTORED', { ...p, targetUserId, turnCount, serverNow: now, immuneUntil: now + 2500 }, requestId)
      return true
    },
  }
}
