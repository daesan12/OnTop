import { gamePlayers, gameState, type Game } from '../protocol'

export type DefeatKind = 'head-clutch' | 'table-flip'
export const DEFEAT_DURATION = { 'head-clutch': 3600, 'table-flip': 2800 } as const
export interface DefeatReaction {
  key: string; gameId: string; userId: string; kind: DefeatKind; at: number
}

/** Remaining participants, not starting seats or number of pawns. Public flags only. */
export function remainingPlayers(game: Game) {
  if (game.onecard) return game.onecard.players.filter(p => p.active).map(p => p.userId)
  if (game.bridge) return game.bridge.players.filter(p => !p.forfeited && !p.pendingForfeit).map(p => p.userId)
  return gamePlayers(game)
}
function winners(game: Game): string[] {
  if (game.onecard) return game.onecard.winnerUserIds
  if (game.bridge) return game.bridge.winnerUserIds
  const winner = game.omok?.winnerUserId ?? game.dice?.winnerUserId
  return winner ? [winner] : []
}

/** Consumes already validated display states. Never predicts a defeat from an input/receipt. */
export class DefeatTimeline {
  private seen = new Set<string>()
  readonly playing = new Map<string, DefeatReaction>()
  clear() { this.seen.clear(); this.playing.clear() }
  stop(userId: string) { this.playing.delete(userId) }
  observe(previous: Game | null, next: Game | null, now: number) {
    if (!next || previous?.gameId !== next.gameId) this.playing.clear()
    if (!previous || !next || previous.gameId !== next.gameId || previous.role !== next.role
      || next.version !== previous.version + 1 || gameState(previous).status !== 'PLAYING') return
    const members = gamePlayers(previous), nextMembers = gamePlayers(next)
    if (members.length !== nextMembers.length || members.some(id => !nextMembers.includes(id))) return
    const before = remainingPlayers(previous), after = remainingPlayers(next)
    const state = gameState(next), finished = state.status === 'FINISHED', won = finished ? winners(next) : []
    // No winner is a draw/invalid/aborted game, never a locally invented loss.
    const lost = before.filter(id => !after.includes(id) || finished && won.length > 0 && !won.includes(id))
    for (const userId of lost) {
      const key = JSON.stringify([next.gameId, userId])
      if (this.seen.has(key)) continue
      this.seen.add(key)
      if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!)
      const kind = before.length === 2 ? 'table-flip' : 'head-clutch'
      const at = finished && state.endedAt ? Date.parse(state.endedAt) : now
      if (!Number.isFinite(at) || at > now + 5000 || now - at >= DEFEAT_DURATION[kind]) continue
      this.playing.set(userId, { key, gameId: next.gameId, userId, kind, at })
    }
  }
}
