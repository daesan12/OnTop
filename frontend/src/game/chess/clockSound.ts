import type { Game } from '../protocol'

const thresholds = [30_000, 10_000]

/** Watch the server-backed clock locally; never send an action or infer a timeout. */
export class ChessClockSound {
  private key = ''
  private passed = new Set<number>()
  private previous: { now: number; remaining: number; active: boolean } | null = null

  update(game: Game | null, ownId: string, now: number, live: boolean, visible: boolean): 'chess-time-warning' | null {
    const chess = game?.chess
    if (!game || !chess || chess.status !== 'PLAYING' || game.role !== 'PLAYER'
      || ![chess.whiteUserId, chess.blackUserId].includes(ownId)) {
      this.key = ''; this.passed.clear(); this.previous = null
      return null
    }
    const key = `${game.gameId}:${ownId}`
    if (this.key !== key) { this.key = key; this.passed.clear(); this.previous = null }
    const active = chess.turnUserId === ownId
    const remaining = active ? Date.parse(chess.turnDeadline ?? '') - now
      : chess.remainingMs[ownId === chess.whiteUserId ? 0 : 1]
    if (!Number.isFinite(now) || !Number.isFinite(remaining)) { this.previous = null; return null }
    const previous = this.previous, elapsed = previous ? now - previous.now : 0
    const spent = previous ? previous.remaining - remaining : 0
    // Recovery, background throttling and clock corrections establish a silent baseline.
    const continuous = live && visible && active && previous?.active
      && elapsed > 0 && elapsed <= 1500 && spent >= 0 && spent <= elapsed + 250
    let cue: 'chess-time-warning' | null = null
    for (const threshold of thresholds) if (remaining <= threshold) {
      if (!this.passed.has(threshold) && continuous && remaining > 0 && previous!.remaining > threshold)
        cue = 'chess-time-warning'
      this.passed.add(threshold)
    }
    this.previous = live && visible ? { now, remaining, active } : null
    return cue
  }
}
