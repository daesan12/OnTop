import { useGame } from '../store'
import { isSuit, type OneCardInput } from './protocol'

/** Only permission/expiry checks here. Legal cards, effects, shuffle and winners belong to BE. */
export function canUseOneCard(ownId: string) {
  const s = useGame.getState(), g = s.game
  return !!g?.onecard && g.role === 'PLAYER' && g.gameId === s.permittedGameId && s.recovery === 'RESTORED'
    && !['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '') && !s.pending && !s.uncertain
    && g.version >= s.awaitingVersion && g.onecard.status === 'PLAYING' && g.hand?.userId === ownId
    && g.onecard.players.some(p => p.userId === ownId && p.active)
}
export function canActOneCard(ownId: string, input: OneCardInput, now = Date.now()) {
  const g = useGame.getState().game
  if (!canUseOneCard(ownId) || !g?.onecard || !g.hand) return false
  const o = g.onecard
  const inWindow = (id: string) => o.players.some(p => p.userId === id && p.active && p.cardCount === 1
    && p.oneCardStatus === 'pending' && !!p.oneCardUntil && now < Date.parse(p.oneCardUntil))
  if (input.kind === 'declare-one') return Object.keys(input).length === 1 && inWindow(ownId)
  if (input.kind === 'catch-one') return Object.keys(input).length === 2 && input.targetUserId !== ownId && inWindow(input.targetUserId)
  if (o.turnUserId !== ownId || !o.turnDeadline || now >= Date.parse(o.turnDeadline)) return false
  if (input.kind === 'select-suit') return Object.keys(input).length === 2 && o.stage === 'CHOOSE_SUIT' && isSuit(input.suit)
  if (o.stage !== 'PLAYING') return false
  if (input.kind === 'play') return Object.keys(input).length === 2 && g.hand.playableCardIds.includes(input.cardId) && g.hand.hand.some(c => c.id === input.cardId)
  if (input.kind === 'draw') return Object.keys(input).length === 1 && g.hand.canDraw && o.attackTotal === 0
  return input.kind === 'accept-attack' && Object.keys(input).length === 1 && o.attackTotal > 0
}
