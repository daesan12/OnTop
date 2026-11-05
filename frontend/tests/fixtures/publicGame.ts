import type { Game, Omok, Farkle } from '../../src/game/protocol'
import type { OneCard } from '../../src/game/onecard/protocol'
import { parseAlkkagi } from '../../src/game/alkkagi/protocol'
import { parseHalliGalli } from '../../src/game/halligalli/protocol'
import { bridgeState } from './bridge'
import { ledgerState } from './ledger'
import { halliState } from './halligalli'
import alkkagi from './alkkagi-forfeit.json'

export type PublicGameKind = 'omok' | 'onecard' | 'dice' | 'bridge' | 'ledger' | 'halli' | 'alkkagi'

/** Complete public envelopes for HUD tests; overrides isolate the state under test. */
export function publicGame(kind: PublicGameKind, overrides: object = {}, role: Game['role'] = 'PLAYER'): Game {
  const header = { gameId: 'turn-test', version: 4, role }
  const turnDeadline = '2026-11-04T00:00:30Z'
  switch (kind) {
    case 'omok': {
      const state: Omok = { gameCode: 'OMOK', status: 'PLAYING', boardSize: 15,
        board: Array.from({ length: 15 }, () => Array(15).fill(0)), blackUserId: '101', whiteUserId: '102',
        turnUserId: '101', turnDeadline, moveCount: 2, lastMove: null, winnerUserId: null, endReason: null, endedAt: null }
      return { ...header, omok: { ...state, ...overrides } }
    }
    case 'dice': {
      const state: Farkle = { gameCode: 'DICE', status: 'PLAYING', players: ['101', '102'], scores: [100, 200],
        targetScore: 2000, turnUserId: '101', turnDeadline, turnTimeLimitMs: 30000, turnScore: 0, dice: [],
        stage: 'AWAITING_ROLL', rollId: 0, round: 1, hotDice: false, lastEvent: 'START', winnerUserId: null,
        endReason: null, endedAt: null }
      return { ...header, dice: { ...state, ...overrides } }
    }
    case 'onecard': {
      const state: OneCard = { gameCode: 'ONE_CARD', status: 'PLAYING', players: ['101', '102'].map(userId =>
        ({ userId, cardCount: 7, active: true, oneCardUntil: null, oneCardStatus: 'none' })),
        turnUserId: '101', turnDeadline, turnTimeLimitMs: 30000, direction: 1, stage: 'PLAYING', extraAction: false,
        topCard: { id: 'clubs-K', suit: 'clubs', rank: 'K' }, activeSuit: 'clubs', drawCount: 30,
        attackTotal: 0, lastAttack: null, turnCount: 8, winnerUserIds: [], endReason: null, endedAt: null }
      return { ...header, onecard: { ...state, ...overrides }, hand: null }
    }
    case 'bridge': return { ...header, bridge: { ...bridgeState(2), ...overrides }, secret: null }
    case 'ledger': return { ...header, ledger: { ...ledgerState(2), ...overrides } }
    case 'halli': return { ...header, halli: { ...parseHalliGalli(halliState(2)), ...overrides } }
    case 'alkkagi': {
      const payload = alkkagi.initial.payload
      return { ...header, alkkagi: { ...parseAlkkagi(payload.publicState, payload.gameId, payload.version), ...overrides }, alkkagiHand: null }
    }
  }
}
