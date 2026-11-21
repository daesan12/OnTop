import { useGame } from '../store'
import { forfeitBlocksInput } from '../forfeit'
import type { ChessInput } from './protocol'

export function canUseChess(ownId: string) {
  const s = useGame.getState(), g = s.game
  return !!g?.chess && g.role === 'PLAYER' && g.gameId === s.permittedGameId && s.recovery === 'RESTORED'
    && !s.pending && !s.uncertain && !forfeitBlocksInput(g.gameId) && g.version >= s.awaitingVersion
    && !['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '') && g.chess.status === 'PLAYING'
    && [g.chess.whiteUserId, g.chess.blackUserId].includes(ownId)
}
export function canActChess(ownId: string, input: ChessInput) {
  const c = useGame.getState().game?.chess
  if (!c || !canUseChess(ownId)) return false
  if (input.kind === 'drawOffer') return !c.drawOfferedBy && !c.drawOffersUsed.includes(ownId)
  if (input.kind === 'drawRespond') return !!c.drawOfferedBy && c.drawOfferedBy !== ownId
  if (c.turnUserId !== ownId) return false
  if (input.kind === 'claimDraw') return c.canClaimDraw || !!input.from && c.legalMoves.some(m => m.from === input.from && m.to === input.to && m.promotion === (input.promotion ?? null))
  return c.legalMoves.some(m => m.from === input.from && m.to === input.to && m.promotion === (input.promotion ?? null))
}
