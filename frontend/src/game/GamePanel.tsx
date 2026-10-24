import { useGame } from './store'
import { OmokPanel } from './OmokPanel'
import { FarklePanel } from './farkle/FarklePanel'

export function GamePanel() {
  const dice = useGame(s => !!s.game?.dice || (s.start?.gameCode === 'DICE' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  return dice ? <FarklePanel /> : <OmokPanel />
}
