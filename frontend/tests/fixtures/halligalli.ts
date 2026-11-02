/** Mirrors HalliGalliEngine.publicState: string user IDs, seat = list index, topCard null for an empty face-up pile. */
export function halliPlayer(index: number, overrides: Record<string, unknown> = {}) {
  return { userId: String(101 + index), seat: index, drawCount: 13, faceUpCount: 1, cardCount: 14, active: true,
    eliminated: false, forfeited: false, topCard: { fruit: 'BANANA', count: 2 }, ...overrides }
}
export function halliState(count = 2, overrides: Record<string, unknown> = {}) {
  return { gameCode: 'HALLI_GALLI', status: 'PLAYING', version: 4, flipTimeLimitMs: 5000, resultPauseMs: 1000,
    turnUserId: '101', flipDeadline: new Date(Date.now() + 4_000).toISOString(), resultUntil: null,
    flipSeq: 4, bellWindowId: 4, issuedPenaltyCards: 0,
    lastEvent: { type: 'FLIP', userId: '102', at: new Date().toISOString(), cardCount: 1, issuedCards: 0 },
    players: Array.from({ length: count }, (_, i) => halliPlayer(i)), winnerUserIds: [], endReason: null, endedAt: null,
    ...overrides }
}
export function halliFinished(count = 2, winners = ['101']) {
  return halliState(count, { status: 'FINISHED', turnUserId: null, flipDeadline: null, resultUntil: null, bellWindowId: null,
    winnerUserIds: winners, endReason: 'CARD_COUNT', endedAt: new Date().toISOString() })
}
