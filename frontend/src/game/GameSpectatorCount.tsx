import { useSession } from '../network/worldClient'
import { useGame } from './store'
import { gameState } from './protocol'
import './gameSpectatorCount.css'

export function GameSpectatorCount() {
  const game = useGame(s => s.game)
  const watching = useSession(s => s.gameWatches)
  if (!game || gameState(game)?.status !== 'PLAYING') return null
  const count = Object.values(watching).filter(w => w.gameId === game.gameId).length
  return <GameSpectatorBadge count={count} />
}

export function GameSpectatorBadge({ count }: { count: number }) {
  const formatted = new Intl.NumberFormat('ko-KR').format(count)
  return <span className="game-spectator-count" role="status" aria-live="polite" aria-atomic="true" aria-label={`현재 관전자 ${formatted}명`}>
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.6"/></svg>
    <span key={count} className="game-spectator-number">{formatted}<small>명 관전 중</small></span>
  </span>
}
