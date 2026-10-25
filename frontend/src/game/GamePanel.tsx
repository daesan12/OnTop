import { useGame } from './store'
import { OmokPanel } from './OmokPanel'
import { FarklePanel } from './farkle/FarklePanel'
import { OneCardPanel } from './onecard/OneCardPanel'
import { BridgePanel } from './bridge/BridgePanel'

export function GamePanel() {
  const dice = useGame(s => !!s.game?.dice || (s.start?.gameCode === 'DICE' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const card = useGame(s => !!s.game?.onecard || (s.start?.gameCode === 'ONE_CARD' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  const bridge = useGame(s => !!s.game?.bridge || (s.start?.gameCode === 'LIAR_BRIDGE' && ['PLAYING', 'SETTLING'].includes(s.start.phase)))
  return bridge ? <BridgePanel /> : card ? <OneCardPanel /> : dice ? <FarklePanel /> : <OmokPanel />
}
