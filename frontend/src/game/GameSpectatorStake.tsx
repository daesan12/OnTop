import { useSession } from '../network/worldClient'
import { gameState } from './protocol'
import { matchStakeDetails, stakeLabel } from './stake'
import { useGame } from './store'

/** Public match terms only; no personal balances or settlement receipts. */
export function GameSpectatorStake() {
  const game = useGame(s => s.game)
  const tables = useSession(s => s.tableStates)
  const publicTables = useSession(s => s.tables)
  if (game?.role !== 'SPECTATOR' || gameState(game).status !== 'PLAYING') return null
  const stake = matchStakeDetails(game, tables, publicTables)
  return <div className="game-spectator-stake" role="status" aria-label="관전 경기 판돈">
    <div><span>총 판돈</span><strong>{stake ? stakeLabel(stake.total) : '확인 중'}</strong></div>
    <small>{stake ? `1인 ${stakeLabel(stake.perPlayer)} × ${stake.participants}명` : '확정된 판돈을 기다리고 있어요'}</small>
  </div>
}
