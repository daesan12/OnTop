import { useGame } from '../store'
import { forfeitBlocksInput } from '../forfeit'
import type { BridgeInput } from './protocol'
export function canActBridge(ownId: string, input: BridgeInput, now = Date.now()) {
  const s = useGame.getState(), g = s.game
  if (!g?.bridge || g.role !== 'PLAYER' || g.gameId !== s.permittedGameId || s.recovery !== 'RESTORED'
    || ['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '') || s.pending || s.uncertain || forfeitBlocksInput(g.gameId) || g.version < s.awaitingVersion) return false
  const b = g.bridge, own = b.players.find(p => p.userId === ownId)
  if (!own || own.forfeited || own.pendingForfeit || b.status !== 'PLAYING' || !b.turnDeadline || now >= Date.parse(b.turnDeadline)) return false
  if (input.kind === 'roll') return Object.keys(input).length === 1 && b.stage === 'AWAITING_ROLL' && b.turnUserId === ownId
  if (input.kind === 'declare') return Object.keys(input).length === 2 && b.stage === 'DECLARING' && b.turnUserId === ownId
    && !!g.secret && g.secret.userId === ownId && g.secret.turnId === b.turnId && Number.isInteger(input.value) && input.value >= 1 && input.value <= 4
  return (input.kind === 'trust' || input.kind === 'doubt') && Object.keys(input).length === 1 && b.stage === 'RESPONDING' && b.responderUserId === ownId
}
