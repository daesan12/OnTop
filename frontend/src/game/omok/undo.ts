import { useGame } from '../store'
import { forfeitBlocksInput } from '../forfeit'
import { estimatedServerTime } from '../../network/worldClient'

export type OmokUndoInput = { kind: 'undoRequest' } | { kind: 'undoRespond'; requestId: string; accept: boolean }

export function canUndoAction(own: string, input: OmokUndoInput, now = estimatedServerTime()) {
  const s = useGame.getState(), g = s.game, o = g?.omok
  if (!o || g.role !== 'PLAYER' || g.gameId !== s.permittedGameId || s.recovery !== 'RESTORED'
    || ![o.blackUserId, o.whiteUserId].includes(own) || s.pending || s.uncertain || forfeitBlocksInput(g.gameId)
    || g.version < s.awaitingVersion || ['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '')
    || o.status !== 'PLAYING' || o.undo === undefined || o.draw) return false
  if (input.kind === 'undoRequest') return !o.undo && o.moveCount >= 2 && o.turnUserId === own
    && (!o.coinTossEndsAt || Date.parse(o.coinTossEndsAt) <= now) && Date.parse(o.turnDeadline!) > now
  return !!o.undo && o.undo.requesterUserId !== own && o.undo.requestId === input.requestId
    && Date.parse(o.undo.deadline) > now
}
