import type { Snapshot } from './replay'

export const remainingMatchTime = (deadline: number, now: number) => {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export type UsedCard = NonNullable<Snapshot['itemEffects']>[number]
/** First/reconnected snapshots establish a baseline; only new, fresh approvals animate. */
export class UsedCardTimeline {
  private gameId = ''
  private version = -1
  accept(gameId: string, effects: readonly UsedCard[], now: number): UsedCard[] {
    const highest = Math.max(this.version, ...effects.map(effect => effect.version))
    if (this.gameId !== gameId) { this.gameId = gameId; this.version = Math.max(-1, ...effects.map(e => e.version)); return [] }
    const added = effects.filter(e => e.version > this.version && e.at <= now + 500 && now - e.at < 4000)
      .sort((a, b) => a.version - b.version)
    this.version = highest
    return added
  }
}
