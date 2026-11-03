import { useSession } from '../network/worldClient'
import { useGame } from './store'

export function GameSpectatorCount() {
  const game = useGame(s => s.game)
  const watching = useSession(s => s.gameWatches)
  if (!game) return null
  const count = Object.values(watching).filter(w => w.gameId === game.gameId).length
  return <div className="game-spectator-count" role="status" style={{ position:'fixed',right:20,top:90,zIndex:30,
    borderRadius:12,padding:'6px 12px',background:'#12372ddb',color:'#fff1ca',pointerEvents:'none' }}>관전 {count}명</div>
}
