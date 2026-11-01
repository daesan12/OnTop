import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { alkkagiSocialView, useAlkkagiSocial } from './spectatorEvents'

/** DOM 글자는 화면 픽셀로 선명하게 표시하고 위치만 실제 3D 표시에 맞춘다. */
export const alkkagiLabelElements = new Map<string, HTMLSpanElement>()
export function AlkkagiSpectatorLabels() {
  useAlkkagiSocial(s => s.marks)
  const game = useGame(s => s.game?.alkkagi)
  const profiles = useSession(s => s.profiles), own = useSession(s => s.sessionId)
  if (!game || game.stage !== 'AIMING') return null
  const view = alkkagiSocialView(game.gameId, game.turnNumber, true, own)
  const labels = [...view.cursors.map(c => ({ ...c, kind: 'CURSOR' })), ...view.advice.map(a => ({ ...a, kind: 'ADVICE' }))]
  return <div className="alkkagi-spectator-labels" aria-label="관전자 훈수 이름">
    {labels.map(mark => <span key={mark.id}
        className="alkkagi-spectator-label" ref={el => {
          if (el) alkkagiLabelElements.set(mark.id, el); else alkkagiLabelElements.delete(mark.id)
        }}>
        {profiles[mark.label]?.nickname ?? '관전자'}{mark.kind === 'ADVICE' ? ' · 훈수' : ''}
      </span>)}
  </div>
}
