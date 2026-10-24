import type { Bridge } from '../../src/game/bridge/protocol'
/** Explicit public contract data for tests, never a local rules/RNG engine. */
export function bridgeState(count: 2 | 3 | 4 = 2): Bridge {
  return { gameCode: 'LIAR_BRIDGE', status: 'PLAYING', stage: 'AWAITING_ROLL', turnId: 1, turnUserId: '101', responderUserId: null,
    turnDeadline: new Date(Date.now() + 30000).toISOString(), phaseTimeLimitMs: 30000, resolutionVisualMs: 1500, declaration: null, responseOrder: [], acceptedBy: [],
    players: Array.from({ length: count }, (_, index) => ({ userId: String(101 + index), score: 0, goals: 0, forfeited: false, pendingForfeit: false,
      pawns: Array.from({ length: 7 }, (_, p) => ({ id: index * 7 + p + 1, status: p === 0 ? 'ACTIVE' : 'RESERVE', position: 0, goalSlot: null })) })),
    goalSlots: Array.from({ length: 8 }, (_, i) => ({ slot: i + 1, status: 'UNUSED', userId: null, pawnId: null, removedReason: null, firstAssignedTurnId: null })),
    nextGoalSlot: 1, resolution: null, operations: [], lastEvent: 'START', winnerUserIds: [], endReason: null, endedAt: null }
}
