import type { Game } from '../protocol'

export function waitingForChessFinish(game: Game | null, watchedId: string, tableCode: string | null | undefined, tableGameId: string | null | undefined) {
  return !!watchedId && game?.gameId === watchedId && game.role === 'SPECTATOR' && game.chess?.status === 'PLAYING'
    && tableCode === 'CHESS' && tableGameId === null
}

/** A single bounded wait for the already-authorized final push, never an input or watch grant. */
export class ChessSpectatorFinishWait {
  private gameId = ''
  private expired = false
  private timer: ReturnType<typeof setTimeout> | undefined
  hold(gameId: string, onExpired: () => void) {
    if (gameId !== this.gameId) {
      this.reset(); this.gameId = gameId
      this.timer = setTimeout(() => { this.timer = undefined; this.expired = true; onExpired() }, 1200)
    }
    return !this.expired
  }
  reset() { clearTimeout(this.timer); this.timer = undefined; this.gameId = ''; this.expired = false }
}
