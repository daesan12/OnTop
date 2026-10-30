import { useGame } from '../store'
import { forfeitBlocksInput } from '../forfeit'
import type { LedgerInput } from './protocol'
export function canActLedger(ownId: string, input: LedgerInput, now = Date.now()) {
  const s = useGame.getState(), g = s.game
  if (!g?.ledger || g.role !== 'PLAYER' || g.gameId !== s.permittedGameId || s.recovery !== 'RESTORED'
    || ['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '') || s.pending || s.uncertain
    || forfeitBlocksInput(g.gameId) || g.version < s.awaitingVersion) return false
  const l = g.ledger
  if (l.status !== 'PLAYING' || l.turnUserId !== ownId || Date.parse(l.turnDeadline!) <= now) return false
  if (input.kind === 'roll') {
    return l.rollCount < l.maxRolls && (l.rollCount > 0 || input.keepIds.length === 0)
      && new Set(input.keepIds).size === input.keepIds.length && input.keepIds.every(id => Number.isInteger(id) && id >= 0 && id <= 4)
  }
  return l.rollCount > 0 && l.players.find(p => p.userId === ownId)?.scores[input.category] === null
}
