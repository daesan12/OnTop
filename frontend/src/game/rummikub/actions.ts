import { forfeitBlocksInput } from '../forfeit'
import { useGame } from '../store'
import type { RummikubInput } from './protocol'

export function canActRummikub(own: string, _input: RummikubInput, now = Date.now()) {
  const s = useGame.getState(), g = s.game
  return !!g?.rummikub && g.role === 'PLAYER' && g.gameId === s.permittedGameId
    && s.recovery === 'RESTORED' && !s.pending && !s.uncertain && !forfeitBlocksInput(g.gameId)
    && g.version >= s.awaitingVersion && !['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '')
    && g.rummikub.status === 'PLAYING' && g.rummikub.turnUserId === own
    && Date.parse(g.rummikub.turnDeadline!) > now
}
