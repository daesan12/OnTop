import { useGame } from './store'
import { OmokPanel } from './OmokPanel'
import { FarklePanel } from './farkle/FarklePanel'
import { OneCardPanel } from './onecard/OneCardPanel'

export function GamePanel() {
  const dice = useGame(s => !!s.game?.dice || (s.start?.gameCode === 'DICE' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const card = useGame(s => !!s.game?.onecard || (s.start?.gameCode === 'ONE_CARD' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  return card ? <OneCardPanel /> : dice ? <FarklePanel /> : <OmokPanel />
}
