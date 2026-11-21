import type { GatheringModel } from '../../features/tableLobby/gatheringModel'
import { useGame } from '../store'

/** A server-confirmed checkmate with one winner; settlement is handled by the common result screen. */
export function chessCheckmateWinner(model: Pick<GatheringModel, 'gameCode' | 'finished' | 'invalid' | 'endReason' | 'rows'>) {
  if (model.gameCode !== 'CHESS' || !model.finished || model.invalid || model.endReason !== 'CHECKMATE') return null
  const winners = model.rows.filter(row => row.winner && row.playerId)
  return winners.length === 1 ? winners[0] : null
}

export type SpectatorCheckmate = { gameId: string; winnerId: string; side: '백' | '흑' }
/** Capture before the common automatic unwatch clears the snapshot in the same event batch. */
export function observeSpectatorCheckmate(show: (victory: SpectatorCheckmate) => void) {
  let shown = ''
  const sync = () => {
    const game = useGame.getState().game, chess = game?.chess
    if (game?.role !== 'SPECTATOR' || !chess || chess.status !== 'FINISHED' || chess.endReason !== 'CHECKMATE'
      || !chess.winnerUserId || shown === game.gameId) return
    shown = game.gameId
    show({ gameId: game.gameId, winnerId: chess.winnerUserId, side: chess.winnerUserId === chess.whiteUserId ? '백' : '흑' })
  }
  sync()
  return useGame.subscribe(sync)
}
